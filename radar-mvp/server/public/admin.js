'use strict';

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const STATUS_LABELS = {
  none: 'Sin suscripción',
  interested: 'Interesado',
  trialing: 'En prueba',
  active: 'Activo',
  past_due: 'Pago pendiente',
  canceled: 'Cancelado',
};

let adminToken = '';

/** Miles con separador colombiano; `null` se muestra como raya, nunca como 0. */
const numero = (valor) => (valor === null || valor === undefined
  ? '—'
  : Number(valor).toLocaleString('es-CO'));

/**
 * Porcentaje con un decimal. Un `null` es «no hay descuentos evaluados en esa
 * ciudad», que no es lo mismo que «0 % de descuento»: mostrarlo como 0 haría
 * ver la ciudad como sin ganga cuando en realidad está sin analizar.
 */
const porcentaje = (valor) => (valor === null || valor === undefined
  ? '—'
  : `${Number(valor).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

/** La base guarda slugs en minúscula (`santa marta`); aquí solo se presentan. */
const nombreCiudad = (slug) => String(slug ?? '')
  .split(' ')
  .filter(Boolean)
  .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
  .join(' ');

/**
 * Fecha legible que nunca escribe «Invalid Date» en pantalla.
 *
 * Las marcas de tiempo llegan de Postgres y su formato depende del driver y de
 * la zona horaria configurada en la base. Un formato que `Date` no sepa leer no
 * puede acabar impreso tal cual delante del cliente: se muestra el texto crudo,
 * que al menos es información, en vez de un error del navegador.
 */
const fechaHora = (iso) => {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('es-CO') : String(iso);
};

/** «28 jul» — el eje de días necesita algo corto que no se monte con el vecino. */
const diaCorto = (dia) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${d.getUTCDate()} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getUTCMonth()]}`;
};

const plural = (n, singular, plural_) => `${numero(n)} ${n === 1 ? singular : plural_}`;

async function adminFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}

const mostrar = (id) => { const el = document.getElementById(id); if (el) el.hidden = false; };

/* ════════════════════════════  Motor de gráficas  ════════════════════════════

   SVG en línea generado por JS: la CSP del servidor prohíbe cargar scripts de
   terceros, así que no hay Chart.js ni ninguna otra librería — y tampoco hace
   falta para cuatro formas.

   La PALETA no es de gusto: son los colores de marca (morado #613174, dorado
   #F1C901) desplazados en luminosidad hasta entrar en la banda que exige el
   método de visualización, y verificados con su validador contra el fondo
   blanco de las tarjetas. El morado de marca a secas queda demasiado oscuro
   (OKLCH L 0.41) y el dorado de marca demasiado claro (L 0.85; 1,6:1 de
   contraste, ilegible como relleno). Los pares elegidos pasan las seis
   comprobaciones — banda de luminosidad, croma, separación bajo daltonismo
   (ΔE 30,4), suelo de visión normal (ΔE 31,6) y contraste ≥ 3:1.

   El color SEMÁNTICO es aparte del de marca, a propósito: bien/aviso/mal no son
   identidad de serie, y si el dorado de marca hiciera de «aviso», un día que se
   cambie la marca cambiaría el significado de un gráfico. */
const VIZ = {
  serie1: '#6f3885',   // morado de marca ajustado — identidad, no valor
  serie2: '#a88a00',   // dorado de marca ajustado
  bien: '#0ca30c',
  aviso: '#fab219',
  mal: '#d03b3b',
  neutro: '#898781',
  pista: '#efe7f3',    // fondo de medidor: paso claro de la misma rampa morada
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(nombre, atributos = {}) {
  const el = document.createElementNS(SVG_NS, nombre);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor !== null && valor !== undefined) el.setAttribute(clave, String(valor));
  }
  return el;
}

/**
 * Columna con la punta redondeada y la base cuadrada.
 *
 * Redondear también abajo despegaría visualmente la barra de la línea base y las
 * alturas dejarían de compararse bien, que es lo único que una columna hace.
 */
function caminoColumna(x, y, ancho, alto, radio) {
  const r = Math.max(0, Math.min(radio, ancho / 2, alto));
  return `M${x} ${y + alto} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} `
    + `L${x + ancho - r} ${y} Q${x + ancho} ${y} ${x + ancho} ${y + r} L${x + ancho} ${y + alto} Z`;
}

/** Barra horizontal: punta redondeada a la derecha, cuadrada contra el eje. */
function caminoBarra(x, y, ancho, alto, radio) {
  const r = Math.max(0, Math.min(radio, alto / 2, ancho));
  return `M${x} ${y} L${x + ancho - r} ${y} Q${x + ancho} ${y} ${x + ancho} ${y + r} `
    + `L${x + ancho} ${y + alto - r} Q${x + ancho} ${y + alto} ${x + ancho - r} ${y + alto} L${x} ${y + alto} Z`;
}

/**
 * Globo de detalle compartido por todas las gráficas.
 *
 * Se monta una sola vez por tarjeta y se mueve; crear uno por marca dejaría
 * cientos de nodos en el DOM. El contenido entra SIEMPRE por `textContent`: los
 * nombres de ciudad y de fuente los escribe un scraper contra un portal ajeno,
 * así que es texto de terceros por mucho que hoy sean slugs limpios.
 */
function prepararGlobo(tarjeta) {
  let globo = tarjeta.querySelector('.viz-tip');
  if (!globo) {
    globo = document.createElement('div');
    globo.className = 'viz-tip';
    globo.setAttribute('role', 'presentation');
    globo.hidden = true;
    tarjeta.appendChild(globo);
  }
  return globo;
}

/**
 * Conecta una marca con el globo.
 *
 * `aria-label` lleva el mismo texto que el globo: así el lector de pantalla no
 * depende de un elemento visual que aparece y desaparece, y el globo se queda
 * como lo que es —una ayuda para el ratón—. Además cada gráfica trae su tabla
 * equivalente abajo, así que ningún valor vive solo dentro del globo.
 */
