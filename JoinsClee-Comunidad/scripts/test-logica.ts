// ============================================================================
//  Test de la lógica de parseo y clasificación, sin red ni credenciales.
//    deno test --allow-net=0.0.0.0 scripts/test-logica.ts
//  (--allow-net es solo porque skool.ts importa fetch; ningún test lo llama)
// ============================================================================
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Se re-declaran aquí las dos funciones puras que importan, idénticas a las de
// _shared/skool.ts y skool-ghl-sync/index.ts, para poder probarlas aisladas.
// Si cambian allí, este test debe cambiar con ellas — a propósito.

function parseMmbp(node: any) {
  const raw = node?.member?.metadata?.mmbp ?? node?.metadata?.mmbp;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return {
        tier: typeof p?.tier === 'string' && p.tier.trim() ? p.tier.trim() : null,
        interval: typeof p?.recurring_interval === 'string' ? p.recurring_interval : null,
        trial: p?.isFreeTrial === true || p?.is_free_trial === true,
      };
    } catch { /* fallbacks */ }
  }
  const fb = node?.level?.name ?? node?.member?.level?.name ?? node?.tier ?? null;
  return { tier: typeof fb === 'string' && fb.trim() ? fb.trim() : null, interval: null, trial: false };
}

function unixSecToIso(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e11 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function nanoToIso(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n / 1e6);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type M = {
  email: string; tier: string | null; recurring_interval: string | null;
  is_lifetime: boolean; is_free_trial: boolean;
  billing_canceled: boolean; billing_declined: boolean;
  churn_at: string | null; final_retry_at: string | null;
  churned_at: string | null; banned_at: string | null; tab: string;
};

function parseMember(node: any, tab: string): M | null {
  const member = node?.member ?? {};
  const md = member?.metadata ?? node?.metadata ?? {};
  const rawEmail = md?.mbme ?? member?.inviteEmail ?? node?.email ?? node?.user?.email ?? md?.email;
  const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
  if (!email || !email.includes('@')) return null;
  const { tier, interval, trial } = parseMmbp(node);
  return {
    email, tier, recurring_interval: interval,
    is_lifetime: typeof interval === 'string' && /lifetime/i.test(interval),
    is_free_trial: trial,
    billing_canceled: Boolean(member?.billingCanceled),
    billing_declined: Boolean(member?.billingDeclined),
    churn_at: unixSecToIso(md?.mbscpe),
    final_retry_at: unixSecToIso(md?.mbsfprt),
    churned_at: member?.churned ? new Date(String(member.churned)).toISOString() : null,
    banned_at: nanoToIso(md?.bannedAt),
    tab,
  };
}

function resolveStatus(m: M): string {
  if (m.tab === 'banned' || m.banned_at) return 'banned';
  if (m.tab === 'churned' || m.churned_at) return 'churned';
  if (m.billing_declined) return 'declined';
  if (m.billing_canceled || m.tab === 'cancelling') return 'cancelling';
  return 'active';
}

const PRECEDENCE: Record<string, number> = { active: 0, cancelling: 1, declined: 2, churned: 3, banned: 4 };

function collapse(rows: Array<{ node: any; tab: string }>): Map<string, M & { status: string }> {
  const out = new Map<string, M & { status: string }>();
  for (const { node, tab } of rows) {
    const m = parseMember(node, tab);
    if (!m) continue;
    const status = resolveStatus(m);
    const prev = out.get(m.email);
    if (!prev || PRECEDENCE[status] > PRECEDENCE[prev.status]) out.set(m.email, { ...m, status });
    else if (prev) {
      prev.churn_at ??= m.churn_at;
      prev.churned_at ??= m.churned_at;
      prev.tier ??= m.tier;
    }
  }
  return out;
}

// ── Fixtures con la forma real del JSON de Skool ────────────────────────────
const activo = {
  id: 'u-activa', firstName: 'Marcela', lastName: 'Ríos',
  member: { metadata: { mbme: 'Marcela.Rios@Gmail.com', mmbp: '{"currency":"usd","amount":2700,"recurring_interval":"month","model":"freemium","tier":"premium"}' } },
};
const cancelando = {
  id: 'u-cancel', firstName: 'Daniela',
  member: {
    billingCanceled: true,
    metadata: { mbme: 'daniela@ejemplo.com', mbscpe: 1790000000, mmbp: '{"tier":"standard","recurring_interval":"month"}' },
  },
};
const rechazado = {
  id: 'u-decl',
  member: { billingDeclined: true, metadata: { mbme: 'pago@ejemplo.com', mbsfprt: 1790500000 } },
};
const dadoDeBaja = {
  id: 'u-churn',
  member: { churned: '2026-08-24T10:00:00.000Z', metadata: { mbme: 'fuera@ejemplo.com', mmbp: '{"tier":"premium"}' } },
};
const expulsado = {
  id: 'u-ban',
  member: { metadata: { mbme: 'ban@ejemplo.com', bannedAt: 1787000000000000000 } },
};
const lifetime = {
  id: 'u-life',
  member: { metadata: { mbme: 'life@ejemplo.com', mmbp: '{"tier":"vip","recurring_interval":"X0.LIFETIME"}' } },
};
const sinEmail = { id: 'u-none', member: { metadata: {} } };
const mmbpRoto = { id: 'u-roto', member: { metadata: { mbme: 'roto@ejemplo.com', mmbp: '{no es json' } }, level: { name: 'Fundador' } };

// ── Tests ───────────────────────────────────────────────────────────────────

Deno.test('el email se normaliza a minúsculas', () => {
  assertEquals(parseMember(activo, 'active')!.email, 'marcela.rios@gmail.com');
});

Deno.test('el plan sale de mmbp.tier', () => {
  assertEquals(parseMember(activo, 'active')!.tier, 'premium');
});

Deno.test('un mmbp corrupto cae al fallback en vez de romper', () => {
  const m = parseMember(mmbpRoto, 'active')!;
  assertEquals(m.tier, 'Fundador');
});

Deno.test('un registro sin email se descarta', () => {
  assertEquals(parseMember(sinEmail, 'active'), null);
});

Deno.test('lifetime se detecta por recurring_interval', () => {
  assertEquals(parseMember(lifetime, 'active')!.is_lifetime, true);
  assertEquals(parseMember(activo, 'active')!.is_lifetime, false);
});

Deno.test('mbscpe (segundos) se convierte a fecha correcta', () => {
  assertEquals(parseMember(cancelando, 'cancelling')!.churn_at, new Date(1790000000 * 1000).toISOString());
});

Deno.test('bannedAt viene en nanosegundos y se divide por 1e6', () => {
  assertEquals(parseMember(expulsado, 'banned')!.banned_at, new Date(1787000000000).toISOString());
});

Deno.test('clasificación: cada pestaña da su estado', () => {
  assertEquals(resolveStatus(parseMember(activo, 'active')!), 'active');
  assertEquals(resolveStatus(parseMember(cancelando, 'cancelling')!), 'cancelling');
  assertEquals(resolveStatus(parseMember(rechazado, 'cancelling')!), 'declined');
  assertEquals(resolveStatus(parseMember(dadoDeBaja, 'churned')!), 'churned');
  assertEquals(resolveStatus(parseMember(expulsado, 'banned')!), 'banned');
});

Deno.test('REGLA CRÍTICA: quien canceló pero sigue en active NO se marca activo', () => {
  // Este es el escenario que rompe el diff ingenuo: Skool puede seguir
  // mostrando en `active` a alguien que ya canceló. El campo billingCanceled
  // manda sobre la pestaña.
  const m = parseMember(cancelando, 'active')!;
  assertEquals(resolveStatus(m), 'cancelling');
});

Deno.test('REGLA CRÍTICA: cancelling nunca escala a churned por sí solo', () => {
  const colapsado = collapse([
    { node: cancelando, tab: 'active' },
    { node: cancelando, tab: 'cancelling' },
  ]);
  assertEquals(colapsado.get('daniela@ejemplo.com')!.status, 'cancelling');
});

Deno.test('si alguien sale en dos pestañas, gana el estado más avanzado', () => {
  const colapsado = collapse([
    { node: { ...dadoDeBaja, member: { ...dadoDeBaja.member, churned: undefined } }, tab: 'active' },
    { node: dadoDeBaja, tab: 'churned' },
  ]);
  assertEquals(colapsado.get('fuera@ejemplo.com')!.status, 'churned');
  // El orden inverso da el mismo resultado: la precedencia no depende del barrido.
  const inverso = collapse([
    { node: dadoDeBaja, tab: 'churned' },
    { node: { ...dadoDeBaja, member: { ...dadoDeBaja.member, churned: undefined } }, tab: 'active' },
  ]);
  assertEquals(inverso.get('fuera@ejemplo.com')!.status, 'churned');
});

Deno.test('colapsar rellena huecos entre pestañas del mismo nivel', () => {
  const sinFecha = { id: 'x', member: { billingCanceled: true, metadata: { mbme: 'daniela@ejemplo.com' } } };
  const colapsado = collapse([
    { node: sinFecha, tab: 'cancelling' },
    { node: cancelando, tab: 'cancelling' },
  ]);
  const m = colapsado.get('daniela@ejemplo.com')!;
  assertEquals(m.churn_at, new Date(1790000000 * 1000).toISOString());
  assertEquals(m.tier, 'standard');
});

Deno.test('un ban gana sobre todo lo demás', () => {
  const colapsado = collapse([
    { node: expulsado, tab: 'active' },
    { node: expulsado, tab: 'banned' },
  ]);
  assertEquals(colapsado.get('ban@ejemplo.com')!.status, 'banned');
});
