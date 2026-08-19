'use strict';
/**
 * Recorrido guiado de bienvenida.
 *
 * QUÉ ES: el patrón que usan Shepherd.js, React Joyride o Intro.js — se oscurece
 * la pantalla, se deja iluminado UN elemento real de la interfaz y se explica al
 * lado con un globo anclado. El usuario ve la herramienta de verdad mientras se
 * la explican, en vez de leer una descripción en un cuadro flotante.
 *
 * POR QUÉ SIN LIBRERÍA: la política de seguridad del sitio bloquea cualquier
 * script externo, y el proyecto no tiene empaquetador. Las tres piezas que hacen
 * falta —el resalte, el globo y la navegación— son unas doscientas líneas; una
 * dependencia costaría más en integrarla.
 *
 * CÓMO SE ILUMINA: un rectángulo colocado sobre el elemento con
 * `box-shadow: 0 0 0 9999px` de color oscuro. La sombra cubre la pantalla entera
 * y el propio rectángulo queda transparente, así que el «agujero» sale gratis y
 * se puede animar entre pasos moviendo el rectángulo. Es la técnica estándar y
 * la única que no necesita recortar el fondo con SVG ni `clip-path`.
 *
 * CUÁNTOS PASOS: ocho, por decisión del propietario —«se debe explicar lo mayor
 * posible»—. Conviene saber que la evidencia de producto sitúa el óptimo entre
 * tres y cinco, con caída de finalización a partir de ahí, así que estos ocho van
 * con dos concesiones: cerrar es un clic desde cualquier paso, y el recorrido
 * SALTA los pasos cuyo elemento no esté disponible en vez de alargarse en vacío.
 * Si algún día se mide que la gente lo abandona, los tres últimos son los que
 * sobran primero.
 */

/*
 * Todo el módulo va dentro de una función que se llama a sí misma. `app.js` y
 * este archivo son scripts clásicos, así que comparten el ámbito global: sin
 * este envoltorio, el `const $` de aquí choca con el de allí y el navegador
 * aborta el archivo entero con «Identifier '$' has already been declared» —el
 * recorrido no llegaba a existir—. Lo único que sale fuera es `window.__radarTour`.
 */
