/**
 * Consentimiento de cookies y contenido de terceros.
 *
 * ── Por qué este banner no se parece al de todos los sitios ──
 *
 * Antes de escribirlo se inventarió lo que el Radar usa de verdad, y el resultado
 * cambió el diseño entero:
 *
 *   · El servidor no pone NI UNA cookie. La sesión vive en `localStorage`.
 *   · No hay analítica. Ni Google Analytics, ni Tag Manager, ni Hotjar, ni píxel
 *     de Meta. Nada.
 *   · No hay publicidad ni remarketing.
 *   · Lo único de terceros que instala cookies es el MAPA de Google Maps que
 *     aparece en la ficha del inmueble.
 *
 * Así que un banner de «aceptamos cookies de analítica y publicidad» sería falso.
 * Este pide lo único que hay que pedir —el mapa— y dice la verdad sobre el resto.
 * Eso, además de ser lo correcto, es lo que hace que un banner no sea un trámite:
 * quien lo lee entiende qué gana y qué pierde con cada botón.
 *
 * ── Y hace algo ──
 *
 * Un banner que no cambia el comportamiento del sitio es peor que no tenerlo,
 * porque documenta un consentimiento que nadie respeta. Aquí, rechazar significa
 * que el iframe de Google no se carga: en su lugar la ficha muestra la dirección
 * y un botón para abrir el mapa esa vez concreta, sin guardar nada.
 *
 * Rechazar cuesta exactamente un clic, igual que aceptar, y los dos botones
 * pesan lo mismo. Un «Aceptar» grande en color junto a un «Rechazar» gris y
 * pequeño no es una elección libre, y la ley colombiana pide que el
 * consentimiento sea libre, previo, expreso e informado.
 */
