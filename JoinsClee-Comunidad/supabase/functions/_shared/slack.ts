// ============================================================================
//  Slack · notificaciones del sync
// ============================================================================
//  Tres reglas que vienen de cómo falla esto en la práctica:
//
//  1. UN mensaje agregado por corrida, nunca uno por miembro. El límite de un
//     incoming webhook es 1 msg/s: con 20 bajas se dispara el 429 y, peor, se
//     spamea el canal hasta que alguien lo silencia.
//
//  2. Botones solo de tipo `url`. Los botones interactivos de Slack exigen un
//     endpoint público que reciba el callback, verifique la firma y responda
//     en 3 s. Para esto no hace falta: el botón abre el panel de admin y la
//     acción se confirma ahí, con cero superficie de ataque nueva.
//
//  3. Silencio cuando no hay nada. Un canal que avisa "0 bajas hoy" todos los
//     días se vuelve ruido y deja de leerse. En su lugar, un latido verde
//     semanal que sirve de dead-man's switch: si el lunes no llega, el cron
//     está caído.
//
//  El payload lleva emails de clientes → el canal debe ser PRIVADO.
// ============================================================================

export type SlackConfig = { webhookUrl: string; panelUrl?: string };

export type BajaLine = {
  nombre: string;
  email: string;
  tier: string | null;
  motivo: string;
  locationId: string | null;
  detalle?: string;
};

