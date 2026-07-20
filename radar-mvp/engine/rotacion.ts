/**
 * Rotación semanal del top de oportunidades bancarias.
 *
 * HU "Percepción de frescura y rotativo de oportunidades": el inventario de
 * bancos es pequeño y rota poco de verdad — un mismo activo puede estar
 * disponible meses. Si además se muestra siempre en el mismo orden, quien entra
 * varias veces al mes ve exactamente la misma pantalla y concluye que el Radar
 * está muerto, aunque los datos estén verificados al día.
 *
 * La rotación es DETERMINISTA por semana: dentro de la misma semana el orden es
 * estable (paginar no baraja ni repite fichas), y al cambiar de semana el punto
 * de arranque se desplaza. Es un solo pool para Bancolombia, Davivienda, BBVA y
 * AVAL — no tres rotativos aislados, como pide la HU.
 */

/** Número de semana ISO. Estable dentro de la semana, distinto al cambiar. */
export function semanaISO(fecha = new Date()): number {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Desplaza la lista un offset derivado de la semana.
 *
 * No se baraja al azar: barajar cambiaría el orden en cada petición y rompería la
 * paginación (la misma ficha saldría en dos páginas y otra en ninguna). Rotar
 * conserva la lista completa y solo mueve el punto de entrada.
 */
export function rotarSemanal<T>(items: T[], semana = semanaISO()): T[] {
  if (items.length < 2) return items;
  const offset = semana % items.length;
  return offset === 0 ? items : [...items.slice(offset), ...items.slice(0, offset)];
}
