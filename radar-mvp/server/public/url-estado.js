'use strict';

/**
 * La búsqueda, escrita en la dirección del navegador.
 *
 * Hasta ahora la URL era siempre la raíz del sitio dijera lo que dijera la
 * pantalla: se podía acotar a apartamentos en Medellín por debajo de 300
 * millones y la barra de direcciones seguía diciendo `/`. Eso deja al usuario
 * sin las tres cosas que cualquiera espera de una búsqueda —mandarla por
 * WhatsApp, guardarla en favoritos y volver atrás—, y en un producto que se
 * llama «radar», hecho para mirar lo mismo cada semana, esas tres son el
 * producto. Además arrastraba un problema más callado: al recargar, la pantalla
 * no volvía a la última búsqueda sino a la preferencia guardada, así que quien
 * había pasado de Bogotá a Medellín y pulsaba F5 se encontraba Bogotá otra vez
 * sin haber pedido nada.
 *
 * Este archivo es SOLO la traducción entre las dos formas de decir lo mismo:
 * `serializar` convierte el estado de la búsqueda en una cadena de consulta y
 * `leer` la vuelve a convertir en estado. No toca el DOM, no toca el historial y
 * no sabe nada del resto de la aplicación: por eso se puede probar sin navegador
 * —ver `server/url-estado.test.ts`— que es lo que impide que un parámetro se
 * escriba de una forma y se lea de otra, que es la avería que nadie nota hasta
 * que un enlace compartido abre otra cosa.
 *
 * Vive en su propio archivo, y no dentro de `app.js`, exactamente por eso.
 */