function conectarGlobo(marca, tarjeta, globo, titulo, lineas) {
  marca.setAttribute('aria-label', [titulo, ...lineas.map(
    (linea) => `${linea.etiqueta ?? linea}${linea.valor ? `: ${linea.valor}` : ''}`,
  )].join('. '));
  marca.setAttribute('tabindex', '0');
  marca.setAttribute('role', 'img');

  const pintar = () => {
    globo.replaceChildren();
    const t = document.createElement('strong');
    t.textContent = titulo;
    globo.appendChild(t);
    for (const linea of lineas) {
      const fila = document.createElement('span');
      if (linea.color) {
        const llave = document.createElement('i');
        llave.style.background = linea.color;
        fila.appendChild(llave);
      }
      const etiqueta = document.createElement('em');
      etiqueta.textContent = linea.etiqueta ?? String(linea);
      // El VALOR manda y la etiqueta acompaña: quien mira el globo ya sabe qué
      // serie es —tiene el puntero encima— y lo que viene a buscar es el número.
      const valor = document.createElement('b');
      valor.textContent = linea.valor ?? '';
      fila.append(etiqueta, valor);
      globo.appendChild(fila);
    }
    const caja = marca.getBoundingClientRect();
    const base = tarjeta.getBoundingClientRect();
    globo.hidden = false;
    const ancho = globo.offsetWidth;
    const izquierda = caja.left - base.left + caja.width / 2 - ancho / 2;
    globo.style.left = `${Math.max(6, Math.min(izquierda, base.width - ancho - 6))}px`;
    globo.style.top = `${Math.max(0, caja.top - base.top - globo.offsetHeight - 8)}px`;
  };
  const ocultar = () => { globo.hidden = true; };

  marca.addEventListener('pointerenter', pintar);
  marca.addEventListener('focus', pintar);
  marca.addEventListener('pointerleave', ocultar);
  marca.addEventListener('blur', ocultar);
}

/**
 * Ancho útil de la caja donde va a caber una gráfica.
 *
 * El ranking de ciudades no tiene ninguna razón para desbordarse: su ancho es
 * arbitrario, así que se adapta a lo que haya. El histograma sí se desborda a
 * propósito en pantallas estrechas —catorce tramos no caben en 343 px sin dejar
 * áreas sensibles de 10 px— y para eso está el desplazamiento de `.viz-scroll`.
 */
function anchoDisponible(destino, minimo, maximo) {
  const caja = destino.closest('.viz-scroll') ?? destino;
  const ancho = caja.clientWidth || maximo;
  return Math.max(minimo, Math.min(maximo, ancho));
}

/**
 * Vuelve a pintar las gráficas cuando cambia el ancho.
 *
 * Se guarda la última respuesta de cada endpoint en vez de volver a pedirla:
 * girar el teléfono no puede disparar las ~60 consultas de la tabla de zonas.
 */
const ultimaCarga = { metricas: null, zonas: null };
let temporizadorAncho = null;
window.addEventListener('resize', () => {
  clearTimeout(temporizadorAncho);
  temporizadorAncho = setTimeout(() => {
    if (ultimaCarga.metricas) renderCorridas(ultimaCarga.metricas.scraping, ultimaCarga.metricas.ventanaDias);
    if (ultimaCarga.zonas) {
      renderCiudades(ultimaCarga.zonas.zonas);
      if (ultimaCarga.zonas.histogramaDescuentos) renderDescuentos(ultimaCarga.zonas.histogramaDescuentos);
    }
  }, 200);
});

/** Leyenda: identidad por texto además de por color, siempre que haya dos series. */
function pintarLeyenda(destino, series) {
  const el = document.getElementById(destino);
  if (!el) return;
  el.replaceChildren();
  for (const serie of series) {
    const chip = document.createElement('span');
    chip.className = 'viz-legend-item';
    const punto = document.createElement('i');
    punto.style.background = serie.color;
    const texto = document.createElement('span');
    texto.textContent = serie.nombre;
    chip.append(punto, texto);
    el.appendChild(chip);
  }
}

/** Ejes y rejilla: hairline sólida, un paso por encima del fondo, sin protagonismo. */
function pintarEjeY(raiz, marcas, geo) {
  const grupo = svg('g', { class: 'viz-eje' });
  for (const marca of marcas) {
    const y = geo.base - (marca / geo.maxEje) * geo.altoPlot;
    grupo.appendChild(svg('line', {
      x1: geo.izq, x2: geo.izq + geo.anchoPlot, y1: y, y2: y,
      class: marca === 0 ? 'viz-base' : 'viz-rejilla',
    }));
    const texto = svg('text', { x: geo.izq - 8, y: y + 4, class: 'viz-tick', 'text-anchor': 'end' });
    texto.textContent = numero(marca);
    grupo.appendChild(texto);
  }
  raiz.appendChild(grupo);
}

/* ──────────────  Gráfica 1: corridas de scraping por día  ────────────── */

/**
 * Columnas apiladas por estado.
 *
 * Los estados llevan color SEMÁNTICO y no de serie: `success` y `error` no son
 * «la serie 1 y la serie 3», significan bien y mal. Van siempre con su nombre en
 * la leyenda y en el globo, que es lo que hace que el color no cargue solo con
 * el significado (el amarillo de aviso no llega a 3:1 sobre blanco, y esa es la
 * compensación prevista para él).
 */
const SERIES_CORRIDAS = [
  { id: 'exito', nombre: 'Éxito', color: VIZ.bien },
  { id: 'parcial', nombre: 'Parcial', color: VIZ.aviso },
  { id: 'error', nombre: 'Error', color: VIZ.mal },
  { id: 'enCurso', nombre: 'En curso', color: VIZ.neutro },
];

