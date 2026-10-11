/**
 * Un cliente que habla el dialecto de PostgREST sobre arrays en memoria.
 *
 * El 10 de octubre de 2026 Supabase restringió el proyecto por cuota y devolvió
 * 402 en todo. Había que poder enseñar el Radar sin la base, y había dos
 * caminos: reimplementar las doce funciones de `server/queries.ts` contra un
 * JSON, o imitar el cliente y dejar que `queries.ts` siga como está.
 *
 * Esto es lo segundo, y no por elegancia: la primera opción duplica la lógica
 * —los reintentos, el conteo cacheado, la exclusión de preventa, el intercalado
 * proporcional— y garantiza que las dos versiones se separen. Aquí solo hay que
 * acertar con el dialecto, que es pequeño y está medido:
 *
 *     .from .select .eq .in .gt .gte .lt .lte .or .not .order .range .limit
 *     .single .maybeSingle    ·    { count: 'exact', head: true }
 *
 * Lo que NO hace, a propósito: escribir. Un `insert`/`update`/`upsert`/`delete`
 * responde «ok» sin tocar nada, porque en una demo guardar un favorito debe
 * funcionar a la vista pero no hay dónde persistirlo. Se pierde al reiniciar.
 *
 * Solo se activa con `RADAR_DEMO_DATOS`. Sin esa variable, este archivo no se
 * carga y la producción no se entera de que existe.
 */

type Fila = Record<string, any>;
type Tablas = Record<string, Fila[]>;

export interface Respuesta<T> { data: T; error: { message: string } | null; count: number | null; }

/** Lee `features->>clave` y `features->clave` sobre una fila en memoria. */
function porRuta(fila: Fila, ruta: string): unknown {
  // `features->>bank_name` (texto) y `features->bedrooms` (json) resuelven
  // igual aquí: en JavaScript no hay diferencia entre el valor y su texto hasta
  // que se compara, y la comparación ya normaliza.
  const m = ruta.match(/^(\w+)->>?(.+)$/);
  if (!m) return fila[ruta];
  const [, col, resto] = m;
  let valor: any = fila[col];
  for (const paso of resto.split(/->>?/)) {
    if (valor == null) return null;
    valor = valor[paso];
  }
  return valor;
}

/** Compara como lo haría Postgres: los números por valor, el resto por texto. */
function igual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  const na = Number(a); const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na === nb;
  }
  return String(a) === String(b);
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Aplica la proyección de `select`.
 *
 * Hay que soportar los alias con ruta JSON (`lat:features->lat`) porque son
 * justamente los que alimentan el motor de comparables: sin ellos el panel de
 * «análisis de mercado» —el que justifica el −X%— se queda sin datos, que es
 * lo que más se nota en una demo.
 */
function proyectar(fila: Fila, columnas: string): Fila {
  const limpio = columnas.trim();
  if (limpio === '*' || limpio === '') return { ...fila };
  const salida: Fila = {};
  for (const trozo of limpio.split(',')) {
    const campo = trozo.trim();
    if (!campo) continue;
    const alias = campo.match(/^(\w+)\s*:\s*(.+)$/);
    if (alias) salida[alias[1]] = porRuta(fila, alias[2].trim()) ?? null;
    else salida[campo] = fila[campo] ?? null;
  }
  return salida;
}

type Predicado = (f: Fila) => boolean;

class Consulta<T = Fila[]> implements PromiseLike<Respuesta<T>> {
  private filtros: Predicado[] = [];
  private ordenes: Array<{ col: string; asc: boolean; nullsFirst: boolean }> = [];
  private columnas = '*';
  private conteo: 'exact' | null = null;
  private soloCabecera = false;
  private desde = 0;
  private hasta = Infinity;
  private tope = Infinity;
  private modoSingle: 'single' | 'maybe' | null = null;

  constructor(private readonly filas: Fila[], private readonly tabla: string) {}

  select(columnas = '*', opciones?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.columnas = columnas;
    if (opciones?.count) this.conteo = 'exact';
    if (opciones?.head) this.soloCabecera = true;
    return this;
  }

