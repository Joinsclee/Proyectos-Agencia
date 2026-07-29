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
 * CUÁNTOS PASOS: cinco. La evidencia de producto sitúa el óptimo entre tres y
 * cinco, con caída fuerte de finalización a partir de ahí. La primera versión de
 * este recorrido tenía diez y se cortó a la mitad por eso.
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
 * Los cinco pasos.
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
    titulo: 'Esto compara contra el barrio, no contra el país',
    texto: 'Cada inmueble se mide contra el precio real de ofertas parecidas en su propia zona. '
      + 'Por eso un descuento aquí significa algo. Te enseño la herramienta en un minuto.',
  },
  {
    id: 'fuentes',
    selector: '#tabs',
    lado: 'abajo',
    etiqueta: 'Las tres fuentes',
    titulo: 'Portal, bancos y remates',
    texto: 'Tres mercados distintos con la misma vara: lo que se publica abierto, lo que los bancos '
      + 'quieren soltar y lo que un juez va a rematar. Cada uno tiene su pestaña.',
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
    texto: 'No es una rebaja sobre el precio de lista ni un promedio nacional: es cuánto está por '
      + 'debajo de la mediana de ofertas parecidas en su zona. Ábrela para ver los comparables que lo sostienen.',
  },
  {
    id: 'remates',
    tab: 'remates',
    selector: '#grid article.card',
    lado: 'derecha',
    etiqueta: 'Remates',
    titulo: 'Aquí lo que importa no es el descuento',
    texto: 'La ley fija la base de toda subasta en el 70% del avalúo, así que casi todos dan lo mismo. '
      + 'Lo que separa un remate de otro es el riesgo del título, y si solo se remata una parte del bien, la ficha lo avisa.',
  },
];

let paso = 0;
let activo = false;
let elementoActual = null;

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
  const ultimo = indice === PASOS.length - 1;
  globo.innerHTML = `
    <div class="tour-cab">
      <span class="tour-etiqueta">${p.etiqueta}</span>
      <button class="tour-cerrar" type="button" data-tour="cerrar" aria-label="Cerrar el recorrido">&times;</button>
    </div>
    <h2>${p.titulo}</h2>
    <p>${p.texto}</p>
    <div class="tour-pie">
      <ol class="tour-puntos" aria-hidden="true">${PASOS.map((_, n) =>
        `<li class="${n === indice ? 'is-activo' : n < indice ? 'is-visto' : ''}"></li>`).join('')}</ol>
      <div class="tour-botones">
        ${indice > 0 ? '<button class="tour-atras" type="button" data-tour="atras">Atrás</button>' : ''}
        <button class="tour-cta" type="button" data-tour="${ultimo ? 'cerrar' : 'siguiente'}">
          ${ultimo ? 'Empezar a explorar' : 'Siguiente'}
        </button>
      </div>
    </div>
    <p class="tour-progreso">Paso ${indice + 1} de ${PASOS.length}</p>`;
}

/** Espera a que un selector aparezca. Devuelve el elemento o `null` si no llega. */
function esperarElemento(selector, msMax = 12000) {
  return new Promise((resolve) => {
    const encontrado = document.querySelector(selector);
    if (encontrado) { resolve(encontrado); return; }
    const limite = Date.now() + msMax;
    const tic = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() > limite) { clearInterval(tic); resolve(el); }
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
  const p = PASOS[indice];
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
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await new Promise((r) => setTimeout(r, 420));
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
  colocarGlobo(elementoActual, PASOS[paso]?.lado);
}

function cerrar() {
  activo = false;
  elementoActual = null;
  marcarVisto();
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
