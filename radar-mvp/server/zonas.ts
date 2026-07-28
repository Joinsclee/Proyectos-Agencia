/**
 * Estadísticas de OPORTUNIDADES POR ZONA para el panel de administración.
 *
 * El panel ya contaba usuarios, suscripciones y correos: métricas de USO. Lo que
 * faltaba —y es lo que el documento de alcance promete— es la otra mitad: dónde
 * está el inventario que el Radar vende. Sin esto el administrador no puede
 * responder la única pregunta comercial que importa antes de pautar o de abrir
 * una ciudad nueva: «¿en qué zonas hay algo que mostrarle al cliente?».
 *
 * ESTE ARCHIVO NO HABLA CON SUPABASE A PROPÓSITO. Recibe filas ya traídas y
 * devuelve la tabla lista. Así la agregación —que es donde de verdad se puede
 * equivocar un conteo— se prueba sin red, con `node --import tsx --test`, y la
 * capa de datos (`server/queries.ts`) solo se encarga de traer y de cachear.
 */

/** Ciudades que caben en la tabla del panel. */
export const MAX_CIUDADES_PANEL = 40;

/** Fila de oportunidad tal como sale de `inmuebles` (solo lo que se agrega). */
export interface FilaOportunidad {
  city?: string | null;
  discount_pct?: number | string | null;
  is_high?: boolean | null;
}

/** Cualquier fila de la que solo interesa su ciudad (bancos, remates, arriendos). */
export interface FilaCiudad {
  city?: string | null;
}

export interface ZonaOportunidades {
  ciudad: string;
  /** Inmuebles activos del portal abierto en esa ciudad. */
  inmueblesActivos: number;
  oportunidades: number;
  oportunidadesAltas: number;
  /** Porcentaje medio de descuento de las oportunidades (1 decimal). */
  descuentoMedio: number | null;
  /** Mejor descuento encontrado en la ciudad (1 decimal). */
  mejorDescuento: number | null;
  inmueblesBanco: number;
  rematesActivos: number;
  arriendos: number;
  /**
   * Hay inventario de arriendos en la ciudad. Donde es `false` el Radar puede
   * decir si el precio de compra está barato, pero NO puede calcular
   * rentabilidad: no tiene canon de referencia. Es la carencia que el panel
   * tiene que hacer visible, porque decide qué ciudad se scrapea después.
   */
  coberturaArriendos: boolean;
}

export interface ResumenZonas {
  /** Ciudades que se muestran en la tabla (tope `MAX_CIUDADES_PANEL`). */
  ciudadesEnTabla: number;
  /** Ciudades del país con al menos una oportunidad, se muestren o no. */
  ciudadesConOportunidad: number;
  /** De las que se muestran, cuántas no tienen comparables de arriendo. */
  ciudadesSinArriendos: number;
  /**
   * Totales del SISTEMA, no de la tabla: el corte de arriba no los recorta.
   * `inmueblesActivos` puede ser `null` si el conteo global no se pudo leer; la
   * interfaz muestra una raya. Un cero ahí sería mentira, no ausencia de dato.
   */
  inmueblesActivos: number | null;
  oportunidades: number;
  oportunidadesAltas: number;
  inmueblesBanco: number;
  rematesActivos: number;
  arriendos: number;
  descuentoMedio: number | null;
  mejorDescuento: number | null;
}

/** Un tramo del histograma de descuentos. */
export interface TramoDescuento {
  /** Límite inferior del tramo, en puntos porcentuales (incluido). */
  desde: number;
  /** Límite superior (excluido, salvo el último tramo, que cierra el máximo). */
  hasta: number;
  /** Oportunidades cuyo descuento cae en el tramo. */
  total: number;
  /** De ellas, cuántas marcó el motor como oportunidad ALTA. */
  altas: number;
}

