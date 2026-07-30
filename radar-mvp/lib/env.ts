import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // Firecrawl — SOLO lo usan los scrapers de bancos. Es opcional a propósito: el
  // servidor web no scrapea nada, y exigirlo aquí hacía que el despliegue (donde
  // sólo se sirve el dashboard) ni siquiera arrancara. Quien lo necesita lo valida
  // al usarlo (requireFirecrawlKey).
  FIRECRAWL_API_KEY: z.string().min(5).optional(),
  FIRECRAWL_API_URL: z.string().url().optional(),    // vacío = cloud; set si self-host

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Defaults
  DEFAULT_COUNTRY_CODE: z.string().length(2).default('CO'),
  SCRAPE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Fase 2
  REMATES_USERNAME: z.string().optional(),
  REMATES_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  ALERTS_FROM_EMAIL: z.string().email().optional(),
  ALERTS_CRON_SECRET: z.string().min(16).optional(),
  APP_BASE_URL: z.string().url().default('http://localhost:8787'),

  // Fase 2 comercial: checkout demo exclusivamente en Wompi Sandbox.
  // La llave privada se reserva para futuras consultas servidor-servidor; el
  // checkout Web solo necesita pública, integridad y eventos.
  WOMPI_PUBLIC_KEY: z.string().regex(/^pub_test_[A-Za-z0-9_-]+$/).optional(),
  WOMPI_INTEGRITY_SECRET: z.string().regex(/^test_integrity_[A-Za-z0-9_-]+$/).optional(),
  WOMPI_EVENTS_SECRET: z.string().regex(/^test_events_[A-Za-z0-9_-]+$/).optional(),
  WOMPI_PRIVATE_KEY: z.string().regex(/^prv_test_[A-Za-z0-9_-]+$/).optional(),

  // Fase 3
  FINCARAIZ_API_KEY: z.string().optional(),

  // Activación de demostración del plan de pago.
  //
  // Con esto en '1', pulsar el botón del plan de pago concede el acceso completo
  // SIN COBRAR NADA. Existe para poder enseñar el producto entero antes de tener
  // la pasarela de pagos operativa, y es literalmente dinero regalado: ponerlo en
  // '0' es el único cambio necesario para cerrarlo, sin desplegar código nuevo.
  RADAR_DEMO_PLAN: z.enum(['0', '1']).default('0'),

  // ── Asistente (workflow «Asistente Radar CRECE» en n8n) ──
  //
  // Sin webhook configurado el asistente no existe: el botón no se pinta y la
  // ruta responde que no está disponible. Es opcional a propósito, para que el
  // Radar siga arrancando en local y en cualquier despliegue donde n8n no esté.
  RADAR_ASISTENTE_WEBHOOK: z.string().url().optional(),
  // Secreto compartido con el workflow. Va en los dos sentidos: el Radar lo manda
  // al llamar a n8n, y n8n lo devuelve al pedirnos una búsqueda de propiedades.
  // Sin él, `/api/asistente/buscar` quedaría abierta a cualquiera que adivinara
  // la ruta, y esa ruta consulta el inventario en nombre de un usuario concreto.
  // Mínimo 24 caracteres porque es lo único que separa esa ruta de internet.
  RADAR_ASISTENTE_SECRETO: z.string().min(24).optional(),

  // Auditoría de comparables: enseña, por ficha, contra qué inmuebles se calculó
  // el veredicto. Es una herramienta de VERIFICACIÓN mientras se comprueba el
  // motor, no una función del producto — apagada, la ruta no existe.
  //
  // Cuesta lo que cuesta: recalcular la cascada de un inmueble exige el pool de su
  // ciudad. El cliente lo señaló («si hay 100 personas al tiempo y todas
  // consultando comparables, va a tener impacto de procesamiento») y por eso está
  // detrás de un interruptor en vez de siempre disponible.
  RADAR_AUDITORIA_COMPARABLES: z.enum(['0', '1']).default('0'),
});

export const env = (() => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Variables de entorno inválidas:', parsed.error.format());
    throw new Error('Configuración .env incompleta. Revisa .env.example.');
  }
  return parsed.data;
})();