(function () {
  'use strict';

  var CLAVE = 'radar_cookies_v1';
  /**
   * Sube esto si cambian las categorías o aparece un tercero nuevo: un
   * consentimiento dado sobre otra lista no vale para la lista nueva, y volver a
   * preguntar es lo correcto aunque moleste.
   */
  var VERSION = 1;

  /**
   * El consentimiento se guarda en una COOKIE propia, no en `localStorage`.
   *
   * Es como lo hacen las aplicaciones grandes, y por dos razones que aquí
   * aplican igual:
   *
   *  · El servidor puede leerla. Hoy no la necesita, pero el día que quiera
   *    decidir si inyecta el iframe del mapa en el HTML —en vez de dejar que lo
   *    destape el navegador— la tiene disponible sin más trabajo.
   *  · Caduca sola. La normativa espera que un consentimiento tenga vigencia y
   *    se vuelva a pedir; `localStorage` no caduca nunca, así que un «sí» de
   *    2026 seguiría valiendo en 2030.
   *
   * NO lleva `httpOnly` a propósito: este script tiene que leerla para saber si
   * destapa el mapa. Es el caso en que `httpOnly` no aplica — a diferencia del
   * token de sesión, donde sí debería estar.
   */
  var MESES_VIGENCIA = 6;

  function escribirCookie(valor) {
    var partes = [
      CLAVE + '=' + encodeURIComponent(valor),
      'path=/',
      'max-age=' + (MESES_VIGENCIA * 30 * 24 * 60 * 60),
      // `Lax` deja que la cookie viaje al llegar desde un enlace externo —que es
      // como llega casi todo el tráfico de Google— pero no en peticiones que
      // origine otro sitio.
      'SameSite=Lax',
    ];
    if (location.protocol === 'https:') partes.push('Secure');
    document.cookie = partes.join('; ');
  }

  function leerCookie() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + CLAVE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /**
   * Las categorías REALES, no las de plantilla.
   *
   * `necesarias` no se puede desmarcar porque sin ella no hay sesión ni filtros —
   * y no requiere consentimiento previo: es lo que la propia política llama
   * «estrictamente necesarias».
   */
  var CATEGORIAS = [
    {
      id: 'necesarias',
      titulo: 'Estrictamente necesarias',
      fija: true,
      texto: 'Guardan tu sesión, tus filtros, tus guardados y tus simulaciones en '
        + 'este navegador. Sin ellas tendrías que iniciar sesión en cada página y '
        + 'perderías lo que llevas configurado. No salen de tu equipo.',
    },
    {
      id: 'mapas',
      titulo: 'Mapas de Google',
      fija: false,
      texto: 'El mapa de la ficha lo sirve Google, y al cargarlo Google puede '
        + 'instalar sus propias cookies y ver tu dirección IP. Si lo desactivas, '
        + 'la ficha te muestra la dirección y un botón para abrir el mapa solo '
        + 'cuando tú lo pidas.',
    },
  ];

  /** Lo que hoy NO se usa. Se dice en el panel, porque callarlo también informa mal. */
  var NO_USAMOS = 'El Radar no usa cookies de analítica, de publicidad ni de '
    + 'remarketing, ni comparte tu navegación con redes sociales. Si eso cambia, '
    + 'este aviso volverá a aparecer para pedirte permiso antes.';

  function leer() {
    try {
      var crudo = leerCookie();
      if (!crudo) return null;
      var v = JSON.parse(crudo);
      return v && v.version === VERSION ? v : null;
    } catch (e) { return null; }
  }

  function guardar(elecciones) {
    try {
      escribirCookie(JSON.stringify({
        version: VERSION, at: new Date().toISOString(), elecciones: elecciones,
      }));
    } catch (e) { /* si el navegador las bloquea, la elección dura la visita */ }
  }

  /**
   * ¿Se puede usar esta categoría?
   *
   * Sin decisión guardada devuelve `false` para todo lo que no sea necesario: el
   * consentimiento tiene que ser PREVIO, así que mientras no haya respuesta se
   * actúa como si hubieran dicho que no.
   */
  function permitido(id) {
    if (id === 'necesarias') return true;
    var d = leer();
    return !!(d && d.elecciones && d.elecciones[id]);
  }

  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  /* ─────────────────────────────── El banner ─────────────────────────────── */

  function cerrar() {
    var n = document.getElementById('cookie-banner');
    if (n) n.remove();
    document.removeEventListener('keydown', escapar);
  }

  function escapar(e) {
    // Escape equivale a «solo lo necesario»: cerrar sin elegir no puede
    // interpretarse como un sí.
    if (e.key === 'Escape') decidir(false);
  }

  function decidir(aceptarTodo) {
    var elecciones = {};
    CATEGORIAS.forEach(function (c) { if (!c.fija) elecciones[c.id] = aceptarTodo; });
    guardar(elecciones);
    cerrar();
    aplicar();
  }

  function pintarBanner() {
    if (document.getElementById('cookie-banner')) return;
    var n = document.createElement('div');
    n.id = 'cookie-banner';
    n.className = 'cookie-banner';
    n.setAttribute('role', 'dialog');
    n.setAttribute('aria-labelledby', 'cookie-banner-tit');
    n.setAttribute('aria-describedby', 'cookie-banner-txt');
    n.innerHTML = ''
      + '<div class="cookie-caja">'
      + '<div class="cookie-texto">'
      + '<strong id="cookie-banner-tit">Este sitio guarda cosas en tu navegador</strong>'
      + '<p id="cookie-banner-txt">Lo necesario para mantener tu sesión y tus filtros. '
      + 'Aparte de eso, solo el <strong>mapa de Google</strong> de las fichas instala cookies de terceros. '
      + 'No usamos analítica ni publicidad. '
      + '<a href="/terminos#cookies">Leer la política</a>.</p>'
      + '</div>'
      + '<div class="cookie-botones">'
      + '<button type="button" class="cookie-btn" data-cookie="config">Configurar</button>'
      + '<button type="button" class="cookie-btn" data-cookie="no">Solo lo necesario</button>'
      + '<button type="button" class="cookie-btn cookie-si" data-cookie="si">Aceptar todo</button>'
      + '</div></div>';
    document.body.appendChild(n);
    document.addEventListener('keydown', escapar);
    // El foco va al banner para que quien navegue con teclado no tenga que
    // recorrer la página entera hasta encontrarlo.
    var primero = n.querySelector('button');
    if (primero) primero.focus();
  }

  /* ──────────────────────────── Panel de detalle ──────────────────────────── */

  function pintarPanel() {
    cerrar();
    var previo = document.getElementById('cookie-panel');
    if (previo) previo.remove();

    var d = leer();
    var filas = CATEGORIAS.map(function (c) {
      var marcado = c.fija || (d && d.elecciones && d.elecciones[c.id]);
      return ''
        + '<label class="cookie-cat' + (c.fija ? ' es-fija' : '') + '">'
        + '<input type="checkbox" data-cat="' + esc(c.id) + '"'
        + (marcado ? ' checked' : '') + (c.fija ? ' disabled' : '') + '>'
        + '<span><strong>' + esc(c.titulo) + (c.fija ? ' · siempre activas' : '') + '</strong>'
        + '<span class="cookie-cat-txt">' + esc(c.texto) + '</span></span></label>';
    }).join('');

    var n = document.createElement('div');
    n.id = 'cookie-panel';
    n.className = 'cookie-panel';
    n.setAttribute('role', 'dialog');
    n.setAttribute('aria-modal', 'true');
    n.setAttribute('aria-labelledby', 'cookie-panel-tit');
    n.innerHTML = ''
      + '<div class="cookie-panel-caja">'
      + '<h2 id="cookie-panel-tit">Preferencias de cookies</h2>'
      + '<p class="cookie-panel-sub">' + esc(NO_USAMOS) + '</p>'
      + filas
      + '<div class="cookie-panel-pie">'
      + '<button type="button" class="cookie-btn" data-cookie="cerrar-panel">Cancelar</button>'
      + '<button type="button" class="cookie-btn cookie-si" data-cookie="guardar">Guardar preferencias</button>'
      + '</div></div>';
    document.body.appendChild(n);
    var primero = n.querySelector('input:not([disabled),button');
    (primero || n.querySelector('button')).focus();
  }

  function guardarDesdePanel() {
    var panel = document.getElementById('cookie-panel');
    if (!panel) return;
    var elecciones = {};
    CATEGORIAS.forEach(function (c) {
      if (c.fija) return;
      var caja = panel.querySelector('[data-cat="' + c.id + '"]');
      elecciones[c.id] = !!(caja && caja.checked);
    });
    guardar(elecciones);
    panel.remove();
    aplicar();
  }

  /* ───────────────────────── Efecto sobre la página ───────────────────────── */

  /**
   * Aquí es donde el consentimiento deja de ser papel.
   *
   * `data-mapa-src` guarda la URL del iframe sin cargarla. Si hay permiso se
   * vuelca en `src` y el mapa aparece; si no, se queda como está y la ficha
   * enseña el aviso con el botón de cargar solo esa vez.
   */
  function aplicar() {
    var ok = permitido('mapas');
    // La clase en el `body` gobierna qué se ve: el CSS oculta el iframe sin `src`
    // y esconde el aviso cuando hay permiso. Así una ficha que se pinte después
    // de esto ya nace en el estado correcto, sin esperar a que nadie la repase.
    document.body.classList.toggle('cookies-mapas', ok);
    if (!ok) return;
    document.querySelectorAll('[data-mapa-src]').forEach(function (marco) {
      if (!marco.getAttribute('src')) marco.setAttribute('src', marco.getAttribute('data-mapa-src'));
    });
  }

  /**
   * Las fichas se pintan cuando el usuario abre una, mucho después de esta carga.
   * Un observador es más fiable que pedirle a cada punto del código que se acuerde
   * de llamar a `aplicar()`: si mañana aparece otro sitio con mapa, funciona solo.
   */
  function vigilarFichasNuevas() {
    if (!window.MutationObserver) return;
    new MutationObserver(function (cambios) {
      for (var i = 0; i < cambios.length; i++) {
        for (var j = 0; j < cambios[i].addedNodes.length; j++) {
          var n = cambios[i].addedNodes[j];
          if (n.nodeType === 1 && (n.matches?.('[data-mapa-src]') || n.querySelector?.('[data-mapa-src]'))) {
            aplicar();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────── Cableado ─────────────────────────────── */

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cookie]');
    if (!b) return;
    var accion = b.dataset.cookie;
    if (accion === 'si') decidir(true);
    else if (accion === 'no') decidir(false);
    else if (accion === 'config') pintarPanel();
    else if (accion === 'guardar') guardarDesdePanel();
    else if (accion === 'cerrar-panel') {
      document.getElementById('cookie-panel').remove();
      // Si aún no había decidido nada, el banner vuelve: cancelar no es decidir.
      if (!leer()) pintarBanner();
    } else if (accion === 'abrir-preferencias') {
      e.preventDefault();
      pintarPanel();
    }
  });

  // Cargar el mapa solo esta vez, sin guardar consentimiento. Es la salida para
  // quien dijo que no pero quiere ver ESTA ubicación: negarse una vez no debería
  // costarle el mapa para siempre.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cargar-mapa]');
    if (!b) return;
    var cont = b.closest('.section') || document;
    var marco = cont.querySelector('[data-mapa-src]');
    if (marco && !marco.src) marco.src = marco.getAttribute('data-mapa-src');
    var aviso = cont.querySelector('.mapa-bloqueado');
    if (aviso) aviso.hidden = true;
  });

  window.radarCookies = {
    permitido: permitido,
    abrirPreferencias: pintarPanel,
    aplicar: aplicar,
  };

  // El banner solo la primera vez. `aplicar` corre siempre, porque las fichas se
  // pintan después de esto y necesitan que el mapa se destape o no.
  if (!leer()) pintarBanner();
  aplicar();
  vigilarFichasNuevas();
}());