export interface HistogramaDescuentos {
  tramos: TramoDescuento[];
  /** Oportunidades con descuento conocido (las que entran al histograma). */
  conDescuento: number;
  /** Sin `discount_pct`: están detectadas pero el motor aún no las valoró. */
  sinDescuento: number;
}

export interface TablaZonas {
  generadoEn: string;
  resumen: ResumenZonas;
  zonas: ZonaOportunidades[];
  /**
   * Distribución de descuentos de TODAS las oportunidades activas.
   *
   * Viaja con la tabla de zonas —y no en un endpoint propio— porque se calcula
   * sobre las MISMAS filas que ya se trajeron para agregarla por ciudad. Pedirla
   * aparte costaría un segundo recorrido de ~20.500 filas sobre una tabla de
   * 116.000 para volver a leer la columna que ya estaba en memoria.
   */
  histogramaDescuentos: HistogramaDescuentos;
}

/**
 * Normaliza el nombre de ciudad que viene de la base.
 *
 * Los scrapers guardan slugs en minúscula (`bogota`, `santa marta`), pero basta
 * un scraper nuevo que mande `Bogota ` para que la misma ciudad apareciera dos
 * veces en la tabla y partiera sus conteos por la mitad. Se normaliza al agregar,
 * no al mostrar: la capitalización es cosa de la interfaz.
 */
export function normalizarCiudad(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().toLowerCase().replace(/\s+/g, ' ');
  return limpio || null;
}

/** Descuento utilizable: la base guarda `numeric`, que el driver puede dar como texto. */
function descuentoDe(valor: FilaOportunidad['discount_pct']): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Un decimal, que es la precisión que un porcentaje de descuento merece. */
function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Conteo por ciudad de una lista cualquiera (remates, bancos, arriendos). */
export function contarPorCiudad(filas: readonly FilaCiudad[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const ciudad = normalizarCiudad(fila?.city);
    if (!ciudad) continue; // sin ciudad no se puede ubicar: no se inventa una
    conteo.set(ciudad, (conteo.get(ciudad) ?? 0) + 1);
  }
  return conteo;
}

interface AcumuladoOportunidad {
  oportunidades: number;
  altas: number;
  sumaDescuentos: number;
  conDescuento: number;
  mejorDescuento: number | null;
}

/**
 * Agrupa las oportunidades por ciudad acumulando también el descuento.
 *
 * El promedio se calcula solo sobre las filas que TIENEN descuento: una
 * oportunidad sin `discount_pct` (todavía sin veredicto del motor) contaría como
 * 0 % y arrastraría la media hacia abajo, haciendo ver peor una ciudad que en
 * realidad solo está a medio procesar.
 */
export function agruparOportunidades(filas: readonly FilaOportunidad[]): Map<string, AcumuladoOportunidad> {
  const grupos = new Map<string, AcumuladoOportunidad>();
  for (const fila of filas) {
    const ciudad = normalizarCiudad(fila?.city);
    if (!ciudad) continue;
    const acumulado = grupos.get(ciudad) ?? {
      oportunidades: 0,
      altas: 0,
      sumaDescuentos: 0,
      conDescuento: 0,
      mejorDescuento: null,
    };
    acumulado.oportunidades += 1;
    if (fila.is_high === true) acumulado.altas += 1;
    const descuento = descuentoDe(fila.discount_pct);
    if (descuento !== null) {
      acumulado.sumaDescuentos += descuento;
      acumulado.conDescuento += 1;
      if (acumulado.mejorDescuento === null || descuento > acumulado.mejorDescuento) {
        acumulado.mejorDescuento = descuento;
      }
    }
    grupos.set(ciudad, acumulado);
  }
  return grupos;
}

/**
 * Las ciudades que entran al panel, ordenadas por volumen de oportunidades.
 *
 * Se recorta ANTES de pedir los conteos por ciudad: cada ciudad de la tabla
 * cuesta una consulta de conteo sobre 116.000 inmuebles, así que la lista de 133
 * ciudades del país no se puede consultar entera en cada carga. El desempate es
 * alfabético para que dos cargas seguidas devuelvan el mismo orden (con empates
 * resueltos al azar, la tabla bailaría entre refrescos sin que nada cambiara).
 */