const MAX_LISTED = 15;  // más allá de esto Slack trunca el bloque

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function post(cfg: SlackConfig, payload: unknown): Promise<boolean> {
  if (!cfg.webhookUrl) return false;
  try {
    const r = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.status === 429) {
      const wait = Number(r.headers.get('Retry-After') ?? '1');
      await new Promise((res) => setTimeout(res, Math.min(wait, 10) * 1000));
      const retry = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return retry.ok;
    }
    if (!r.ok) console.error('slack:', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.error('slack falló:', e);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Aviso de bajas · el mensaje principal del sistema
// ────────────────────────────────────────────────────────────────────────────
export async function notifyRevocations(
  cfg: SlackConfig,
  args: {
    revocar: BajaLine[];      // ya perdieron acceso → hay que revocar
    cancelando: BajaLine[];   // cancelaron pero aún tienen acceso → solo avisar
    sinCuenta: BajaLine[];    // activos sin sub-cuenta de GHL → hay que darles el bono
    dryRun: boolean;
    resumen: { activos: number; cancelando: number; churned: number };
  },
): Promise<boolean> {
  const { revocar, cancelando, sinCuenta, dryRun, resumen } = args;
  if (revocar.length === 0 && cancelando.length === 0 && sinCuenta.length === 0) return false;

  const blocks: any[] = [];
  const urgente = revocar.length > 0;

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: urgente
        ? `🚨 ${revocar.length} acceso${revocar.length === 1 ? '' : 's'} de GHL por revocar`
        : `📋 Comunidad JoinsClee · novedades`,
      emoji: true,
    },
  });

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text:
        `*${resumen.activos}* activos · *${resumen.cancelando}* cancelando · *${resumen.churned}* dados de baja` +
        (dryRun ? '  ·  🧪 _modo simulación: no se tocó nada en GHL_' : ''),
    }],
  });

  const section = (titulo: string, lineas: BajaLine[], render: (b: BajaLine) => string) => {
    if (lineas.length === 0) return;
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${titulo}*` } });
    const shown = lineas.slice(0, MAX_LISTED);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: shown.map(render).join('\n') },
    });
    if (lineas.length > MAX_LISTED) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_…y ${lineas.length - MAX_LISTED} más. La lista completa está en el panel._` }],
      });
    }
  };

  section(
    `Salieron de la comunidad — revocar acceso (${revocar.length})`,
    revocar,
    (b) => `• *${esc(b.nombre)}* · \`${esc(b.email)}\`${b.tier ? ` · _${esc(b.tier)}_` : ''}\n   ${esc(b.motivo)}${b.locationId ? ` · sub-cuenta \`${esc(b.locationId)}\`` : ' · ⚠️ *sin sub-cuenta mapeada*'}`,
  );

  section(
    `Cancelaron pero aún tienen acceso — no tocar todavía (${cancelando.length})`,
    cancelando,
    (b) => `• ${esc(b.nombre)} · \`${esc(b.email)}\` · ${esc(b.motivo)}`,
  );

  section(
    `Activos sin cuenta de GHL — falta entregarles el bono (${sinCuenta.length})`,
    sinCuenta,
    (b) => `• ${esc(b.nombre)} · \`${esc(b.email)}\`${b.tier ? ` · _${esc(b.tier)}_` : ''}`,
  );

  const buttons: any[] = [];
  if (cfg.panelUrl) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: urgente ? 'Revisar y revocar' : 'Abrir panel', emoji: true },
      url: cfg.panelUrl,
      style: urgente ? 'danger' : undefined,
    });
  }
  buttons.push({
    type: 'button',
    text: { type: 'plain_text', text: 'Panel de agencia GHL', emoji: true },
    url: 'https://app.gohighlevel.com/',
  });
  blocks.push({ type: 'actions', elements: buttons });

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: 'Nadie se revoca solo: el sistema detecta y avisa, la revocación la confirma una persona desde el panel.',
    }],
  });

  return await post(cfg, {
    text: urgente
      ? `${revocar.length} acceso(s) de GHL por revocar en la comunidad JoinsClee`
      : 'Novedades de la comunidad JoinsClee',
    attachments: [{ color: urgente ? '#D64545' : '#3D7BD9', blocks }],
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Alerta operativa · el sync abortó o algo se rompió
// ────────────────────────────────────────────────────────────────────────────
export async function notifyAlert(
  cfg: SlackConfig,
  args: { kind: string; message: string; severity?: 'warn' | 'error'; detail?: string },
): Promise<boolean> {
  const isError = (args.severity ?? 'error') === 'error';
  return await post(cfg, {
    text: `${isError ? '🔴' : '🟡'} Sync Skool→GHL: ${args.message}`,
    attachments: [{
      color: isError ? '#D64545' : '#E0A030',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${isError ? '🔴' : '🟡'} El sync Skool → GHL se detuvo*\n\`${esc(args.kind)}\`\n\n${esc(args.message)}`,
          },
        },
        ...(args.detail ? [{
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '```' + esc(args.detail).slice(0, 1500) + '```' }],
        }] : []),
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: '_No se revocó ningún acceso en esta corrida. El sistema prefiere no hacer nada antes que hacer algo mal._',
          }],
        },
      ],
    }],
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Latido semanal · dead-man's switch. Si el lunes no llega, el cron murió.
// ────────────────────────────────────────────────────────────────────────────
export async function notifyHeartbeat(
  cfg: SlackConfig,
  args: { activos: number; cancelando: number; sinCuenta: number; pendientes: number },
): Promise<boolean> {
  return await post(cfg, {
    text: 'Comunidad JoinsClee · latido semanal del sync',
    attachments: [{
      color: '#3FA45B',
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*🟢 Sync Skool → GHL operativo*\n' +
            `${args.activos} miembros activos · ${args.cancelando} cancelando · ` +
            `${args.sinCuenta} sin cuenta de GHL · ${args.pendientes} revocaciones pendientes`,
        },
      }, {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_Si un lunes no llega este mensaje, el cron está caído._' }],
      }],
    }],
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Confirmación de una revocación ejecutada desde el panel
// ────────────────────────────────────────────────────────────────────────────
export async function notifyRevokeDone(
  cfg: SlackConfig,
  args: {
    email: string; nombre: string; locationId: string | null;
    usersDeleted: number; locationAction: string; by: string; ok: boolean; error?: string;
  },
): Promise<boolean> {
  return await post(cfg, {
    text: `Revocación ${args.ok ? 'ejecutada' : 'fallida'}: ${args.email}`,
    attachments: [{
      color: args.ok ? '#3FA45B' : '#D64545',
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*${args.ok ? '✅ Acceso revocado' : '❌ Falló la revocación'}*\n` +
            `${esc(args.nombre)} · \`${esc(args.email)}\`\n` +
            `${args.usersDeleted} usuario(s) borrado(s)` +
            (args.locationId ? ` · sub-cuenta \`${esc(args.locationId)}\`` : '') +
            `\n\n${esc(args.locationAction)}` +
            (args.error ? `\n\n_Error:_ \`${esc(args.error).slice(0, 400)}\`` : ''),
        },
      }, {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Confirmado por *${esc(args.by)}*` }],
      }],
    }],
  });
}