(function () {
  /** Las secciones que existen. Cualquier otra cosa en `?tab=` se ignora. */
  const PESTANAS = ['home', 'portal', 'bancos', 'remates', 'guardados'];

  /**
   * Qué control del panel de filtros se llama cómo en la dirección.
   *
   * A la izquierda el `id` del control tal y como lo pinta `buildFilters()`; a la
   * derecha el nombre corto que ve el usuario en la barra del navegador. Los
   * nombres son los del filtro, no los de la base de datos: quien reciba
   * `?tab=portal&city=medellin&type=house&priceMax=300` entiende qué le mandaron
   * antes de abrirlo, y eso es la mitad de para qué sirve poder compartirlo.
   *
   * OJO con el precio: aquí viaja en MILLONES, que es la unidad en la que está
   * escrito el campo de la pantalla, no en pesos como lo manda `load()` a la API.
   * La dirección repite lo que la persona escribió, no lo que el servidor recibe.
   *
   * El orden de esta lista es el orden en el que salen los parámetros en la URL.
   */
  const CONTROLES = [
    ['f-order', 'order'],
    ['f-city', 'city'],
    ['f-zone', 'zone'],
    ['f-type', 'type'],
    ['f-bank', 'bank'],
    ['f-opp', 'tier'],
    ['f-priceMin', 'priceMin'],
    ['f-priceMax', 'priceMax'],
    ['f-bidMin', 'bidMin'],
    ['f-bidMax', 'bidMax'],
    ['f-areaMin', 'areaMin'],
    ['f-areaMax', 'areaMax'],
    ['f-bedroomsMin', 'beds'],
    ['f-stratumMin', 'stratumMin'],
    ['f-stratumMax', 'stratumMax'],
    ['f-desbloqueadas', 'mias'],
  ];

  /**
   * Los que solo pueden ser un número no negativo.
   *
   * Se validan aquí y no solo al aplicarlos porque un `?priceMax=hola` escrito a
   * mano tiene que desaparecer, no llegar al campo y quedarse ahí filtrando por
   * nada mientras el contador dice que hay un filtro activo.
   */
  const NUMERICOS = new Set([
    'priceMin', 'priceMax', 'bidMin', 'bidMax',
    'areaMin', 'areaMax', 'beds', 'stratumMin', 'stratumMax',
  ]);

  /**
   * Tipos de ficha que acepta `/api/property`, para el enlace directo a una
   * oportunidad concreta (`?kind=banco&id=…`) que reparte el asistente.
   *
   * Son singulares y NO coinciden con los nombres de las pestañas —`banco` frente
   * a `bancos`—, así que los dos parámetros pueden convivir sin pisarse.
   */
  const KINDS_FICHA = ['portal', 'banco', 'remate'];

  /** Ningún valor legítimo de un filtro llega a esto. Corta la basura pegada a mano. */
  const MAX_LARGO = 80;
  /** El servidor tampoco sirve más allá de este tramo; ver el aviso de `renderPager`. */
  // 40, el mismo tope que el paginador ofrece y que el servidor sabe servir
  // (`MAX_PAGINAS_NAVEGABLES` en `server/queries.ts`). Estaba en 500: una URL con
  // `page=200` pasaba el validador, la petición tardaba un minuto en morir y la
  // pantalla se quedaba en «Buscando…» todo ese rato. Aceptar lo que no se puede
  // servir no es ser permisivo, es hacer esperar para nada.
  const MAX_PAGINA = 40;

  /**
   * Deja el valor como debe viajar, o `null` si no es un filtro de verdad.
   *
   * El vacío, el espacio en blanco y el número imposible se tratan igual: no se
   * escriben. Una dirección con `priceMax=` no dice nada y ensucia lo que la
   * persona va a copiar y pegar.
   */
  function limpiar(parametro, valor) {
    if (valor == null) return null;
    const texto = String(valor).trim();
    if (!texto || texto.length > MAX_LARGO) return null;
    if (NUMERICOS.has(parametro)) {
      const numero = Number(texto);
      if (!Number.isFinite(numero) || numero < 0) return null;
      // Normalizado: `?priceMax=0300` y `?priceMax=300` son la misma búsqueda y
      // deben producir la misma dirección, o dos enlaces iguales parecerían
      // distintos.
      return String(numero);
    }
    return texto;
  }

  function pagina(valor) {
    const numero = Math.floor(Number(valor));
    return Number.isFinite(numero) && numero >= 1 && numero <= MAX_PAGINA ? numero : 1;
  }

  /**
   * El estado de la búsqueda, escrito como cadena de consulta (sin el `?`).
   *
   * Lo que está en su valor por defecto NO se escribe: la portada no lleva `tab`,
   * la primera página no lleva `page` y el orden solo aparece cuando la persona lo
   * cambió. Una dirección con seis parámetros que son todos «lo de siempre» no se
   * lee, y lo que se quiere es que quien la reciba vea de un vistazo qué se buscó.
   * Por eso `ordenPorDefecto` entra como dato y no como constante: el orden inicial
   * lo decide `ORDERS` en `app.js` y es distinto en cada pestaña.
   */
  function serializar(estado) {
    const params = new URLSearchParams();
    const tab = PESTANAS.includes(estado && estado.tab) ? estado.tab : 'home';
    if (tab !== 'home') params.set('tab', tab);
    const filtros = (estado && estado.filtros) || {};
    for (const par of CONTROLES) {
      const parametro = par[1];
      const valor = limpiar(parametro, filtros[parametro]);
      if (valor == null) continue;
      if (parametro === 'order' && valor === (estado && estado.ordenPorDefecto)) continue;
      params.set(parametro, valor);
    }
    // La página solo significa algo donde hay paginador. En la portada y en
    // Guardados no lo hay, y arrastrar `page=3` a una pantalla sin páginas es
    // prometer un sitio al que volver que no existe.
    const numero = pagina(estado && estado.page);
    if (numero > 1 && tab !== 'home' && tab !== 'guardados') params.set('page', String(numero));
    return params.toString();
  }

  /**
   * Lo contrario: qué búsqueda describe esta dirección.
   *
   * `explicito` es la pieza que decide quién manda cuando hay dirección Y hay
   * Radar guardado. Vale `true` cuando la URL dijo algo sobre la búsqueda —una
   * pestaña o cualquier filtro—, y entonces la URL gana: es una intención escrita
   * y reciente, mientras que la preferencia guardada es una suposición sobre lo
   * que le interesará a esta persona. Con `false` —alguien que entra a la raíz—
   * la preferencia sigue proponiendo el punto de partida como hasta ahora.
   *
   * Un enlace directo a una ficha (`?kind=…&id=…`) NO cuenta como búsqueda: lleva
   * a una oportunidad concreta y no dice nada sobre qué listado mirar detrás.
   */
  function leer(busqueda) {
    const params = new URLSearchParams(String(busqueda == null ? '' : busqueda).replace(/^\?/, ''));
    const filtros = {};
    for (const par of CONTROLES) {
      const parametro = par[1];
      const valor = limpiar(parametro, params.get(parametro));
      if (valor != null) filtros[parametro] = valor;
    }
    const pedida = params.get('tab');
    const tabDeLaUrl = PESTANAS.includes(pedida) ? pedida : null;
    const hayFiltros = Object.keys(filtros).length > 0;
    const kind = params.get('kind');
    const id = params.get('id');
    return {
      // Sin `tab` pero con filtros se entiende Portal: es la única sección donde
      // están todos los filtros, y es lo que alguien escribiendo `?city=cali` a
      // mano espera ver. Sin nada, la portada, que es por donde se entra.
      tab: tabDeLaUrl || (hayFiltros ? 'portal' : 'home'),
      page: pagina(params.get('page')),
      filtros,
      ficha: KINDS_FICHA.includes(kind) && id && String(id).length <= 100
        ? { kind, id: String(id) }
        : null,
      explicito: Boolean(tabDeLaUrl) || hayFiltros,
    };
  }

  window.__radarUrlEstado = { PESTANAS, CONTROLES, serializar, leer };
})();