function renderCorridas(scraping, ventanaDias) {
  const destino = document.getElementById('corridas-grafica');
  const tarjeta = destino.closest('.viz-card');
  const globo = prepararGlobo(tarjeta);
  destino.replaceChildren();
  pintarLeyenda('corridas-leyenda', SERIES_CORRIDAS);

  const dias = scraping.dias;
  const banda = 27;         // ≥ 24 px de área sensible por columna
  const barra = 19;         // marca fina: nunca llena la banda
  const geo = {
    izq: 40, arriba: 12, altoPlot: 180, anchoPlot: dias.length * banda,
    maxEje: scraping.maxEje || 1,
  };
  geo.base = geo.arriba + geo.altoPlot;
  const alto = geo.base + 34;   // la banda del eje X entra en el alto, no se recorta
  const ancho = geo.izq + geo.anchoPlot + 14;

  const raiz = svg('svg', {
    class: 'viz-svg', viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto,
    role: 'img',
    'aria-label': `Corridas de scraping por día en los últimos ${ventanaDias} días.`
      + ` ${plural(scraping.totalCorridas, 'corrida', 'corridas')} en total,`
      + ` ${plural(scraping.totalFallidas, 'fallida', 'fallidas')}.`,
  });
  pintarEjeY(raiz, scraping.marcasEje, geo);

  dias.forEach((dia, indice) => {
    const x = geo.izq + indice * banda + (banda - barra) / 2;

    // El área sensible cubre la banda entera —no solo los píxeles pintados—:
    // apuntarle a una columna de 19 px de ancho y 4 de alto sería imposible, y
    // los días sin corridas no tendrían nada que tocar aunque el hueco sea
    // justamente el dato interesante.
    const zona = svg('rect', {
      x: geo.izq + indice * banda, y: geo.arriba, width: banda, height: geo.altoPlot + 6,
      class: 'viz-hit',
    });
    conectarGlobo(zona, tarjeta, globo, diaCorto(dia.dia), dia.total === 0
      ? [{ etiqueta: 'Sin corridas', valor: '' }]
      : [
        ...SERIES_CORRIDAS
          .filter((serie) => dia[serie.id] > 0)
          .map((serie) => ({ etiqueta: serie.nombre, valor: numero(dia[serie.id]), color: serie.color })),
        { etiqueta: 'Registros insertados', valor: numero(dia.insertados) },
      ]);

    let acumulado = 0;
    for (const serie of SERIES_CORRIDAS) {
      const valor = dia[serie.id] || 0;
      if (!valor) continue;
      const altoTotal = (valor / geo.maxEje) * geo.altoPlot;
      // 2 px de fondo separan un segmento del siguiente. Es el hueco el que los
      // distingue, no un borde: un borde añadiría tinta que no es dato.
      const esCima = acumulado + valor >= dia.total;
      const altoSegmento = Math.max(1, altoTotal - (esCima ? 0 : 2));
      const y = geo.base - ((acumulado + valor) / geo.maxEje) * geo.altoPlot;
      raiz.appendChild(svg('path', {
        d: caminoColumna(x, y, barra, altoSegmento, esCima ? 4 : 0),
        fill: serie.color,
      }));
      acumulado += valor;
    }
    raiz.appendChild(zona);

    // Ni una etiqueta por columna: 30 números pegados no los lee nadie. El eje
    // marca uno de cada cinco y el resto lo llevan el globo y la tabla.
    if (indice % 5 === 0 || indice === dias.length - 1) {
      const texto = svg('text', {
        x: geo.izq + indice * banda + banda / 2, y: geo.base + 20,
        class: 'viz-tick', 'text-anchor': 'middle',
      });
      texto.textContent = diaCorto(dia.dia);
      raiz.appendChild(texto);
    }
  });

  destino.appendChild(raiz);
  // En una pantalla estrecha la caja arranca mostrando los días MÁS RECIENTES:
  // nadie abre el panel para ver qué pasó hace cuatro semanas.
  const caja = destino.closest('.viz-scroll');
  if (caja) caja.scrollLeft = caja.scrollWidth;

  const resumen = document.getElementById('corridas-resumen');
  const activos = dias.filter((d) => d.total > 0).length;
  resumen.textContent = scraping.totalCorridas === 0
    ? `Sin ninguna corrida registrada en los últimos ${ventanaDias} días.`
    : `${plural(scraping.totalCorridas, 'corrida', 'corridas')} en ${plural(activos, 'día', 'días')} distintos`
      + `, ${plural(scraping.totalFallidas, 'con error', 'con error')}`
      + `${scraping.fuentes.length ? `. Fuentes: ${scraping.fuentes.join(', ')}` : ''}.`;

  const cuerpo = document.querySelector('#corridas-tabla tbody');
  cuerpo.replaceChildren();
  for (const dia of [...dias].reverse()) {
    const fila = document.createElement('tr');
    const cabecera = document.createElement('th');
    cabecera.scope = 'row';
    cabecera.textContent = dia.dia;
    fila.appendChild(cabecera);
    for (const valor of [dia.exito, dia.parcial, dia.error, dia.enCurso, dia.insertados]) {
      const celda = document.createElement('td');
      celda.textContent = numero(valor);
      fila.appendChild(celda);
    }
    cuerpo.appendChild(fila);
  }
}

/* ─────────────  Gráfica 2: trabajos automáticos vs su cadencia  ───────────── */

const SERIES_TRABAJOS = [
  { id: 'aldia', nombre: 'Al día', color: VIZ.bien },
  { id: 'porvencer', nombre: 'Por vencer', color: VIZ.aviso },
  { id: 'vencido', nombre: 'Vencido', color: VIZ.mal },
  { id: 'pausa', nombre: 'En pausa o sin datos', color: VIZ.neutro },
];

/** Un medidor por trabajo: es una razón contra un límite, no una serie temporal. */
function claseTrabajo(trabajo) {
  if (!trabajo.habilitado || trabajo.avance === null) return SERIES_TRABAJOS[3];
  if (trabajo.vencido) return SERIES_TRABAJOS[2];
  if (trabajo.avance >= 0.7) return SERIES_TRABAJOS[1];
  return SERIES_TRABAJOS[0];
}

