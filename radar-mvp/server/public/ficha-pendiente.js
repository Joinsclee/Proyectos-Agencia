'use strict';

/**
 * La ficha que el usuario estaba mirando cuando se fue a registrarse, a iniciar
 * sesión o a activar el plan.
 *
 * Existe porque ese es el momento de mayor intención que tiene el producto:
 * alguien leyendo una oportunidad concreta que choca con el muro. Si al volver
 * aterriza en el listado tiene que buscarla otra vez a mano —y la mayoría no lo
 * hace—, así que cada registro se cobraba perdiendo la ficha que lo provocó.
 *
 * Vive en su propio archivo porque lo comparten tres páginas que no comparten
 * bundle: el Radar la GUARDA y la CONSUME, /login la ANUNCIA (saber que vas a
 * volver es justo lo que hace que valga la pena rellenar el formulario) y /planes
 * la consulta para saber a dónde devolver tras activar el acceso.
 */
(function () {
  const CLAVE = 'radar_ficha_pendiente_v1';
  const TIPOS = new Set(['portal', 'banco', 'remate']);

  /**
   * Media hora.
   *
   * El plazo tiene que cubrir el desvío más largo que provoca el propio producto
   * —el OAuth con Google, o el checkout de Wompi esperando su webhook, que son
   * minutos— y quedarse muy por debajo de la siguiente VISITA. Reabrirle sola a
   * alguien una ficha que miró ayer no continúa su intención: es una ventana que
   * le tapa la pantalla sin que él haya pedido nada. Media hora deja holgura de
   * sobra al desvío y coincide con lo que cualquier analítica considera "la misma
   * sesión", que es exactamente el límite que queremos.
   */
  const VIGENCIA_MS = 30 * 60 * 1000;

  function olvidar() {
    try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento no hay nada que olvidar */ }
  }

  function guardar(kind, id, titulo) {
    if (!TIPOS.has(kind) || !id) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        kind,
        id: String(id),
        // El título solo sirve para poder nombrarla en /login. Se recorta porque
        // es un titular, no un dato: nada del sistema decide con él.
        titulo: titulo ? String(titulo).slice(0, 80) : '',
        ts: Date.now(),
      }));
    } catch { /* modo privado: sin memoria el flujo simplemente no mejora */ }
  }

  function leer() {
    let guardada = null;
    try { guardada = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
    if (!guardada || !TIPOS.has(guardada.kind) || !guardada.id) return null;
    // Se valida el tipo contra la lista cerrada porque este valor viaja luego a
    // /api/property: lo que salga de aquí tiene que ser uno de los tres, venga
    // como venga del almacenamiento.
    const edad = Date.now() - Number(guardada.ts);
    if (!(edad >= 0 && edad < VIGENCIA_MS)) { olvidar(); return null; }
    return { kind: guardada.kind, id: String(guardada.id), titulo: String(guardada.titulo || '') };
  }

  window.__fichaPendiente = { guardar, leer, olvidar, VIGENCIA_MS };
})();
