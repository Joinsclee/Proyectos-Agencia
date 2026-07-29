/**
 * Los avisos que son el mismo inmueble repetido.
 *
 * El cliente lo vio ordenando Pereira por precio: diez tarjetas seguidas
 * idénticas, «$70.000.000 · Lote · 50 m² · sector arenales / alta gracia». Su
 * pregunta fue si el scraper estaba duplicando.
 *
 * NO lo estaba. Medido contra la base: cero URLs repetidas y cero `source_id`
 * repetidos en las 150 fichas activas de Pereira. Son diez ANUNCIOS DISTINTOS del
 * mismo loteo —la inmobiliaria publica un aviso por cada lote del proyecto, todos
 * con el mismo precio, la misma superficie y la misma dirección—. Existen de
 * verdad y cada uno se puede comprar por separado, así que borrarlos sería
 * mentir sobre el inventario.
 *
 * Lo que sí es un problema es la pantalla: diez tarjetas que dicen exactamente lo
 * mismo no dan diez opciones, dan una opción y nueve estorbos, y expulsan del
 * listado a inmuebles que el usuario sí querría ver. Así que se colapsan en una,
 * que lleva la cuenta de cuántas iguales hay.
 *
 * SE HACE POR PÁGINA, no en la base. Es una limitación consciente: el conteo
 * total sigue contando todas las copias, así que «1.240 resultados» puede acabar
 * pintando menos de 1.240 tarjetas. Hacerlo bien exigiría un DISTINCT ON en una
 * vista de Postgres y rehacer la paginación por keyset encima de ella. Colapsar
 * por página funciona porque los repetidos comparten precio y el orden por
 * defecto es por precio: salen consecutivos, en la misma página, que es
 * exactamente donde molestan.
 */

/**
 * La identidad de un inmueble a ojos de quien mira el listado.
 *
 * Precio, superficie, tipo y dirección. Si esas cuatro cosas coinciden, las dos
 * tarjetas se ven idénticas y da igual cuál abra el usuario.
 *
 * La dirección se normaliza a conciencia porque el portal la escribe a mano y
 * llega con variaciones: en la misma búsqueda aparecían «sector arenales /alta
 * gracia/pereira» y «sector arenales/alta gracia/pereira». Sin plegar los
 * espacios alrededor de las barras, esas dos son claves distintas y el colapso
 * dejaría pasar la mitad de las copias.
 */
export function claveDeRepeticion(fila: Record<string, any>): string | null {
  // Sin precio o sin área no hay forma de saber si dos fichas son la misma, y
  // agrupar «todo lo que no tiene precio» juntaría cosas que no tienen nada que
  // ver. Ante la duda, no se colapsa.
  //
  // `numeroPositivo` y no `Number(x)` a secas porque `Number(null)` es 0, y 0 es
  // finito: con la comprobación ingenua, todas las filas sin precio compartían la
  // clave «0|…» y se colapsaban entre ellas. Es la tercera vez que este mismo
  // `Number(null) === 0` muerde en este proyecto —ya pasó en los parámetros de
  // gastos y en el resumen de bloqueo—, aquí lo cazó la prueba antes de salir.
  const precio = numeroPositivo(fila.price);
  const area = numeroPositivo(fila.area_m2);
  if (precio === null || area === null || !fila.address) return null;
  const direccion = String(fila.address)
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')   // «a /b» y «a/b» son la misma dirección
    .replace(/\s+/g, ' ')
    .trim();
  if (!direccion) return null;
  return `${precio}|${area}|${fila.type ?? ''}|${direccion}`;
}

export interface ResultadoColapso<T> {
  filas: T[];
  /** Cuántas tarjetas se retiraron. Para poder medir el efecto sin adivinar. */
  ocultas: number;
}

/**
 * Deja una tarjeta por grupo de repetidos y le anota cuántas iguales había.
 *
 * Conserva el orden de entrada y se queda con la PRIMERA de cada grupo: viene
 * ordenada por el criterio que pidió el usuario, así que la primera es la que él
 * habría querido ver arriba.
 */
export function colapsarRepetidos<T extends Record<string, any>>(filas: T[]): ResultadoColapso<T> {
  const vistas = new Map<string, T>();
  const salida: T[] = [];
  let ocultas = 0;

  for (const fila of filas) {
    const clave = claveDeRepeticion(fila);
    if (!clave) { salida.push(fila); continue; }
    const previa = vistas.get(clave);
    if (!previa) {
      vistas.set(clave, fila);
      salida.push(fila);
      continue;
    }
    // `_iguales` cuenta el TOTAL del grupo, incluida la que se queda: «10 iguales»
    // se lee mejor que «9 más», que obliga a sumar para saber cuántas hay.
    const anotada = previa as T & { _iguales?: number };
    anotada._iguales = (anotada._iguales ?? 1) + 1;
    ocultas += 1;
  }
  return { filas: salida, ocultas };
}

/** Solo números de verdad y mayores que cero. Ver el comentario de `claveDeRepeticion`. */
function numeroPositivo(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