function renderTrabajos(trabajos) {
  const destino = document.getElementById('trabajos-grafica');
  const tarjeta = destino.closest('.viz-card');
  const globo = prepararGlobo(tarjeta);
  destino.replaceChildren();
  pintarLeyenda('trabajos-leyenda', SERIES_TRABAJOS);

  for (const trabajo of trabajos) {
    const clase = claseTrabajo(trabajo);
    const fila = document.createElement('div');
    fila.className = 'viz-medidor';

    const cabeza = document.createElement('div');
    cabeza.className = 'viz-medidor-cabeza';
    const nombre = document.createElement('strong');
    nombre.textContent = trabajo.nombre;
    // El estado va con NOMBRE y no solo con color: el amarillo de aviso no
    // alcanza 3:1 sobre blanco, y un estado que solo se distingue por matiz deja
    // fuera a quien no distingue ese matiz.
    const chip = document.createElement('span');
    chip.className = `viz-chip viz-chip-${trabajo.estado === 'error' ? 'mal' : (trabajo.estado === 'sin-datos' ? 'neutro' : 'bien')}`;
    chip.textContent = trabajo.estado === 'error'
      ? 'Última corrida con error'
      : (trabajo.estado === 'sin-datos' ? 'Nunca ha corrido' : 'Última corrida correcta');
    cabeza.append(nombre, chip);
    if (!trabajo.habilitado) {
      const pausa = document.createElement('span');
      pausa.className = 'viz-chip viz-chip-neutro';
      pausa.textContent = 'En pausa';
      cabeza.appendChild(pausa);
    }
    fila.appendChild(cabeza);

    const ancho = 520;
    const alto = 16;
    const raiz = svg('svg', {
      class: 'viz-svg viz-svg-medidor', viewBox: `0 0 ${ancho} ${alto}`,
      preserveAspectRatio: 'none', role: 'img',
      'aria-label': `${trabajo.nombre}: cadencia de ${plural(trabajo.cadenciaDias, 'día', 'días')}, `
        + (trabajo.diasDesde === null
          ? 'sin corridas registradas.'
          : `última corrida hace ${trabajo.diasDesde} días. ${clase.nombre}.`),
    });
    // La pista es un paso claro de la MISMA rampa que el relleno, para que el
    // estado se lea a lo largo de toda la barra y no solo en la parte llena.
    raiz.appendChild(svg('path', {
      d: caminoBarra(0, 0, ancho, alto, 4), fill: VIZ.pista,
    }));
    const relleno = Math.max(0, Math.min(1, trabajo.avance ?? 0)) * ancho;
    if (relleno > 0) {
      raiz.appendChild(svg('path', {
        d: caminoBarra(0, 0, Math.max(6, relleno), alto, 4), fill: clase.color,
      }));
    }
    const zona = svg('rect', { x: 0, y: 0, width: ancho, height: alto, class: 'viz-hit' });
    conectarGlobo(zona, tarjeta, globo, trabajo.nombre, [
      { etiqueta: 'Estado', valor: clase.nombre, color: clase.color },
      { etiqueta: 'Cadencia', valor: `cada ${plural(trabajo.cadenciaDias, 'día', 'días')}` },
      {
        etiqueta: 'Última corrida',
        valor: trabajo.ultimaCorrida ? `hace ${trabajo.diasDesde} d · ${fechaHora(trabajo.ultimaCorrida)}` : 'nunca',
      },
    ]);
    raiz.appendChild(zona);

    const marco = document.createElement('div');
    marco.className = 'viz-medidor-barra';
    marco.appendChild(raiz);
    fila.appendChild(marco);

    const pie = document.createElement('span');
    pie.className = 'viz-medidor-pie';
    pie.textContent = trabajo.diasDesde === null
      ? `Nunca ha corrido · cadencia cada ${plural(trabajo.cadenciaDias, 'día', 'días')}`
      : `Hace ${trabajo.diasDesde} d de ${plural(trabajo.cadenciaDias, 'día', 'días')} de cadencia`
        + (trabajo.vencido ? ' · le toca ya' : '');
    fila.appendChild(pie);

    destino.appendChild(fila);
  }

  const cuerpo = document.querySelector('#trabajos-tabla tbody');
  cuerpo.replaceChildren();
  for (const trabajo of trabajos) {
    const fila = document.createElement('tr');
    const cabecera = document.createElement('th');
    cabecera.scope = 'row';
    cabecera.textContent = trabajo.nombre;
    fila.appendChild(cabecera);
    const celdas = [
      claseTrabajo(trabajo).nombre + (trabajo.estado === 'error' ? ' · última con error' : ''),
      `cada ${plural(trabajo.cadenciaDias, 'día', 'días')}`,
      fechaHora(trabajo.ultimaCorrida),
      trabajo.diasDesde === null ? '—' : `${trabajo.diasDesde} d`,
    ];
    for (const valor of celdas) {
      const celda = document.createElement('td');
      celda.textContent = valor;
      fila.appendChild(celda);
    }
    cuerpo.appendChild(fila);
  }
}

/* ────────────  Gráfica 3: ranking de oportunidades por ciudad  ──────────── */

/** Cuántas ciudades entran al ranking. Doce caben sin que el eje se vuelva ilegible. */
const CIUDADES_EN_RANKING = 12;

/**
 * Barras horizontales, TODAS del mismo color.
 *
 * Colorear cada ciudad de un tono distinto —o degradar por valor— gastaría el
 * canal de identidad en repetir lo que la longitud de la barra ya dice. Las
 * ciudades no tienen orden natural: son una sola serie, un solo color.
 */
function renderCiudades(zonas) {
  const destino = document.getElementById('ciudades-grafica');
  const tarjeta = destino.closest('.account-card');
  const globo = prepararGlobo(tarjeta);
  destino.replaceChildren();

  const filas = zonas.slice(0, CIUDADES_EN_RANKING);
  if (!filas.length) {
    destino.textContent = 'Todavía no hay oportunidades detectadas por el motor.';
    return;
  }

  const anchoEtiqueta = 104;
  const anchoValor = 62;
  const altoFila = 28;
  const barra = 16;
  // El plot toma lo que sobre tras la etiqueta y el valor. Sin esto, en 375 px
  // la barra más larga —la que encabeza el ranking— se salía de la caja y su
  // cifra quedaba fuera de la pantalla: justo el dato que se viene a mirar.
  const ancho = anchoDisponible(destino, anchoEtiqueta + 120 + anchoValor, 416);
  const anchoPlot = ancho - anchoEtiqueta - anchoValor;
  const alto = filas.length * altoFila + 6;
  const maximo = Math.max(...filas.map((f) => f.oportunidades), 1);

  const raiz = svg('svg', {
    class: 'viz-svg', viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto,
    role: 'img',
    'aria-label': `Las ${filas.length} ciudades con más oportunidades activas. `
      + `Encabeza ${nombreCiudad(filas[0].ciudad)} con ${numero(filas[0].oportunidades)}.`,
  });

  filas.forEach((zona, indice) => {
    const y = indice * altoFila + 3;
    const largo = Math.max(2, (zona.oportunidades / maximo) * anchoPlot);

    const etiqueta = svg('text', {
      x: anchoEtiqueta - 8, y: y + barra / 2 + 4, class: 'viz-tick', 'text-anchor': 'end',
    });
    etiqueta.textContent = nombreCiudad(zona.ciudad);
    raiz.appendChild(etiqueta);

    raiz.appendChild(svg('path', {
      d: caminoBarra(anchoEtiqueta, y, largo, barra, 4), fill: VIZ.serie1,
    }));

    // Etiqueta directa en la punta y por fuera de la barra: dentro no cabría en
    // las ciudades pequeñas y quedaría recortada, que es peor que no ponerla.
    const valor = svg('text', {
      x: anchoEtiqueta + largo + 7, y: y + barra / 2 + 4, class: 'viz-valor',
    });
    valor.textContent = numero(zona.oportunidades);
    raiz.appendChild(valor);

    const zona_ = svg('rect', {
      x: 0, y: indice * altoFila, width: ancho, height: altoFila, class: 'viz-hit',
    });
    conectarGlobo(zona_, tarjeta, globo, nombreCiudad(zona.ciudad), [
      { etiqueta: 'Oportunidades', valor: numero(zona.oportunidades), color: VIZ.serie1 },
      { etiqueta: 'De ellas, altas', valor: numero(zona.oportunidadesAltas) },
      { etiqueta: 'Descuento medio', valor: porcentaje(zona.descuentoMedio) },
      { etiqueta: 'Inmuebles activos', valor: numero(zona.inmueblesActivos) },
    ]);
    raiz.appendChild(zona_);
  });

  destino.appendChild(raiz);
}