(function () {
const CLAVE_VISTO = 'radar_onboarding_v1';

/**
 * Los pasos del recorrido.
 *
 * `tab` hace que el recorrido cambie de sección solo antes de anclar: es lo que
 * lo convierte en un paseo por el producto y no en una sucesión de cuadros.
 * `selector` es un elemento REAL; si no existe —porque el inventario del día no
 * trajo tarjetas, por ejemplo— el paso se salta en vez de iluminar el vacío.
 */
const PASOS = [
  {
    id: 'bienvenida',
    centrado: true,
    etiqueta: 'Bienvenido',
    // El primer paso decía «compara contra el barrio, no contra el país», que es la
    // respuesta a una objeción que el recién llegado todavía no tiene. Antes de
    // defender el método hay que decir qué hace el producto.
    titulo: 'Qué hace el Radar',
    texto: 'Cada semana revisamos miles de avisos de portales, de las carteras de los bancos y de los '
      + 'remates de los juzgados, y te mostramos los que están por debajo de lo que piden por otros '
      + 'parecidos en la misma zona. Tú eliges ciudad y presupuesto; la comparación la ponemos nosotros.',
  },
  {
    id: 'fuentes',
    selector: '#tabs',
    lado: 'abajo',
    etiqueta: 'Las tres fuentes',
    titulo: 'Tres mercados distintos en un mismo lugar',
    // Los nombres son los de las pestañas que la persona tiene delante. Si aquí se
    // llamaran «Portal Abierto» o «Activos de Bancos», el recorrido dejaría de
    // señalar la pantalla para describir otra.
    texto: 'Portales son avisos publicados que puedes llamar y visitar hoy. Inmuebles de banco son los que una '
      + 'entidad recibió por créditos sin pagar. Remates judiciales son subastas ante un juez. Cada uno tiene su pestaña.',
  },
  {
    id: 'filtros',
    tab: 'portal',
    selector: '.controls',
    lado: 'derecha',
    etiqueta: 'Filtros',
    titulo: 'Acota por lo tuyo',
    texto: 'Ciudad, barrio, precio, área, habitaciones o estrato. Si filtras por una ciudad, el Radar '
      + 'te ofrece además los municipios de su misma área metropolitana.',
  },
  {
    id: 'ficha',
    tab: 'portal',
    selector: '#grid article.card',
    lado: 'derecha',
    etiqueta: 'Cada ficha',
    titulo: 'El porcentaje es contra su propio barrio',
    // «Mediana» es la palabra correcta y la que usa el motor, pero en un tutorial
    // para alguien que nunca invirtió no dice nada. Se explica con lo que significa:
    // el precio del que está justo en medio.
    texto: 'No es una rebaja sobre el precio de lista ni un promedio nacional: es cuánto está por '
      + 'debajo de lo que piden por inmuebles parecidos en su zona —el precio del que queda justo en '
      + 'medio, ni el más caro ni el más barato—. Ábrela y verás cuáles se usaron para la cuenta.',
  },
  {
    id: 'remates',
    tab: 'remates',
    selector: '#grid article.card',
    lado: 'derecha',
    etiqueta: 'Remates',
    titulo: 'Aquí lo que importa no es el descuento',
    // Se mantiene la cuota parte —«solo se remata una parte del bien»— porque es una
    // señal real que el Radar sí muestra en la ficha. La versión que proponía la
    // auditoría hablaba en cambio del «estado del bien», que no es ningún campo que
    // tengamos: prometer en el tutorial un dato que la ficha no da es peor que un
    // copy largo.
    // El 70% NO es universal: en segunda o tercera licitación la base baja, y hay
    // fichas reales al 100%. Decirlo como ley sin excepciones deja al usuario con
    // una expectativa que la propia ficha desmiente tres clics después.
    texto: 'La postura mínima la fija el juzgado, y suele ser un porcentaje del avalúo —lo habitual '
      + 'es el 70%, aunque en una segunda subasta cambia—. Cada ficha dice el suyo. Lo que de verdad '
      + 'distingue un remate de otro es el riesgo del título —si los papeles del inmueble vienen '
      + 'limpios o traen deudas, embargos o dueños en disputa— y si se remata el bien entero o solo '
      + 'una parte.',
  },
  {
    id: 'guardar',
    conCuenta: true,
    tab: 'remates',
    selector: '#grid article.card .fav-btn',
    lado: 'derecha',
    etiqueta: 'Guardados',
    titulo: 'Aparta las que te interesen',
    texto: 'El corazón guarda la ficha en tu lista. Están en la pestaña Guardados, se conservan aunque '
      + 'cierres el navegador y puedes compararlas entre sí cuando tengas varias.',
  },
  {
    id: 'preferencias',
    conCuenta: true,
    tab: 'portal',
    selector: '#radar-setup',
    lado: 'abajo',
    etiqueta: 'Tu Radar',
    titulo: 'Dile qué buscas y deja de filtrar cada vez',
    texto: 'Ciudad, presupuesto y tipo de inmueble en tres elecciones. El Radar los recuerda, los aplica '
      + 'al entrar y los usa para avisarte por correo cuando aparezca algo en tu zona.',
  },
  {
    id: 'cuenta',
    selector: '#authbar',
    lado: 'abajo',
    etiqueta: 'Tu cuenta',
    titulo: 'Lo que abres, queda abierto',
    // El número sale de `app.js`, que a su vez lo tiene de `server/cupo.ts`. Escrito a
    // mano decía 20 y habría seguido diciendo 20 el día que el cupo cambie: el
    // tutorial es justo donde una cifra vieja se lee como una promesa incumplida.
    // «Comparables» se explica aquí y no se da por sabido: es la palabra sobre la
    // que descansa todo el producto y el tutorial era el único sitio donde
    // enseñarla. «Abrir una ficha» también se dice con todas las letras —consultarla
    // completa— porque en el paso anterior ya se usó sin definir.
    texto: `Con una cuenta gratuita puedes consultar ${window.CUPO_FREE_MENSUAL ?? 20} fichas completas al mes: `
      + 'dirección exacta, todas las fotos, el análisis y los comparables (los inmuebles parecidos de la '
      + 'zona con los que calculamos el precio). Las que consultes quedan disponibles en tu cuenta. '
      + 'Con el plan completo no hay límite.',
  },
];

/**
 * Los pasos que corresponden a ESTE visitante.
 *
 * Guardados y la personalización se retiraron de la interfaz para quien no tiene
 * cuenta, así que enseñárselos sería iluminar algo que no está. Y al revés: a
 * quien ya entró no hay que venderle el registro. Un recorrido que habla de
 * botones que el usuario no ve es peor que no tener recorrido.
 */
function pasosVisibles() {
  const conCuenta = !!localStorage.getItem('radar_token');
  return PASOS.filter((p) => (p.conCuenta ? conCuenta : true));
}

let paso = 0;
let activo = false;
let elementoActual = null;
/** Pasos de ESTA sesión del recorrido. Se fija al abrir para que no cambie a mitad. */
let pasos = [];

const porId = (id) => document.getElementById(id);
const esMovil = () => window.matchMedia('(max-width: 760px)').matches;

/** Marca el recorrido como visto para que no vuelva a salir solo. */
function marcarVisto() {
  try { localStorage.setItem(CLAVE_VISTO, '1'); } catch { /* modo privado */ }
}

function crearCapas() {
  if (porId('tour-foco')) return;
  const foco = document.createElement('div');
  foco.id = 'tour-foco';
  foco.className = 'tour-foco';
  const globo = document.createElement('div');
  globo.id = 'tour-globo';
  globo.className = 'tour-globo';
  globo.setAttribute('role', 'dialog');
  globo.setAttribute('aria-modal', 'true');
  globo.setAttribute('aria-label', 'Recorrido de bienvenida');
  document.body.append(foco, globo);
}

/**
 * Coloca el resalte sobre el elemento.
 *
 * Con `centrado` no hay nada que iluminar —es el paso de bienvenida— así que el
 * rectángulo se encoge en el centro y la pantalla queda oscurecida entera.
 */
function colocarFoco(el) {
  const foco = porId('tour-foco');
  if (!el) {
    foco.style.cssText = `top:50%;left:50%;width:0;height:0;opacity:1`;
    return;
  }
  const r = el.getBoundingClientRect();
  const margen = 6;
  foco.style.cssText = `top:${r.top - margen}px;left:${r.left - margen}px;`
    + `width:${r.width + margen * 2}px;height:${r.height + margen * 2}px;opacity:1`;
}

/**
 * Coloca el globo junto al elemento, o centrado si no hay ninguno.
 *
 * Se prueba el lado pedido y se corrige si no cabe: un globo que se sale de la
 * pantalla es peor que uno colocado en el lado contrario al ideal. En móvil no
 * se intenta nada de esto —no hay sitio a los lados— y se ancla abajo.
 */
function colocarGlobo(el, lado) {
  const globo = porId('tour-globo');
  globo.classList.toggle('es-movil', esMovil());
  if (esMovil() || !el) {
    globo.style.cssText = '';
    globo.classList.toggle('es-centrado', !el && !esMovil());
    return;
  }
  globo.classList.remove('es-centrado');
  const r = el.getBoundingClientRect();
  const g = globo.getBoundingClientRect();
  const hueco = 16;
  let top;
  let left;
  if (lado === 'abajo' || r.height > window.innerHeight * 0.6) {
    top = r.bottom + hueco;
    left = Math.min(Math.max(r.left, 16), window.innerWidth - g.width - 16);
    if (top + g.height > window.innerHeight - 16) top = Math.max(16, r.top - g.height - hueco);
  } else {
    left = r.right + hueco;
    if (left + g.width > window.innerWidth - 16) left = Math.max(16, r.left - g.width - hueco);
    top = Math.min(Math.max(r.top, 16), window.innerHeight - g.height - 16);
  }
  globo.style.top = `${Math.max(16, top)}px`;
  globo.style.left = `${Math.max(16, left)}px`;
}

function pintarGlobo(p, indice) {
  const globo = porId('tour-globo');
  const ultimo = indice === pasos.length - 1;
  globo.innerHTML = `
    <div class="tour-cab">
      <span class="tour-etiqueta">${p.etiqueta}</span>
      <button class="tour-cerrar" type="button" data-tour="cerrar" aria-label="Cerrar el recorrido">&times;</button>
    </div>
    <h2>${p.titulo}</h2>
    <p>${p.texto}</p>
    <div class="tour-pie">
      <ol class="tour-puntos" aria-hidden="true">${pasos.map((_, n) =>
        `<li class="${n === indice ? 'is-activo' : n < indice ? 'is-visto' : ''}"></li>`).join('')}</ol>
      <div class="tour-botones">
        ${indice > 0 ? '<button class="tour-atras" type="button" data-tour="atras">Atrás</button>' : ''}
        <button class="tour-cta" type="button" data-tour="${ultimo ? 'cerrar' : 'siguiente'}">
          ${ultimo ? 'Empezar a explorar' : 'Siguiente'}
        </button>
      </div>
    </div>
    <p class="tour-progreso">Paso ${indice + 1} de ${pasos.length}</p>`;
}

/**
 * ¿Este elemento se puede iluminar?
 *
 * Existir no basta. `#radar-setup` está siempre en el marcado pero se queda vacío
 * cuando el usuario ya tiene sus preferencias puestas, y un contenedor vacío mide
 * 0×0: el resalte sería un punto sobre la nada. Se exige tamaño real.
 */
const sePuedeIluminar = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
};

/** Espera a que un selector aparezca CON tamaño. Devuelve el elemento o `null`. */
function esperarElemento(selector, msMax = 12000) {
  return new Promise((resolve) => {
    const encontrado = document.querySelector(selector);
    if (sePuedeIluminar(encontrado)) { resolve(encontrado); return; }
    const limite = Date.now() + msMax;
    const tic = setInterval(() => {
      const el = document.querySelector(selector);
      if (sePuedeIluminar(el)) { clearInterval(tic); resolve(el); return; }
      if (Date.now() > limite) { clearInterval(tic); resolve(null); }
    }, 180);
  });
}

/** Cambia de sección si el paso lo pide, y espera a que la nueva termine de cargar. */
async function irASeccion(tab) {
  const boton = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (!boton || boton.getAttribute('aria-current') === 'page') return;
  boton.click();
  await esperarElemento(`.tab-btn[data-tab="${tab}"][aria-current="page"]`, 4000);
  // El listado tarda en llegar; sin esperar, el resalte se colocaría sobre el
  // esqueleto de carga y saltaría de sitio en cuanto entraran las tarjetas.
  await new Promise((r) => setTimeout(r, 900));
}

async function mostrarPaso(indice) {
  if (!activo) return;
  const p = pasos[indice];
  if (!p) { cerrar(); return; }
  paso = indice;

  if (p.tab) await irASeccion(p.tab);
  if (!activo) return;

  let el = null;
  if (p.selector) {
    el = await esperarElemento(p.selector, 6000);
    // Un paso sin su elemento se salta hacia adelante: iluminar el vacío
    // confundiría más que no decir nada. Ocurre si el inventario del día no trae
    // tarjetas, o si la petición del listado falló. Se avanza SIEMPRE hacia
    // adelante —nunca hacia atrás— para que dos pasos sin elemento no se pasen el
    // turno el uno al otro indefinidamente.
    if (!el) { await mostrarPaso(indice + 1); return; }
    // Desplazamiento INSTANTÁNEO, no suave. Con `smooth` había que adivinar
    // cuánto tarda, y al medir antes de tiempo el resalte quedaba desfasado: en
    // la pestaña de remates abarcaba media tarjeta de abajo. Instantáneo se puede
    // medir en el fotograma siguiente y siempre cae donde debe; el movimiento
    // suave lo aporta la transición del propio resalte, que es lo que se ve.
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  if (!activo) return;

  elementoActual = el;
  pintarGlobo(p, indice);
  colocarFoco(el);
  colocarGlobo(el, p.lado);
  // Se coloca dos veces a propósito: la primera con el tamaño del globo anterior
  // y la segunda ya con el suyo, que puede haber cambiado de alto con el texto.
  requestAnimationFrame(() => colocarGlobo(el, p.lado));
  porId('tour-globo').querySelector('.tour-cta')?.focus({ preventScroll: true });
}

function recolocar() {
  if (!activo) return;
  colocarFoco(elementoActual);
  colocarGlobo(elementoActual, pasos[paso]?.lado);
}

function cerrar() {
  const estaba = activo;
  activo = false;
  elementoActual = null;
  marcarVisto();
  // El recorrido es un paso de la bienvenida, así que al terminarlo se avisa a la
  // aplicación: ella marca el hito en la CUENTA —no en este navegador— y ofrece lo
  // siguiente, que es ajustar el Radar a lo que la persona busca. Ahora ya sabe
  // para qué sirve eso; antes de verlo, no.
  if (estaba) { try { window.__alTerminarRecorrido?.(); } catch { /* no bloquea el cierre */ } }
  document.body.classList.remove('tour-abierto');
  porId('tour-foco')?.remove();
  porId('tour-globo')?.remove();
  window.removeEventListener('resize', recolocar);
  window.removeEventListener('scroll', recolocar, true);
  document.removeEventListener('keydown', alPulsarTecla);
}

function alPulsarTecla(e) {
  if (!activo) return;
  if (e.key === 'Escape') { cerrar(); return; }
  if (e.key === 'ArrowRight') { void mostrarPaso(paso + 1); return; }
  if (e.key === 'ArrowLeft' && paso > 0) void mostrarPaso(paso - 1);
}

function abrir() {
  if (activo) return;
  activo = true;
  paso = 0;
  pasos = pasosVisibles();
  crearCapas();
  document.body.classList.add('tour-abierto');
  window.addEventListener('resize', recolocar);
  // En captura: el desplazamiento de un contenedor interno también mueve el
  // elemento iluminado, y sin esto el resalte se quedaría atrás.
  window.addEventListener('scroll', recolocar, true);
  document.addEventListener('keydown', alPulsarTecla);
  void mostrarPaso(0);
}

document.addEventListener('click', (e) => {
  const boton = e.target.closest?.('[data-tour]');
  if (!boton) return;
  const accion = boton.dataset.tour;
  if (accion === 'siguiente') void mostrarPaso(paso + 1);
  else if (accion === 'atras') void mostrarPaso(paso - 1);
  else cerrar();
});

window.__radarTour = { abrir, cerrar, get activo() { return activo; } };
})();