  eq(col: string, v: unknown) { this.filtros.push((f) => igual(porRuta(f, col), v)); return this; }
  neq(col: string, v: unknown) { this.filtros.push((f) => !igual(porRuta(f, col), v)); return this; }
  gt(col: string, v: unknown) { this.filtros.push((f) => (num(porRuta(f, col)) ?? -Infinity) > (num(v) ?? -Infinity)); return this; }
  lt(col: string, v: unknown) { this.filtros.push((f) => (num(porRuta(f, col)) ?? Infinity) < (num(v) ?? Infinity)); return this; }

  gte(col: string, v: unknown) {
    this.filtros.push((f) => {
      const a = porRuta(f, col); const b = v;
      // Las fechas se comparan como texto ISO, igual que en Postgres.
      if (typeof b === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b)) return a != null && String(a) >= b;
      const na = num(a); return na != null && na >= (num(b) ?? -Infinity);
    });
    return this;
  }

  lte(col: string, v: unknown) {
    this.filtros.push((f) => {
      const a = porRuta(f, col); const b = v;
      if (typeof b === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b)) return a != null && String(a) <= b;
      const na = num(a); return na != null && na <= (num(b) ?? Infinity);
    });
    return this;
  }

  in(col: string, valores: unknown[]) {
    this.filtros.push((f) => valores.some((v) => igual(porRuta(f, col), v)));
    return this;
  }

  is(col: string, v: null | boolean) {
    this.filtros.push((f) => (v === null ? porRuta(f, col) == null : igual(porRuta(f, col), v)));
    return this;
  }

  not(col: string, operador: string, v: unknown) {
    this.filtros.push((f) => {
      const a = porRuta(f, col);
      if (operador === 'is') return v === null ? a != null : !igual(a, v);
      return !igual(a, v);
    });
    return this;
  }

  /**
   * El `or` de PostgREST: `col.op.valor,col.op.valor`, unidos por O.
   *
   * El código usa exactamente uno —`features->>is_project.is.null,
   * features->>is_project.eq.false`, que es «no es un proyecto en preventa»— y
   * ese sí hay que acertarlo: sin él la demo enseñaría obras sobre plano
   * mezcladas con inmuebles terminados.
   */
  or(expresion: string) {
    const ramas = expresion.split(',').map((rama) => {
      const m = rama.trim().match(/^(.+?)\.(is|eq|neq|gt|gte|lt|lte)\.(.*)$/);
      if (!m) return () => false;
      const [, col, op, crudo] = m;
      const v = crudo === 'null' ? null : crudo === 'true' ? true : crudo === 'false' ? false : crudo;
      return (f: Fila) => {
        const a = porRuta(f, col);
        switch (op) {
          case 'is': return v === null ? a == null : igual(a, v);
          case 'eq': return igual(a, v);
          case 'neq': return !igual(a, v);
          case 'gt': return (num(a) ?? -Infinity) > (num(v) ?? -Infinity);
          case 'gte': return (num(a) ?? -Infinity) >= (num(v) ?? -Infinity);
          case 'lt': return (num(a) ?? Infinity) < (num(v) ?? Infinity);
          case 'lte': return (num(a) ?? Infinity) <= (num(v) ?? Infinity);
          default: return false;
        }
      };
    });
    this.filtros.push((f) => ramas.some((r) => r(f)));
    return this;
  }

  order(col: string, opciones?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.ordenes.push({
      col,
      asc: opciones?.ascending !== false,
      nullsFirst: opciones?.nullsFirst === true,
    });
    return this;
  }

  range(desde: number, hasta: number) { this.desde = desde; this.hasta = hasta; return this; }
  limit(n: number) { this.tope = n; return this; }
  single() { this.modoSingle = 'single'; return this as unknown as Consulta<Fila>; }
  maybeSingle() { this.modoSingle = 'maybe'; return this as unknown as Consulta<Fila | null>; }

  private resolver(): Respuesta<any> {
    let filas = this.filas.filter((f) => this.filtros.every((p) => p(f)));
    const total = filas.length;

    for (const { col, asc, nullsFirst } of [...this.ordenes].reverse()) {
      filas = [...filas].sort((x, y) => {
        const a = porRuta(x, col); const b = porRuta(y, col);
        if (a == null && b == null) return 0;
        // `nullsFirst` importa: los listados ordenan por descuento con los
        // nulos al final, y meterlos delante vacía la primera página.
        if (a == null) return nullsFirst ? -1 : 1;
        if (b == null) return nullsFirst ? 1 : -1;
        const na = num(a); const nb = num(b);
        const cmp = (na != null && nb != null) ? na - nb : String(a).localeCompare(String(b));
        return asc ? cmp : -cmp;
      });
    }

    if (this.desde || this.hasta !== Infinity) filas = filas.slice(this.desde, this.hasta + 1);
    if (this.tope !== Infinity) filas = filas.slice(0, this.tope);

    if (this.soloCabecera) return { data: null, error: null, count: total };

    const proyectadas = filas.map((f) => proyectar(f, this.columnas));

    if (this.modoSingle) {
      if (proyectadas.length === 1) return { data: proyectadas[0], error: null, count: this.conteo ? total : null };
      if (this.modoSingle === 'maybe' && proyectadas.length === 0) return { data: null, error: null, count: null };
      return {
        data: null,
        error: { message: `demo: ${this.tabla} devolvió ${proyectadas.length} filas donde se esperaba una` },
        count: null,
      };
    }
    return { data: proyectadas, error: null, count: this.conteo ? total : null };
  }

  then<R1 = Respuesta<T>, R2 = never>(
    alCumplir?: ((v: Respuesta<T>) => R1 | PromiseLike<R1>) | null,
    alFallar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try { return Promise.resolve(this.resolver() as Respuesta<T>).then(alCumplir, alFallar); }
    catch (e) { return Promise.reject(e).then(alCumplir, alFallar); }
  }
}

