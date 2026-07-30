'use strict';

/**
 * El asistente del Radar: botón flotante y panel de conversación.
 *
 * Envuelto en una función a propósito. Los scripts de esta página son clásicos y
 * comparten el ámbito global, así que una constante repetida entre dos archivos
 * aborta el que se cargue después —entero, sin ejecutar una sola línea— y el
 * síntoma es una funcionalidad que sencillamente no aparece. Ya pasó con el
 * recorrido de bienvenida.
 *
 * NO habla con n8n directamente, aunque las páginas de los tutores legal y
 * tributario sí lo hagan. Dos motivos: la política de seguridad del Radar es
 * `connect-src 'self'`, y sobre todo el límite de consultas sería decorativo si
 * el navegador pudiera llamar al webhook por su cuenta.
 */
(function () {
  /** Cuántos turnos se ven a la vez en el panel. */
  const MAX_TURNOS = 40;

  /**
   * La conversación EN PANTALLA vive en memoria, no en `localStorage`.
   *
   * Antes se guardaba, así que al reabrir el panel aparecía la conversación de ayer y
   * había que desplazarse hasta el fondo para escribir. Y peor: sin las sugerencias de
   * inicio, que son lo que le dice a alguien qué puede preguntar.
   *
   * Perder lo que se ve NO es perder el contexto. La memoria del agente vive en n8n,
   * indexada por la cuenta —no por la pestaña—, así que Mateo sigue recordando de qué
   * se habló y puede seguir personalizando; lo único que se reinicia es el lienzo.
   * Que es lo que se pidió: «esto debería guardarse como contexto, pero no mostrar el
   * mismo chat siempre».
   *
   * Estar en memoria es justo lo que da el comportamiento que se quiere: la
   * conversación dura lo que dura la página. Recargar la borra —ahí la persona sí
   * espera empezar de cero— y cerrar el panel no, porque cerrarlo por error no
   * puede costar lo que llevabas escrito. Guardarla en `localStorage` haría lo
   * primero imposible; borrarla al cerrar hacía lo segundo inevitable.
   */
  let turnos = [];

  let abierto = false;
  let enviando = false;
  let adjunto = null;
  let disponible = false;
  /** ¿Este plan puede adjuntar? Lo dice el servidor con la cuenta en mano. */
  let puedeAdjuntar = false;
  let limites = null;
  /** Con qué sesión se abrió lo que se ve. Si cambia, la conversación no es de quien está ahora. */
  let tokenDeLaConversacion = localStorage.getItem('radar_token');

  const $ = (id) => document.getElementById(id);
  const conCuenta = () => !!localStorage.getItem('radar_token');

  // ───────────────────────── historial local ─────────────────────────

  const leerHistorial = () => turnos;

  function guardarHistorial(nuevos) {
    turnos = nuevos.slice(-MAX_TURNOS);
  }

  /**
   * Vacía lo que se ve en el panel. Lo que Mateo recuerda no está aquí: su memoria
   * vive en n8n, indexada por cuenta, y esto no la toca.
   *
   * NO se llama al cerrar el panel. Cerrarlo sin querer —la X, un Escape— no puede
   * costarle a nadie la conversación que estaba teniendo; el panel es una ventana
   * sobre la conversación, no la conversación. Lo que sí la borra es recargar la
   * página, y eso ya pasa solo: los turnos viven en memoria.
   *
   * Se llama cuando cambia quién está delante, que ahí sí hay que olvidar.
   */
  function limpiarConversacion() {
    turnos = [];
    adjunto = null;
    limpiarError();
    const caja = $('asistente-archivo');
    if (caja) caja.hidden = true;
    // Repintar aquí, y no dejarlo para la próxima apertura: si el panel está
    // ABIERTO cuando cambia la cuenta —alguien cierra sesión desde otra pestaña—,
    // vaciar solo la variable dejaría en pantalla la conversación de la persona
    // anterior, que es justo lo que había que evitar.
    pintarTurnos();
  }

  // Restos de cuando la conversación se guardaba en el navegador. Se borra una vez
  // para que nadie arrastre la de la semana pasada al actualizar.
  try { localStorage.removeItem('radar_asistente_historial_v1'); } catch { /* da igual */ }

  // ───────────────────────── texto seguro ─────────────────────────

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /**
   * Formato mínimo para la respuesta del agente.
   *
   * El modelo contesta en Markdown y las páginas de los tutores lo pintan con una
   * biblioteca traída de un CDN. Aquí no se puede —`script-src 'self'`— y tampoco
   * hace falta: negritas, listas, enlaces y saltos de línea cubren todo lo que
   * este agente produce.
   *
   * **Se escapa PRIMERO y se marca después.** Al revés, una respuesta que
   * contuviera `<img onerror=...>` se convertiría en HTML ejecutable, y parte de
   * lo que el agente repite viene de documentos que sube el propio usuario.
   */
  function formatear(texto) {
    const lineas = esc(texto).split('\n');
    let html = '';
    let enLista = false;
    for (const linea of lineas) {
      const item = linea.match(/^\s*[-*]\s+(.*)$/);
      if (item) {
        if (!enLista) { html += '<ul>'; enLista = true; }
        html += `<li>${enfasis(item[1])}</li>`;
        continue;
      }
      if (enLista) { html += '</ul>'; enLista = false; }
      if (linea.trim()) html += `<p>${enfasis(linea)}</p>`;
    }
    if (enLista) html += '</ul>';
    return html;
  }

  function enfasis(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      // Solo enlaces del propio Radar. Un enlace a cualquier sitio dentro de una
      // respuesta generada es una vía para llevar al usuario a donde no queremos,
      // y el agente solo tiene motivos para enlazar fichas de aquí.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (todo, txt, url) => (
        mismoOrigen(url) ? `<a href="${url}" target="_self">${txt}</a>` : txt
      ))
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, (todo, pre, url) => (
        mismoOrigen(url) ? `${pre}<a href="${url}">${url}</a>` : todo
      ));
  }

  function mismoOrigen(url) {
    try { return new URL(url, location.origin).origin === location.origin; } catch { return false; }
  }

  // ───────────────────────── pintado ─────────────────────────

  function pintarTurnos() {
    const hilo = $('asistente-hilo');
    if (!hilo) return;
    const turnos = leerHistorial();
    if (!turnos.length) {
      hilo.innerHTML = `
        <div class="asis-bienvenida">
          <p><strong>Pregúntame lo que necesites.</strong></p>
          <p>Te ayudo a moverte por el Radar, a entender qué significa cada dato y a
             resolver dudas legales o tributarias de una inversión. También puedo
             buscarte oportunidades.</p>
          <div class="asis-sugerencias">
            <button type="button" class="asis-chip">¿Qué significa Oportunidad Fuerte?</button>
            <button type="button" class="asis-chip">Busca apartamentos en Envigado por menos de 300 millones</button>
            <button type="button" class="asis-chip">¿Qué gastos tengo además del precio?</button>
            <button type="button" class="asis-chip">¿Qué revisar antes de comprar en un remate?</button>
          </div>
        </div>`;
      return;
    }
    hilo.innerHTML = turnos.map((t) => {
      if (t.de === 'usuario') {
        return `<div class="asis-msg asis-yo"><p>${esc(t.texto)}</p>${
          t.archivo ? `<span class="asis-adj">📎 ${esc(t.archivo)}</span>` : ''}</div>`;
      }
      if (t.de === 'accion') {
        // El número puede faltar si la carga del listado falló: se dice lo que se
        // sabe y no se inventa un cero, que se leería como «no hay nada».
        // El asistente ya dice en su mensaje qué búsqueda dejó puesta. Aquí no se
        // repite: se da el dato que él no tiene —cuántas hay ya cargadas en la
        // pantalla de detrás— y el paso para ir a verlas.
        const donde = esc(NOMBRE_FUENTE[t.fuente] || 'el Radar');
        const cuantas = typeof t.total === 'number'
          ? `<strong>${t.total}</strong> en ${donde}, ya en tu pantalla.`
          : `Listo en ${donde}.`;
        return `<div class="asis-accion">
          <p>${cuantas}</p>
          <button type="button" class="asis-ver">Ver las propiedades</button>
        </div>`;
      }
      return `<div class="asis-msg asis-bot">${formatear(t.texto)}</div>`;
    }).join('');
    hilo.scrollTop = hilo.scrollHeight;
  }

  function pintarCupo() {
    const caja = $('asistente-cupo');
    if (!caja) return;
    if (!limites || limites.ilimitado) { caja.hidden = true; return; }
    caja.hidden = false;
    const quedan = limites.restantes ?? 0;
    caja.textContent = quedan > 0
      ? `Te quedan ${quedan} de ${limites.limite} consultas este mes.`
      : `Se te acabaron las ${limites.limite} consultas de este mes.`;
    caja.classList.toggle('agotado', quedan <= 0);
  }

  function mostrarError(texto) {
    const caja = $('asistente-error');
    if (!caja) return;
    caja.textContent = texto;
    caja.hidden = false;
  }

  function limpiarError() {
    const caja = $('asistente-error');
    if (caja) caja.hidden = true;
  }

  // ───────────────────────── adjuntos ─────────────────────────

  function describirTamano(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  /**
   * Se comprueba aquí ADEMÁS de en el servidor.
   *
   * No por seguridad —el servidor vuelve a validarlo, y esa es la comprobación que
   * cuenta— sino por cortesía: subir 14 MB por una red móvil para que te digan al
   * final que no valían es un minuto perdido y unos datos gastados. El servidor
   * sigue siendo quien decide.
   */
  function validarArchivo(file) {
    const max = (limites && limites.maxBytes) || 10 * 1024 * 1024;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const permitidas = (limites && limites.formatos) || ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'webp'];
    if (!permitidas.includes(ext)) {
      return `Ese formato no lo puedo leer. Acepto ${permitidas.join(', ')}.`;
    }
    if (file.size > max) {
      return `Ese archivo pesa ${describirTamano(file.size)} y el máximo es ${describirTamano(max)}.`;
    }
    return null;
  }

  function elegirArchivo(file) {
    limpiarError();
    const problema = validarArchivo(file);
    if (problema) { mostrarError(problema); $('asistente-file').value = ''; return; }
    const lector = new FileReader();
    lector.onload = () => {
      // `readAsDataURL` devuelve «data:<mime>;base64,<datos>». Al servidor solo le
      // interesa la parte de después de la coma.
      adjunto = {
        nombre: file.name,
        mime: file.type || 'application/octet-stream',
        base64: String(lector.result).split(',')[1] || '',
      };
      const caja = $('asistente-archivo');
      caja.hidden = false;
      caja.querySelector('.asis-archivo-nombre').textContent = `📎 ${file.name} (${describirTamano(file.size)})`;
    };
    lector.onerror = () => mostrarError('No pude leer ese archivo. Prueba con otro.');
    lector.readAsDataURL(file);
  }

  function quitarArchivo() {
    adjunto = null;
    $('asistente-archivo').hidden = true;
    $('asistente-file').value = '';
  }

  // ───────────────────────── envío ─────────────────────────

  async function enviar(texto) {
    if (enviando) return;
    const pregunta = String(texto ?? $('asistente-texto').value).trim();
    if (!pregunta) return;
    limpiarError();

    const turnos = leerHistorial();
    turnos.push({ de: 'usuario', texto: pregunta, archivo: adjunto?.nombre || '' });
    guardarHistorial(turnos);
    pintarTurnos();

    $('asistente-texto').value = '';
    enviando = true;
    $('asistente-enviar').disabled = true;
    mostrarEscribiendo(true);

    const cuerpo = { pregunta };
    if (adjunto) cuerpo.adjunto = adjunto;

    try {
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('radar_token')}`,
        },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();
      if (data.consultas) { limites = { ...limites, ...data.consultas }; pintarCupo(); }
      if (!res.ok || !data.ok) {
        // El cupo agotado no es un error cualquiera: hay algo que ofrecer.
        if (res.status === 429 && data.motivo === 'agotado') {
          mostrarAgotado(data);
        } else {
          mostrarError(data.error || 'No pude responder. Vuelve a intentarlo.');
        }
        return;
      }
      const conRespuesta = leerHistorial();
      conRespuesta.push({ de: 'bot', texto: data.respuesta });
      guardarHistorial(conRespuesta);
      pintarTurnos();
      quitarArchivo();
      // Si el agente buscó, la aplicación se configura sola. El servidor apunta
      // qué buscó de verdad y lo manda aquí; no se lee de su respuesta escrita.
      if (data.accion && data.accion.tipo === 'buscar') aplicarBusqueda(data.accion);
    } catch {
      mostrarError('Se cortó la conexión. Vuelve a intentarlo.');
    } finally {
      enviando = false;
      $('asistente-enviar').disabled = false;
      mostrarEscribiendo(false);
    }
  }

  /** Cómo se llama cada fuente cuando hay que decirla en voz alta. */
  const NOMBRE_FUENTE = {
    portal: 'anuncios de portales',
    banco: 'activos de bancos',
    remate: 'remates judiciales',
  };

  /**
   * Deja la búsqueda del agente puesta en la aplicación.
   *
   * El chat no lista propiedades: eso ya lo hace la pantalla, con fotos, orden y
   * filtros. Lo que hace es configurarla —los filtros a la vista, la pestaña de la
   * fuente correcta, el listado cargado— y ofrecer el paso de ir a verla.
   *
   * SE MANDAN TODOS LOS CAMPOS, TAMBIÉN LOS VACÍOS. `aplicar` respeta lo que no
   * llega, que es lo correcto cuando lo toca una persona, pero aquí sería un
   * error: si alguien buscó apartamentos y luego pide «remates en Medellín», el
   * tipo anterior seguiría puesto y la pantalla mostraría una búsqueda que nadie
   * pidió y que además no cuadra con el número que el asistente acaba de decir.
   * El servidor manda lo que de verdad buscó; lo que no está, no estaba.
   */
  async function aplicarBusqueda(accion) {
    const buscador = window.RadarBuscador;
    // Si el buscador no está —una versión vieja en caché, otra página—, el chat
    // sigue funcionando: se queda en la respuesta escrita, que se basta sola.
    if (!buscador || typeof buscador.aplicar !== 'function') return;
    const f = accion.filtros || {};
    let r;
    try {
      r = await buscador.aplicar({
        fuente: accion.fuente,
        ciudad: f.ciudad || '',
        tipo: f.tipo || '',
        precioMin: f.precioMin == null ? '' : f.precioMin,
        precioMax: f.precioMax == null ? '' : f.precioMax,
        tier: f.tier || '',
      });
    } catch { return; }
    if (!r || r.ok === false) return;
    const conAccion = leerHistorial();
    // `r.total` y no el del servidor: es el que se ve de verdad en pantalla, y
    // decir un número distinto del que hay debajo es peor que no decir ninguno.
    conAccion.push({ de: 'accion', total: r.total, fuente: r.fuente });
    guardarHistorial(conAccion);
    pintarTurnos();
  }

  function mostrarEscribiendo(visible) {
    const hilo = $('asistente-hilo');
    const previo = hilo.querySelector('.asis-escribiendo');
    if (previo) previo.remove();
    if (!visible) return;
    const p = document.createElement('div');
    p.className = 'asis-msg asis-bot asis-escribiendo';
    p.innerHTML = '<span></span><span></span><span></span>';
    hilo.appendChild(p);
    hilo.scrollTop = hilo.scrollHeight;
  }

  /**
   * Se acabó el cupo del mes.
   *
   * Dice cuántos días faltan para el reinicio y ofrece la salida —el plan— en el
   * mismo sitio donde se topó el límite. Es el mismo criterio del aviso de fichas
   * agotadas: quien se queda sin cupo está en el momento de mayor intención, y
   * mandarlo a buscar la página de planes por su cuenta es perderlo.
   */
  function mostrarAgotado(data) {
    const dias = data.consultas?.diasParaReinicio;
    const hilo = $('asistente-hilo');
    const aviso = document.createElement('div');
    aviso.className = 'asis-agotado';
    aviso.innerHTML = `
      <p><strong>Se te acabaron las consultas de este mes.</strong></p>
      <p>Puedes seguir usando el Radar con normalidad${
        dias ? `, y el ${dias === 1 ? 'mañana' : `día 1, en ${dias} días`} vuelves a tener consultas` : ''
      }. Con el plan Pro no hay límite.</p>
      <a class="asis-cta" href="/planes">Quitar el límite</a>`;
    hilo.appendChild(aviso);
    hilo.scrollTop = hilo.scrollHeight;
  }

  // ───────────────────────── apertura ─────────────────────────

  function abrir() {
    abierto = true;
    $('asistente-panel').classList.add('abierto');
    $('asistente-panel').setAttribute('aria-hidden', 'false');
    $('asistente-btn').setAttribute('aria-expanded', 'true');
    pintarTurnos();
    pintarCupo();
    // En un móvil el teclado tapa medio panel; enfocar en el escritorio ahorra un
    // clic y en el móvil molesta, así que solo se hace donde ayuda.
    if (window.innerWidth > 760) $('asistente-texto').focus();
  }

  function cerrar() {
    abierto = false;
    // La conversación se queda. Solo se retira el error, que era de la petición
    // anterior y al reabrir sería ruido viejo.
    limpiarError();
    $('asistente-panel').classList.remove('abierto');
    $('asistente-panel').setAttribute('aria-hidden', 'true');
    $('asistente-btn').setAttribute('aria-expanded', 'false');
    $('asistente-btn').focus();
  }

  // ───────────────────────── arranque ─────────────────────────

  /**
   * El asistente solo existe para quien tiene cuenta.
   *
   * Lo pidió el cliente y además es lo coherente: la memoria de la conversación se
   * indexa por la cuenta, así que sin cuenta no hay dónde guardarla, y el límite
   * mensual necesita a alguien a quien contárselo.
   */
  /**
   * ¿Esta cuenta es de pago?
   *
   * Se pregunta al servidor en vez de deducirlo de tener sesión: eso ya nos costó
   * una vez que una cuenta gratuita viera contenido de pago. `/api/account` es la
   * autoridad.
   */
  async function esSuscrito() {
    try {
      const r = await fetch('/api/account', { headers: { Authorization: `Bearer ${localStorage.getItem('radar_token')}` } });
      const d = await r.json();
      return d.account?.plan === 'pro';
    } catch {
      return false;
    }
  }

  async function iniciar() {
    // Si cambió quién está delante —cerró sesión, o entró otra cuenta en esta
    // misma pestaña— lo que se veía era de otra persona y se va. Es el único caso
    // en que el panel se vacía solo, y aquí sí es obligatorio: la conversación
    // puede llevar dentro qué está buscando y cuánto puede pagar.
    const token = localStorage.getItem('radar_token');
    if (token !== tokenDeLaConversacion) {
      limpiarConversacion();
      tokenDeLaConversacion = token;
    }
    if (!conCuenta()) { ocultarTodo(); return; }
    try {
      const config = await fetch('/api/config').then((r) => r.json());
      disponible = config.asistenteReady === true;
    } catch {
      disponible = false;
    }
    if (!disponible) { ocultarTodo(); return; }
    $('asistente-btn').hidden = false;
    // Adjuntar es del plan de pago: el clip se retira en vez de dejarlo y
    // contestar «esto es de pago» cuando lo pulsen. Y el pie deja de prometerlo.
    puedeAdjuntar = await esSuscrito();
    if (!puedeAdjuntar) {
      const clip = $('asistente-adjuntar');
      if (clip) clip.hidden = true;
      const pie = document.querySelector('.asis-pie');
      if (pie) pie.textContent = 'Escríbeme tu pregunta. Adjuntar documentos e imágenes es parte del plan completo.';
    }
    if (Array.isArray(window.__asistenteLimites)) limites = null;
  }

  function ocultarTodo() {
    const btn = $('asistente-btn');
    const panel = $('asistente-panel');
    if (btn) btn.hidden = true;
    if (panel) panel.classList.remove('abierto');
  }

  function conectar() {
    if (!$('asistente-btn')) return;
    $('asistente-btn').addEventListener('click', () => (abierto ? cerrar() : abrir()));
    $('asistente-cerrar').addEventListener('click', cerrar);
    $('asistente-enviar').addEventListener('click', () => enviar());
    $('asistente-adjuntar').addEventListener('click', () => $('asistente-file').click());
    $('asistente-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) elegirArchivo(f);
    });
    $('asistente-quitar-archivo').addEventListener('click', quitarArchivo);
    $('asistente-texto').addEventListener('keydown', (e) => {
      // Enter envía, Mayúsculas+Enter hace salto de línea: lo que espera cualquiera
      // que haya usado un chat.
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });
    $('asistente-hilo').addEventListener('click', (e) => {
      // Cerrar es el punto: la búsqueda ya está aplicada detrás del panel, y en
      // móvil el panel la tapa entera.
      if (e.target.closest('.asis-ver')) { cerrar(); return; }
      const chip = e.target.closest('.asis-chip');
      if (chip) enviar(chip.textContent);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && abierto) cerrar();
    });
    // Quien acaba de entrar o de salir cambia de estado sin recargar la página.
    window.addEventListener('storage', (e) => {
      if (e.key === 'radar_token') iniciar();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { conectar(); iniciar(); });
  } else {
    conectar();
    iniciar();
  }

  window.__radarAsistente = { abrir, cerrar, iniciar };
})();