export function ciudadesPrincipales(
  filas: readonly FilaOportunidad[],
  limite: number = MAX_CIUDADES_PANEL,
): string[] {
  const grupos = agruparOportunidades(filas);
  return [...grupos.entries()]
    .sort((a, b) => b[1].oportunidades - a[1].oportunidades || a[0].localeCompare(b[0], 'es'))
    .slice(0, Math.max(0, limite))
    .map(([ciudad]) => ciudad);
}

/**
 * Ancho de los tramos del histograma, en puntos porcentuales.
 *
 * Cinco puntos y no uno: con tramos de un punto salen 70 columnas, que en el
 * ancho de una tarjeta del panel quedan a menos de 3 px y dejan de ser
 * legibles; con tramos de diez, los descuentos del 10 % y del 19 % —que para
 * un inversionista son ofertas distintas— caen en la misma barra.
 */
export const ANCHO_TRAMO_DESCUENTO = 5;

/**
 * Reparte las oportunidades por tramo de descuento.
 *
 * Responde la pregunta que la tabla por ciudad no responde: no «dónde hay»,
 * sino «de qué calidad es lo que hay». Un inventario concentrado entre el 5 % y
 * el 10 % es un producto distinto de uno con cola larga hasta el 40 %, y hoy el
 * panel solo mostraba la media, que esconde exactamente esa diferencia.
 *
 * Los tramos se cuentan también en `altas` porque el descuento por sí solo no
 * es la promesa del producto: el motor marca ALTA cuando además el inmueble
 * está en el decil barato de su zona con comparables homogéneos. Ver los dos
 * juntos es lo que dice si los descuentos grandes son gangas o ruido.
 */
export function histogramaDescuentos(
  filas: readonly FilaOportunidad[],
  maximo: number,
  ancho: number = ANCHO_TRAMO_DESCUENTO,
): HistogramaDescuentos {
  const paso = Math.max(1, ancho);
  const tope = Math.max(paso, maximo);
  const tramos: TramoDescuento[] = [];
  for (let desde = 0; desde < tope; desde += paso) {
    tramos.push({ desde, hasta: Math.min(desde + paso, tope), total: 0, altas: 0 });
  }

  let conDescuento = 0;
  let sinDescuento = 0;
  for (const fila of filas) {
    const descuento = descuentoDe(fila?.discount_pct);
    if (descuento === null) { sinDescuento += 1; continue; }
    conDescuento += 1;
    // Un descuento negativo (el motor podría marcarlo por un dato sucio) cae en
    // el primer tramo en vez de perderse: el total del histograma tiene que
    // cuadrar con el total de oportunidades que el panel muestra arriba.
    const indice = Math.min(tramos.length - 1, Math.max(0, Math.floor(descuento / paso)));
    const tramo = tramos[indice];
    tramo.total += 1;
    if (fila.is_high === true) tramo.altas += 1;
  }

  return { tramos, conDescuento, sinDescuento };
}

export interface EntradaTablaZonas {
  /** Ciudades a mostrar, ya recortadas por `ciudadesPrincipales`. */
  ciudades: readonly string[];
  /** TODAS las oportunidades activas del portal (no solo las de esas ciudades). */
  oportunidades: readonly FilaOportunidad[];
  /** Inmuebles activos del portal por ciudad: viene de conteos, no de filas. */
  activosPorCiudad: ReadonlyMap<string, number>;
  bancos: readonly FilaCiudad[];
  remates: readonly FilaCiudad[];
  arriendos: readonly FilaCiudad[];
  /** Total de inmuebles activos del portal en todo el sistema (`null` si falló). */
  totalActivosSistema: number | null;
  /**
   * Descuento máximo creíble (`MAX_OPP_DISCOUNT`). Lo pasa quien llama en vez de
   * importarlo aquí para que este archivo siga sin depender de nada: es el mismo
   * tope con el que se filtró la consulta, así que el histograma no puede tener
   * un tramo que la consulta nunca iba a llenar.
   */
  maxDescuento: number;
  generadoEn?: string;
}