/** Una escritura en modo demo: dice que sí y no toca nada. */
const escrituraSinEfecto = () => {
  const r = { data: [], error: null, count: 0 };
  const api: any = {
    select: () => api, eq: () => api, in: () => api, match: () => api,
    single: () => api, maybeSingle: () => api,
    then: (f: any, g: any) => Promise.resolve(r).then(f, g),
  };
  return api;
};

/**
 * Los metadatos del usuario de la demo. Viven aquí, en memoria, porque es donde
 * el Radar guarda favoritos, cupo y preferencias: en `user_metadata`, no en una
 * tabla. Se pierden al reiniciar, que para una demo es lo correcto.
 */
const metadatosDemo: Record<string, any> = {
  name: 'Demo',
  plan: 'pro',
  subscription_status: 'active',
  favorites: [],
};

export function crearClienteDemo(tablas: Tablas) {
  return {
    from(tabla: string) {
      const filas = tablas[tabla] ?? [];
      const consulta = new Consulta(filas, tabla);
      return Object.assign(consulta, {
        insert: escrituraSinEfecto,
        update: escrituraSinEfecto,
        upsert: escrituraSinEfecto,
        delete: escrituraSinEfecto,
      });
    },
    // Los cuatro `rpc` del proyecto son del scraper y de pagos: en una demo de
    // solo lectura no se llaman, y si se llamaran no deben hacer nada.
    rpc: async () => ({ data: null, error: null }),
    auth: {
      // La sesión de la demo la fabrica `server/demo/sesion.ts`. Aquí vive la
      // parte `admin`, que es por donde el Radar guarda los favoritos, el cupo
      // y las preferencias: no están en una tabla, están en los metadatos del
      // usuario de Supabase Auth.
      //
      // En la demo esos metadatos son un objeto en memoria. Guardar un favorito
      // funciona a la vista —el corazón se pinta, el contador sube— y se pierde
      // al reiniciar. Para enseñar el producto sobra, y evita que `listFavorites`
      // devuelva 500 y deje la barra diciendo «Ingresar» con la sesión puesta.
      getUser: async () => ({ data: { user: null }, error: null }),
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, email: 'demo@radarcrece.co', user_metadata: metadatosDemo, app_metadata: metadatosDemo } },
          error: null,
        }),
        updateUserById: async (id: string, cambios: any) => {
          Object.assign(metadatosDemo, cambios?.user_metadata ?? {}, cambios?.app_metadata ?? {});
          return {
            data: { user: { id, email: 'demo@radarcrece.co', user_metadata: metadatosDemo, app_metadata: metadatosDemo } },
            error: null,
          };
        },
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({ data: { user: null }, error: { message: 'demo: sin registro' } }),
        generateLink: async () => ({ data: null, error: { message: 'demo: sin correo' } }),
      },
    },
  } as any;
}