/* ──────────  Gráfica 4: distribución de descuentos (histograma)  ────────── */

const SERIES_DESCUENTOS = [
  { id: 'altas', nombre: 'Oportunidad alta', color: VIZ.serie1 },
  { id: 'resto', nombre: 'Resto de oportunidades', color: VIZ.serie2 },
];

function renderDescuentos(histograma) {
  const destino = document.getElementById('descuentos-grafica');
  const tarjeta = destino.closest('.account-card');
  const globo = prepararGlobo(tarjeta);
  destino.replaceChildren();
  pintarLeyenda('descuentos-leyenda', SERIES_DESCUENTOS);

  const tramos = histograma.tramos;
  // Los tramos vacíos de la cola alargan el gráfico sin decir nada: se corta
  // después del último tramo con datos, pero nunca antes (perder la cola sería
  // esconder justo los descuentos grandes).
  let ultimo = tramos.length - 1;
  while (ultimo > 0 && tramos[ultimo].total === 0) ultimo -= 1;
  const visibles = tramos.slice(0, ultimo + 1);

  const banda = 30;
  const barra = 22;
  const geo = {
    izq: 46, arriba: 12, altoPlot: 150, anchoPlot: visibles.length * banda,
    maxEje: 1,
  };
  const marcas = marcasDeEjeCliente(Math.max(...visibles.map((t) => t.total), 0));
  geo.maxEje = marcas[marcas.length - 1] || 1;
  geo.base = geo.arriba + geo.altoPlot;
  const alto = geo.base + 34;
  const ancho = geo.izq + geo.anchoPlot + 14;

  const raiz = svg('svg', {
    class: 'viz-svg', viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto,
    role: 'img',
    'aria-label': `Distribución de las ${numero(histograma.conDescuento)} oportunidades por tramo de descuento.`,
  });
  pintarEjeY(raiz, marcas, geo);

  visibles.forEach((tramo, indice) => {
    const x = geo.izq + indice * banda + (banda - barra) / 2;
    const resto = Math.max(0, tramo.total - tramo.altas);
    let acumulado = 0;
    for (const serie of SERIES_DESCUENTOS) {
      const valor = serie.id === 'altas' ? tramo.altas : resto;
      if (!valor) continue;
      const esCima = acumulado + valor >= tramo.total;
      const altoTotal = (valor / geo.maxEje) * geo.altoPlot;
      const altoSegmento = Math.max(1, altoTotal - (esCima ? 0 : 2));
      const y = geo.base - ((acumulado + valor) / geo.maxEje) * geo.altoPlot;
      raiz.appendChild(svg('path', {
        d: caminoColumna(x, y, barra, altoSegmento, esCima ? 4 : 0), fill: serie.color,
      }));
      acumulado += valor;
    }

    const zona = svg('rect', {
      x: geo.izq + indice * banda, y: geo.arriba, width: banda, height: geo.altoPlot + 6, class: 'viz-hit',
    });
    conectarGlobo(zona, tarjeta, globo, `Descuento ${tramo.desde} – ${tramo.hasta} %`, [
      { etiqueta: 'Oportunidad alta', valor: numero(tramo.altas), color: VIZ.serie1 },
      { etiqueta: 'Resto', valor: numero(resto), color: VIZ.serie2 },
      { etiqueta: 'Total del tramo', valor: numero(tramo.total) },
    ]);
    raiz.appendChild(zona);

    if (indice % 2 === 0 || indice === visibles.length - 1) {
      const texto = svg('text', {
        x: geo.izq + indice * banda + banda / 2, y: geo.base + 20,
        class: 'viz-tick', 'text-anchor': 'middle',
      });
      texto.textContent = `${tramo.desde}%`;
      raiz.appendChild(texto);
    }
  });

  destino.appendChild(raiz);

  const resumen = document.getElementById('descuentos-resumen');
  resumen.textContent = histograma.sinDescuento > 0
    ? `${numero(histograma.conDescuento)} oportunidades con descuento calculado; `
      + `${numero(histograma.sinDescuento)} todavía sin valorar por el motor.`
    : `${numero(histograma.conDescuento)} oportunidades con descuento calculado.`;
}

/**
 * Misma familia de pasos que `marcasDeEje` del servidor (1 · 2 · 5 × 10ⁿ).
 *
 * Se repite aquí —y solo aquí— porque el histograma se calcula sobre la
 * respuesta de zonas, que no pasa por el módulo de métricas. Es media docena de
 * líneas; la alternativa era una consulta más solo para traer cuatro números.
 */
function marcasDeEjeCliente(maximo, objetivo = 4) {
  const max = Number.isFinite(maximo) ? Math.max(0, maximo) : 0;
  if (max <= 0) return [0, 1];
  const crudo = max / objetivo;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const n = crudo / magnitud;
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitud;
  const marcas = [];
  for (let v = 0; v < max - 1e-9; v += paso) marcas.push(Number(v.toFixed(6)));
  marcas.push(Number((marcas.length * paso).toFixed(6)));
  return marcas;
}

/* ══════════════════════════  Secciones del panel  ══════════════════════════ */