/**
 * Arma la tabla del panel: una fila por ciudad más el resumen del sistema.
 *
 * OJO con el resumen: sus totales son los del SISTEMA COMPLETO, no la suma de la
 * tabla. Si sumara solo las 40 ciudades mostradas, el administrador leería
 * «19.400 oportunidades» cuando hay 20.510, y esa diferencia silenciosa es
 * exactamente el tipo de número que después se repite en una reunión.
 */
export function construirTablaZonas(entrada: EntradaTablaZonas): TablaZonas {
  const grupos = agruparOportunidades(entrada.oportunidades);
  const bancosPorCiudad = contarPorCiudad(entrada.bancos);
  const rematesPorCiudad = contarPorCiudad(entrada.remates);
  const arriendosPorCiudad = contarPorCiudad(entrada.arriendos);

  const zonas: ZonaOportunidades[] = entrada.ciudades.map((nombre) => {
    const ciudad = normalizarCiudad(nombre) ?? nombre;
    const grupo = grupos.get(ciudad);
    const arriendos = arriendosPorCiudad.get(ciudad) ?? 0;
    return {
      ciudad,
      inmueblesActivos: entrada.activosPorCiudad.get(ciudad) ?? 0,
      oportunidades: grupo?.oportunidades ?? 0,
      oportunidadesAltas: grupo?.altas ?? 0,
      descuentoMedio: grupo && grupo.conDescuento > 0
        ? redondear(grupo.sumaDescuentos / grupo.conDescuento)
        : null,
      mejorDescuento: grupo?.mejorDescuento === null || grupo?.mejorDescuento === undefined
        ? null
        : redondear(grupo.mejorDescuento),
      inmueblesBanco: bancosPorCiudad.get(ciudad) ?? 0,
      rematesActivos: rematesPorCiudad.get(ciudad) ?? 0,
      arriendos,
      coberturaArriendos: arriendos > 0,
    };
  }).sort((a, b) => b.oportunidades - a.oportunidades || a.ciudad.localeCompare(b.ciudad, 'es'));

  let sumaDescuentos = 0;
  let conDescuento = 0;
  let mejorDescuento: number | null = null;
  let oportunidades = 0;
  let altas = 0;
  for (const grupo of grupos.values()) {
    oportunidades += grupo.oportunidades;
    altas += grupo.altas;
    sumaDescuentos += grupo.sumaDescuentos;
    conDescuento += grupo.conDescuento;
    if (grupo.mejorDescuento !== null && (mejorDescuento === null || grupo.mejorDescuento > mejorDescuento)) {
      mejorDescuento = grupo.mejorDescuento;
    }
  }

  return {
    generadoEn: entrada.generadoEn ?? new Date().toISOString(),
    resumen: {
      ciudadesEnTabla: zonas.length,
      ciudadesConOportunidad: grupos.size,
      ciudadesSinArriendos: zonas.filter((zona) => !zona.coberturaArriendos).length,
      inmueblesActivos: entrada.totalActivosSistema,
      oportunidades,
      oportunidadesAltas: altas,
      inmueblesBanco: entrada.bancos.length,
      rematesActivos: entrada.remates.length,
      arriendos: entrada.arriendos.length,
      descuentoMedio: conDescuento > 0 ? redondear(sumaDescuentos / conDescuento) : null,
      mejorDescuento: mejorDescuento === null ? null : redondear(mejorDescuento),
    },
    zonas,
    histogramaDescuentos: histogramaDescuentos(entrada.oportunidades, entrada.maxDescuento),
  };
}
