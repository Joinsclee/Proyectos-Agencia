/**
 * Una variable que existe pero está vacía no debe tumbar el servidor.
 *
 * En un panel de despliegue lo normal es crear la variable y dejarla en blanco
 * hasta tener el valor. Pero `.optional()` de Zod solo acepta `undefined`,
 * nunca `''`, así que `RESEND_API_KEY=` (presente y vacía) fallaba el
 * `.min(10)` y el servidor ENTERO no arrancaba con «Configuración .env
 * incompleta» — cuando lo único que pasaba era que el correo no estaba
 * configurado todavía, un caso que el código ya sabe degradar:
 * `emailDeliveryReady()` devuelve false y las alertas se guardan sin enviar.
 *
 * Se descubrió el 20 de octubre de 2026 montando el proyecto de Supabase nuevo:
 * añadir las tres variables de correo en blanco al `.env` dejó 20 pruebas en
 * rojo y habría dejado producción sin arrancar.
 *
 * La prueba corre en subproceso porque `lib/env.ts` valida al importarse: una
 * vez cargado en este proceso, cambiar `process.env` ya no cambia nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** Arranca un proceso que importa `env` con el entorno dado. */
function importarEnvCon(extra: Record<string, string>): { ok: boolean; salida: string } {
  const minimo = {
    SUPABASE_URL: 'https://ejemplo.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
  };
  try {
    const salida = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '-e',
       "import('./lib/env.ts').then(m => console.log(JSON.stringify({" +
       "resend: m.env.RESEND_API_KEY ?? null, from: m.env.ALERTS_FROM_EMAIL ?? null," +
       "pais: m.env.DEFAULT_COUNTRY_CODE})))"],
      { env: { ...process.env, ...minimo, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, salida };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    return { ok: false, salida: String(err.stderr ?? '') + String(err.stdout ?? '') };
  }
}

test('las variables opcionales vacías no impiden arrancar', () => {
  const r = importarEnvCon({
    RESEND_API_KEY: '',
    ALERTS_FROM_EMAIL: '',
    ALERTS_CRON_SECRET: '',
    RADAR_COMUNIDAD_URL: '',
    RADAR_ASISTENTE_SECRETO: '',
  });
  assert.equal(r.ok, true, `no arrancó con variables vacías:\n${r.salida}`);
  const leido = JSON.parse(r.salida.trim().split('\n').pop() as string);
  // vacía = ausente, no cadena vacía: el código pregunta por su presencia
  assert.equal(leido.resend, null);
  assert.equal(leido.from, null);
});

test('una variable con solo espacios cuenta igual que vacía', () => {
  const r = importarEnvCon({ ALERTS_FROM_EMAIL: '   ' });
  assert.equal(r.ok, true, `no arrancó con espacios:\n${r.salida}`);
  assert.equal(JSON.parse(r.salida.trim().split('\n').pop() as string).from, null);
});

test('los valores por defecto siguen aplicándose con la variable vacía', () => {
  const r = importarEnvCon({ DEFAULT_COUNTRY_CODE: '' });
  assert.equal(r.ok, true, r.salida);
  assert.equal(JSON.parse(r.salida.trim().split('\n').pop() as string).pais, 'CO');
});

test('una variable obligatoria vacía SÍ impide arrancar', () => {
  // Lo contrario sería peor: arrancar sin Supabase para descubrirlo en la
  // primera consulta de un usuario.
  const r = importarEnvCon({ SUPABASE_URL: '' });
  assert.equal(r.ok, false, 'arrancó sin SUPABASE_URL');
  assert.match(r.salida, /incompleta/);
});

test('una variable opcional con valor inválido SÍ impide arrancar', () => {
  // Vacía significa «todavía no»; mal escrita significa que alguien se
  // equivocó, y eso hay que decirlo en el arranque y no en el primer envío.
  const r = importarEnvCon({ ALERTS_FROM_EMAIL: 'esto-no-es-un-correo' });
  assert.equal(r.ok, false, 'arrancó con un remitente inválido');
  assert.match(r.salida, /incompleta/);
});