function renderQueue(items) {
  const list = document.getElementById('commercial-queue-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No hay solicitudes ni suscripciones para gestionar.</div>';
    return;
  }
  list.innerHTML = items.map((item) => `
    <article class="commercial-item" data-user-id="${esc(item.userId)}">
      <div class="commercial-person">
        <strong>${esc(item.name || item.email || 'Usuario')}</strong>
        <span>${esc(item.email)}</span>
        <small>${item.requestedAt
          ? `Solicitud: ${new Date(item.requestedAt).toLocaleString('es-CO')}`
          : 'Sin solicitud comercial previa'}</small>
      </div>
      <div class="commercial-status">
        <span class="status-chip status-${esc(item.subscriptionStatus)}">${esc(STATUS_LABELS[item.subscriptionStatus] || item.subscriptionStatus)}</span>
        ${item.note ? `<small>${esc(item.note)}</small>` : ''}
      </div>
      <div class="commercial-actions">
        <label>
          Nuevo estado
          <select data-subscription-status>
            ${item.subscriptionStatus === 'interested'
              ? '<option value="" selected disabled>Selecciona un estado</option>'
              : ''}
            ${['none', 'trialing', 'active', 'past_due', 'canceled'].map((status) => `
              <option value="${status}" ${status === item.subscriptionStatus ? 'selected' : ''}>${STATUS_LABELS[status]}</option>
            `).join('')}
          </select>
        </label>
        <label>
          Motivo o referencia
          <input data-subscription-note maxlength="500" placeholder="Ej. prueba autorizada por 7 días">
        </label>
        <button class="portal-button" type="button" data-update-subscription>Aplicar cambio</button>
      </div>
    </article>
  `).join('');
}

/**
 * Tabla de oportunidades por zona.
 *
 * Todo lo que viene de la base pasa por `esc()` antes de entrar al HTML: el
 * nombre de ciudad lo escribe un scraper contra un portal externo, así que es
 * texto de terceros por mucho que hoy sean slugs limpios. Y no hay ni un
 * `onclick=` en esta plantilla: la CSP del servidor prohíbe el JavaScript en
 * línea y la página entera se caería en silencio.
 */
function renderZonas(data) {
  ultimaCarga.zonas = data;
  const resumen = data.resumen;
  document.getElementById('z-activos').textContent = numero(resumen.inmueblesActivos);
  document.getElementById('z-opps').textContent = numero(resumen.oportunidades);
  document.getElementById('z-altas').textContent = numero(resumen.oportunidadesAltas);
  document.getElementById('z-ciudades').textContent = numero(resumen.ciudadesConOportunidad);
  document.getElementById('z-medio').textContent = porcentaje(resumen.descuentoMedio);
  document.getElementById('z-mejor').textContent = porcentaje(resumen.mejorDescuento);
  document.getElementById('z-banco').textContent = numero(resumen.inmueblesBanco);
  document.getElementById('z-remates').textContent = numero(resumen.rematesActivos);

  // Se dice explícitamente que la tabla está recortada: si no, los totales de
  // arriba (que sí son del sistema completo) parecerían no cuadrar con la suma
  // de las filas y el panel perdería credibilidad delante del cliente.
  document.getElementById('zonas-alcance').textContent = resumen.ciudadesEnTabla >= resumen.ciudadesConOportunidad
    ? `Se listan las ${numero(resumen.ciudadesEnTabla)} ciudades con oportunidades detectadas.`
    : `Se listan las ${numero(resumen.ciudadesEnTabla)} ciudades con más oportunidades de ${numero(resumen.ciudadesConOportunidad)} con inventario detectado. Los totales de arriba son del sistema completo.`;

  renderCiudades(data.zonas);
  if (data.histogramaDescuentos) renderDescuentos(data.histogramaDescuentos);

  const tbody = document.getElementById('zonas-tbody');
  if (!data.zonas.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="zone-empty">Todavía no hay oportunidades detectadas por el motor.</td></tr>';
    return;
  }
  tbody.innerHTML = data.zonas.map((zona) => `
    <tr class="${zona.coberturaArriendos ? '' : 'zone-row-sin-arriendos'}">
      <th scope="row">${esc(nombreCiudad(zona.ciudad))}</th>
      <td>${esc(numero(zona.inmueblesActivos))}</td>
      <td>${esc(numero(zona.oportunidades))}</td>
      <td>${esc(numero(zona.oportunidadesAltas))}</td>
      <td>${esc(porcentaje(zona.descuentoMedio))}</td>
      <td>${esc(porcentaje(zona.mejorDescuento))}</td>
      <td>${esc(numero(zona.inmueblesBanco))}</td>
      <td>${esc(numero(zona.rematesActivos))}</td>
      <td>${zona.coberturaArriendos
        ? esc(numero(zona.arriendos))
        : '<span class="zone-flag">Sin cobertura</span>'}</td>
    </tr>
  `).join('');
}

async function loadZonas() {
  const message = document.getElementById('zonas-message');
  const retry = document.getElementById('zonas-retry');
  mostrar('grupo-inventario');
  retry.hidden = true;
  message.className = 'message';
  message.textContent = 'Calculando el inventario por ciudad…';
  try {
    const data = await adminFetch('/api/admin/oportunidades-por-zona');
    renderZonas(data);
    const sinArriendos = data.resumen.ciudadesSinArriendos;
    message.className = 'message';
    // Separador «·» y no punto: `toLocaleString('es-CO')` ya termina en «a. m.»
    // y encadenar un punto dejaba un «a. m..» a la vista del cliente.
    message.textContent = `Corte del inventario ${new Date(data.generadoEn).toLocaleString('es-CO')} · `
      + (sinArriendos
        ? `${numero(sinArriendos)} de las ciudades listadas no tienen comparables de arriendo`
        : 'todas las ciudades listadas tienen comparables de arriendo');
  } catch (error) {
    // Que falle el inventario no puede tumbar el resto del panel: la operación
    // comercial se sigue pudiendo usar aunque Supabase se demore en los conteos.
    message.className = 'message error';
    message.textContent = `No se pudo calcular el inventario por zona: ${error.message}`;
    retry.hidden = false;
  }
}

