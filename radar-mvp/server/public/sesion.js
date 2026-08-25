/**
 * La sesión, para las páginas que no son la aplicación.
 *
 * `app.js` sabía renovar el token desde el primer día: si una petición vuelve 401
 * y hay token de refresco, lo canjea y reintenta. Las otras cinco páginas
 * —planes, cuenta, comparador, administración y pago— leían `radar_token` de
 * `localStorage` y lo mandaban tal cual.
 *
 * El efecto no se parecía a una sesión caducada, que es lo que lo hacía difícil de
 * ver: entrabas, usabas el Radar sin problema, ibas a «Planes» y la barra te
 * ofrecía «Ingresar» como si nunca hubieras entrado. La sesión estaba viva —el
 * token de refresco seguía siendo válido— pero esa página no sabía pedirlo, así
 * que trataba un 401 recuperable como «este visitante es anónimo». Y quien pulsa
 * «Ingresar» ya estando dentro no piensa «se me caducó el token»: piensa que la
 * herramienta le echó.
 *
 * Va en su propio archivo y con nombre propio porque `app.js` ya define
 * `fetchConSesion` en el ámbito global que comparten estos scripts clásicos: dos
 * definiciones del mismo nombre serían un choque silencioso el día que alguien
 * cargue los dos en la misma página.
 */
(function () {
  'use strict';

  let renovando = null;

  const token = () => localStorage.getItem('radar_token');

  /**
   * Canjea el token de refresco. Una sola renovación en vuelo a la vez.
   *
   * Al caducar fallan TODAS las peticiones de la página a la vez y cada una
   * pediría la suya. Además el token de refresco es de un solo uso: la segunda
   * llegaría con uno ya gastado y cerraría la sesión de verdad, que es
   * exactamente el fallo que esto viene a arreglar.
   */
  async function renovar() {
    const refresh = localStorage.getItem('radar_refresh');
    if (!refresh) return false;
    if (renovando) return renovando;
    renovando = (async () => {
      try {
        const r = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) return false;
        localStorage.setItem('radar_token', d.token);
        if (d.refreshToken) localStorage.setItem('radar_refresh', d.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        renovando = null;
      }
    })();
    return renovando;
  }

  /**
   * `fetch` con el token puesto y renovación automática ante un 401.
   *
   * Sin sesión hace la petición pelada, para poder usarse en rutas que responden
   * a cualquiera sin tener que preguntar antes si hay token.
   */
  async function pedir(url, opciones = {}) {
    const con = () => {
      const t = token();
      return fetch(url, {
        ...opciones,
        headers: { ...(opciones.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      });
    };
    let res = await con();
    if (res.status !== 401 || !token()) return res;
    if (await renovar()) {
      res = await con();
      if (res.status !== 401) return res;
    }
    // El refresco tampoco vale: esta sesión sí está muerta. Se limpia para que la
    // página siguiente no vuelva a intentarlo con las mismas credenciales.
    localStorage.removeItem('radar_token');
    localStorage.removeItem('radar_refresh');
    return res;
  }

  window.RadarSesion = { fetch: pedir, renovar, token };
}());
