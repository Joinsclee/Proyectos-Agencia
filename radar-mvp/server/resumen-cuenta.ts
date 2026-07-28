/**
 * Resumen imprimible de la cuenta.
 *
 * FORMATO: un HTML autocontenido que el navegador descarga y el usuario guarda
 * como PDF con «Imprimir → Guardar como PDF». Mismo criterio que el reporte de
 * inmueble (`server/reporte.ts`) y por la misma razón: meter un motor de PDF en
 * el servidor sería cargar decenas de megas de dependencia —y una superficie de
 * seguridad nueva— para producir exactamente lo mismo.
 *
 * POR QUÉ EXISTE: sustituye al botón de «Descargar JSON» de la pantalla de
 * cuenta. Un volcado JSON es un formato para máquinas: al usuario que quiere
 * guardar constancia de su plan, sus alertas y sus inmuebles seguidos no le sirve
 * de nada. La ruta JSON sigue viva para portabilidad de datos, solo deja de ser
 * lo que se le ofrece por delante.
 *
 * QUÉ ENTRA: lo que el usuario ya ve en su pantalla de cuenta. Ningún dato nuevo
 * y ninguna métrica inventada aquí.
 */
import { escaparHtml } from './reporte.js';

export interface CuentaResumible {
  id: string;
  email: string;
  name?: string | null;
  plan?: string | null;
  role?: string | null;
  subscriptionStatus?: string | null;
  preferences?: {
    city?: string | null;
    budgetMillions?: number | null;
    propertyType?: string | null;
  } | null;
  alerts?: Array<{ city?: string | null; createdAt?: string | null; active?: boolean }> | null;
  favorites?: Array<{ kind?: string | null; id?: string | null; createdAt?: string | null }> | null;
  deliveries?: Array<{ sentAt?: string | null; matches?: number | null; status?: string | null }> | null;
}

const NOMBRE_PLAN: Record<string, string> = {
  free: 'Gratuito', suscrito: 'Radar Pro', pro: 'Radar Pro', premium: 'Radar Pro',
};

/** Fecha legible en Colombia, o raya si no hay dato. Sin `Intl`: el ICU del contenedor no es de fiar. */
export function fechaLegible(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return '—';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1] ?? m[2]} de ${m[1]}`;
}

const fila = (etiqueta: string, valor: string) =>
  `<tr><th scope="row">${escaparHtml(etiqueta)}</th><td>${escaparHtml(valor)}</td></tr>`;

/** Nombre del archivo que descarga el navegador. */
export const nombreArchivoResumen = (id: string): string =>
  `radar-cuenta-${String(id).slice(0, 8)}.html`;

export function construirResumenCuenta(cuenta: CuentaResumible, generadoEn: string): string {
  const plan = NOMBRE_PLAN[String(cuenta.plan ?? 'free').toLowerCase()] ?? 'Gratuito';
  const prefs = cuenta.preferences;
  const alertas = cuenta.alerts ?? [];
  const guardados = cuenta.favorites ?? [];
  const envios = cuenta.deliveries ?? [];

  const seccion = (titulo: string, cuerpo: string) =>
    cuerpo ? `<section><h2>${escaparHtml(titulo)}</h2>${cuerpo}</section>` : '';

  const tablaAlertas = alertas.length
    ? `<table><thead><tr><th>Ciudad</th><th>Creada</th><th>Estado</th></tr></thead><tbody>${
      alertas.map((a) => `<tr><td>${escaparHtml(a.city ?? '—')}</td><td>${
        escaparHtml(fechaLegible(a.createdAt))}</td><td>${
        a.active === false ? 'En pausa' : 'Activa'}</td></tr>`).join('')
    }</tbody></table>`
    : '<p class="vacio">Todavía no has creado ninguna alerta.</p>';

  const tablaEnvios = envios.length
    ? `<table><thead><tr><th>Enviado</th><th>Coincidencias</th><th>Estado</th></tr></thead><tbody>${
      envios.slice(0, 30).map((e) => `<tr><td>${escaparHtml(fechaLegible(e.sentAt))}</td><td>${
        escaparHtml(String(e.matches ?? '—'))}</td><td>${escaparHtml(e.status ?? '—')}</td></tr>`).join('')
    }</tbody></table>`
    : '<p class="vacio">Aún no se te ha enviado ningún correo de seguimiento.</p>';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Radar CRECE · resumen de cuenta</title>
<style>
  :root { --tinta:#241a29; --suave:#6b5c74; --linea:#e4dde8; --morado:#613174; }
  * { box-sizing: border-box; }
  body { margin:0; padding:34px 28px 60px; background:#fff; color:var(--tinta);
         font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
         font-size:14px; line-height:1.6; max-width:800px; margin-inline:auto; }
  header { border-bottom:2px solid var(--morado); padding-bottom:14px; margin-bottom:22px; }
  h1 { margin:0 0 4px; font-size:1.5rem; letter-spacing:-0.01em; }
  .sub { margin:0; color:var(--suave); font-size:.82rem; }
  section { margin-top:26px; break-inside: avoid; }
  h2 { font-size:1rem; margin:0 0 10px; color:var(--morado); }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--linea); vertical-align:top; }
  thead th { font-size:.72rem; text-transform:uppercase; letter-spacing:.07em; color:var(--suave); }
  tbody th { font-weight:600; width:38%; color:var(--suave); }
  .vacio { color:var(--suave); font-size:.85rem; margin:0; }
  footer { margin-top:34px; padding-top:14px; border-top:1px solid var(--linea);
           color:var(--suave); font-size:.75rem; }
  @media print {
    body { padding:0; font-size:12px; }
    header { border-bottom-width:1px; }
    section { page-break-inside: avoid; }
  }
</style></head>
<body>
  <header>
    <h1>Resumen de tu cuenta</h1>
    <p class="sub">Radar de Oportunidades CRECE · generado el ${escaparHtml(fechaLegible(generadoEn))}</p>
  </header>

  ${seccion('Cuenta', `<table><tbody>
    ${fila('Correo', cuenta.email)}
    ${cuenta.name ? fila('Nombre', cuenta.name) : ''}
    ${fila('Plan', plan)}
    ${fila('Estado de la suscripción', cuenta.subscriptionStatus ?? 'sin suscripción activa')}
  </tbody></table>`)}

  ${prefs ? seccion('Tu Radar personalizado', `<table><tbody>
    ${fila('Ciudad', prefs.city ?? '—')}
    ${fila('Presupuesto', prefs.budgetMillions ? `${prefs.budgetMillions} millones` : '—')}
    ${fila('Tipo de inmueble', prefs.propertyType ?? '—')}
  </tbody></table>`) : ''}

  ${seccion('Alertas', tablaAlertas)}
  ${seccion('Historial de envíos', tablaEnvios)}
  ${seccion('Inmuebles guardados', guardados.length
    ? `<p>${guardados.length} inmueble${guardados.length === 1 ? '' : 's'} guardado${guardados.length === 1 ? '' : 's'} en tu cuenta.</p>`
    : '<p class="vacio">Todavía no has guardado ningún inmueble.</p>')}

  <footer>
    Para guardarlo como PDF: <strong>Imprimir → Guardar como PDF</strong>.<br>
    Este resumen recoge los datos de tu cuenta en el momento de generarlo. El
    inventario del Radar se actualiza con cada corrida, así que las cifras de las
    fichas pueden cambiar después de esta fecha.
  </footer>
</body></html>`;
}