async function loadMetricas() {
  const message = document.getElementById('metricas-message');
  const retry = document.getElementById('metricas-retry');
  mostrar('grupo-sistema');
  retry.hidden = true;
  message.className = 'message';
  message.textContent = 'Leyendo el histórico de corridas…';
  try {
    const data = await adminFetch('/api/admin/metricas');
    ultimaCarga.metricas = data;
    renderCorridas(data.scraping, data.ventanaDias);
    renderTrabajos(data.trabajos);
    const vencidos = data.trabajos.filter((t) => t.vencido).length;
    message.className = vencidos ? 'message error' : 'message ok';
    message.textContent = vencidos
      ? `${plural(vencidos, 'trabajo automático pasado de su cadencia', 'trabajos automáticos pasados de su cadencia')}.`
        + ` Corte ${new Date(data.generadoEn).toLocaleString('es-CO')}`
      : `Todos los trabajos habilitados están dentro de su cadencia · corte ${new Date(data.generadoEn).toLocaleString('es-CO')}`;
  } catch (error) {
    message.className = 'message error';
    message.textContent = `No se pudieron leer las métricas de operación: ${error.message}`;
    retry.hidden = false;
  }
}

async function loadQueue() {
  const data = await adminFetch('/api/admin/plan-interests');
  renderQueue(data.interests);
  mostrar('grupo-comercial');
  mostrar('commercial-queue');
}

/* ═════════════════  Parámetros de la calculadora de gastos  ═════════════════ */

/** Inmueble de referencia para traducir los porcentajes a pesos de verdad. */
const VALOR_REFERENCIA = 200_000_000;
const CAMPOS_PARAMETROS = [
  ['notaria', 'param-notaria', 'notaria'],
  ['impuestoRegistro', 'param-impuesto', 'impuesto'],
  ['derechosRegistro', 'param-derechos', 'derechos'],
];
/** Mismos topes que valida el servidor; aquí solo para avisar antes de enviar. */
const MAX_PCT_LINEA = 5;
const MAX_PCT_TOTAL = 10;

let parametrosGuardados = null;

/**
 * El formulario trabaja en PORCENTAJE (0,27) y la base en fracción (0,0027).
 *
 * La conversión se hace en la frontera y en un solo sitio. Pedirle al
 * administrador que escriba «0,0027» sería pedirle que traduzca a mano cada vez
 * la cifra que le llega en un decreto, y ese es exactamente el momento en que se
 * pierde un cero.
 */
const aPorcentaje = (fraccion) => Number((fraccion * 100).toFixed(4));

/** Acepta la coma decimal, que es como se escribe un porcentaje en Colombia. */
function leerNumero(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!limpio || !/^\d*\.?\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

const pesos = (n) => `$${Math.round(n).toLocaleString('es-CO')}`;

function valoresDelFormulario() {
  const valores = {};
  for (const [clave, id] of CAMPOS_PARAMETROS) {
    valores[clave] = leerNumero(document.getElementById(id).value);
  }
  return valores;
}

/**
 * «Qué pasa si lo cambias», en pesos y comparado con lo que hay guardado.
 *
 * Es la parte del formulario que de verdad evita el error caro: un 10 % escrito
 * donde iba un 1 % se ve idéntico en el campo, pero aquí abajo la diferencia
 * salta de dos millones a veinte.
 */
function actualizarEfecto() {
  const caja = document.getElementById('param-efecto');
  const valores = valoresDelFormulario();
  caja.replaceChildren();

  const invalidos = CAMPOS_PARAMETROS.filter(([clave]) => valores[clave] === null);
  if (invalidos.length) {
    caja.className = 'param-efecto param-efecto-aviso';
    caja.textContent = 'Escribe los tres porcentajes con números (se admite la coma decimal).';
    return { ok: false };
  }

  const fuera = CAMPOS_PARAMETROS.filter(([clave]) => valores[clave] > MAX_PCT_LINEA);
  const total = CAMPOS_PARAMETROS.reduce((suma, [clave]) => suma + valores[clave], 0);
  if (fuera.length || total > MAX_PCT_TOTAL) {
    caja.className = 'param-efecto param-efecto-aviso';
    caja.textContent = fuera.length
      ? `Ningún porcentaje puede pasar del ${MAX_PCT_LINEA} %. ¿Escribiste una fracción (0,01) donde iba un porcentaje (1)?`
      : `Los tres juntos no pueden pasar del ${MAX_PCT_TOTAL} % del valor del inmueble; ahora suman ${total.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %.`;
    return { ok: false };
  }

  caja.className = 'param-efecto';
  const gastoNuevo = VALOR_REFERENCIA * (total / 100);
  const titulo = document.createElement('strong');
  titulo.textContent = `En un inmueble de ${pesos(VALOR_REFERENCIA)} la ficha estimará ${pesos(gastoNuevo)} de gastos (${total.toLocaleString('es-CO', { maximumFractionDigits: 2 })} % del valor).`;
  caja.appendChild(titulo);

  if (parametrosGuardados) {
    const totalGuardado = CAMPOS_PARAMETROS
      .reduce((suma, [clave]) => suma + aPorcentaje(parametrosGuardados[clave]), 0);
    const gastoAntes = VALOR_REFERENCIA * (totalGuardado / 100);
    const delta = gastoNuevo - gastoAntes;
    const linea = document.createElement('span');
    linea.textContent = Math.abs(delta) < 1
      ? 'Es exactamente lo que se está aplicando ahora mismo.'
      : `Hoy estima ${pesos(gastoAntes)}: el cambio ${delta > 0 ? 'sube' : 'baja'} la cuenta en ${pesos(Math.abs(delta))} sobre ese inmueble.`;
    caja.appendChild(linea);
  }

  const nota = document.createElement('small');
  nota.textContent = 'En una ficha de remate no se aplica la notaría: ahí se registra el auto de adjudicación, no una escritura.';
  caja.appendChild(nota);
  return { ok: true, valores };
}

function pintarParametros(gastos) {
  parametrosGuardados = gastos;
  for (const [clave, id] of CAMPOS_PARAMETROS) {
    document.getElementById(id).value = String(aPorcentaje(gastos[clave])).replace('.', ',');
  }
  document.getElementById('param-nota').value = '';

  const origen = document.getElementById('param-origen');
  origen.className = `param-origen param-origen-${gastos.origen === 'base' ? 'base' : 'defecto'}`;
  origen.textContent = gastos.origen === 'base'
    ? `Valores guardados en la base · última edición ${fechaHora(gastos.actualizadoEn)}`
      + (gastos.nota ? ` · ${gastos.nota}` : '')
    : 'La tabla de parámetros todavía no está aplicada en esta base: la calculadora está usando los '
      + 'valores por defecto del código. Se pueden editar aquí, pero no se guardarán hasta que se '
      + 'aplique la migración 20260728000003_parametros_gastos.sql.';
  actualizarEfecto();
}

/**
 * Los porcentajes vigentes salen de `/api/config`, que es PÚBLICO.
 *
 * No hace falta un endpoint administrativo para leerlos: son tarifas que se le
 * muestran a cualquiera que abra una ficha. Lo que sí está reservado al
 * administrador es escribirlas. Leer del mismo sitio que lee el frontend tiene
 * además la ventaja de que el panel muestra exactamente lo que ve el cliente, y
 * no una segunda versión que podría divergir.
 */
async function loadParametros() {
  mostrar('grupo-configuracion');
  const message = document.getElementById('param-message');
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    if (!config || !config.gastos) throw new Error('La configuración no trae los porcentajes');
    pintarParametros(config.gastos);
    message.className = 'message';
    message.textContent = '';
  } catch (error) {
    message.className = 'message error';
    message.textContent = `No se pudieron leer los porcentajes vigentes: ${error.message}`;
  }
}

