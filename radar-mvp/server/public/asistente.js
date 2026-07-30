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
  const CLAVE_HISTORIAL = 'radar_asistente_historial_v1';
  /** Cuántos turnos se recuerdan en el navegador. La memoria de verdad vive en n8n. */
  const MAX_TURNOS = 40;

  let abierto = false;
  let enviando = false;
  let adjunto = null;
  let disponible = false;
  /** ¿Este plan puede adjuntar? Lo dice el servidor con la cuenta en mano. */
  let puedeAdjuntar = false;
  let limites = null;

  const $ = (id) => document.getElementById(id);
  const conCuenta = () => !!localStorage.getItem('radar_token');

  // ───────────────────────── historial local ─────────────────────────

  /**
   * El historial se guarda para que al recargar no parezca que la conversación
   * se borró. No es la memoria del agente —esa la lleva n8n, indexada por la
   * cuenta— sino solo lo que se ve en pantalla.
   */
  function leerHistorial() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) || '[]');
      return Array.isArray(v) ? v.slice(-MAX_TURNOS) : [];
    } catch {
      return [];
    }
  }

  function guardarHistorial(turnos) {
    try {
      localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(turnos.slice(-MAX_TURNOS)));
    } catch { /* modo privado: la conversación vive solo mientras dure la pestaña */ }
  }

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
    hilo.innerHTML = turnos.map((t) => (
      t.de === 'usuario'
        ? `<div class="asis-msg asis-yo"><p>${esc(t.texto)}</p>${
          t.archivo ? `<span class="asis-adj">📎 ${esc(t.archivo)}</span>` : ''}</div>`
        : `<div class="asis-msg asis-bot">${formatear(t.texto)}</div>`
    )).join('');
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
    } catch {
      mostrarError('Se cortó la conexión. Vuelve a intentarlo.');
    } finally {
      enviando = false;
      $('asistente-enviar').disabled = false;
      mostrarEscribiendo(false);
    }
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