async function guardarParametros(event) {
  event.preventDefault();
  const message = document.getElementById('param-message');
  const boton = document.getElementById('param-guardar');
  const revision = actualizarEfecto();
  if (!revision.ok) {
    message.className = 'message error';
    message.textContent = 'Corrige los porcentajes antes de guardar.';
    return;
  }
  boton.disabled = true;
  message.className = 'message';
  message.textContent = 'Guardando…';
  try {
    const data = await adminFetch('/api/admin/parametros-gastos', {
      method: 'PUT',
      body: JSON.stringify({
        // De porcentaje a fracción, en la frontera y una sola vez.
        notaria: revision.valores.notaria / 100,
        impuestoRegistro: revision.valores.impuestoRegistro / 100,
        derechosRegistro: revision.valores.derechosRegistro / 100,
        nota: document.getElementById('param-nota').value.trim(),
      }),
    });
    pintarParametros(data.parametros);
    message.className = 'message ok';
    message.textContent = 'Porcentajes guardados. La próxima ficha que abra cualquier usuario ya los usa.';
  } catch (error) {
    message.className = 'message error';
    message.textContent = error.message;
  } finally {
    boton.disabled = false;
  }
}

/* ══════════════════════════════  Arranque  ══════════════════════════════ */

async function init() {
  adminToken = localStorage.getItem('radar_token') || '';
  if (!adminToken) {
    location.href = '/login';
    return;
  }
  const message = document.getElementById('admin-message');
  let data;
  try {
    data = await adminFetch('/api/admin/summary');
  } catch (error) {
    message.innerHTML = `<h3>Acceso no disponible</h3><p>${esc(error.message)}</p>`;
    return;
  }
  document.getElementById('m-users').textContent = data.summary.users.toLocaleString('es-CO');
  document.getElementById('m-pro').textContent = data.summary.proUsers.toLocaleString('es-CO');
  document.getElementById('m-interest').textContent = data.summary.interestedUsers.toLocaleString('es-CO');
  document.getElementById('m-alerts').textContent = data.summary.activeAlerts.toLocaleString('es-CO');
  document.getElementById('m-profiles').textContent = data.summary.completedProfiles.toLocaleString('es-CO');
  document.getElementById('m-sent').textContent = data.summary.sentDeliveries.toLocaleString('es-CO');
  document.getElementById('m-failed').textContent = data.summary.failedDeliveries.toLocaleString('es-CO');
  document.getElementById('m-success').textContent = data.summary.deliverySuccessRate == null
    ? '—'
    : `${data.summary.deliverySuccessRate.toLocaleString('es-CO')}%`;
  const funnel = data.summary.subscriptionFunnel;
  document.getElementById('f-none').textContent = funnel.none.toLocaleString('es-CO');
  document.getElementById('f-interested').textContent = funnel.interested.toLocaleString('es-CO');
  document.getElementById('f-trialing').textContent = funnel.trialing.toLocaleString('es-CO');
  document.getElementById('f-active').textContent = funnel.active.toLocaleString('es-CO');
  document.getElementById('f-past-due').textContent = funnel.pastDue.toLocaleString('es-CO');
  document.getElementById('f-canceled').textContent = funnel.canceled.toLocaleString('es-CO');
  mostrar('grupo-comercial');
  mostrar('metrics');
  mostrar('funnel');
  await loadQueue();
  // Las tres secciones caras van sin bloquear a la cola comercial, que es lo que
  // el administrador viene a operar. El orden es el de la página: primero el
  // estado del sistema, que es barato, y de último el inventario, que son ~60
  // consultas contra Supabase.
  void loadMetricas();
  void loadParametros();
  void loadZonas();
  const deliveryCopy = data.summary.lastDeliveryAt
    ? `Último procesamiento registrado ${new Date(data.summary.lastDeliveryAt).toLocaleString('es-CO')}.`
    : 'Todavía no hay entregas registradas; el panel no presenta métricas simuladas.';
  message.innerHTML = `<h3>Lectura operativa</h3><p>${deliveryCopy} Corte generado ${new Date(data.summary.generatedAt).toLocaleString('es-CO')}.</p>`;
}

document.getElementById('zonas-retry').addEventListener('click', () => { void loadZonas(); });
document.getElementById('metricas-retry').addEventListener('click', () => { void loadMetricas(); });
document.getElementById('param-form').addEventListener('submit', guardarParametros);
document.getElementById('param-form').addEventListener('input', () => { actualizarEfecto(); });
document.getElementById('param-restaurar').addEventListener('click', () => {
  if (parametrosGuardados) pintarParametros(parametrosGuardados);
  const message = document.getElementById('param-message');
  message.className = 'message';
  message.textContent = 'Se restauraron los valores vigentes.';
});

document.getElementById('commercial-queue-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-update-subscription]');
  if (!button) return;
  const item = button.closest('[data-user-id]');
  const status = item.querySelector('[data-subscription-status]').value;
  const note = item.querySelector('[data-subscription-note]').value.trim();
  const message = document.getElementById('commercial-message');
  button.disabled = true;
  message.className = 'message';
  message.textContent = 'Aplicando cambio…';
  try {
    await adminFetch(`/api/admin/subscriptions/${encodeURIComponent(item.dataset.userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
    message.className = 'message ok';
    message.textContent = 'Suscripción actualizada y registrada en el historial.';
    await init();
  } catch (error) {
    message.className = 'message error';
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

init().catch(() => {
  document.getElementById('admin-message').innerHTML = '<h3>No se pudo cargar el panel</h3><p>Intenta de nuevo en unos minutos.</p>';
});
