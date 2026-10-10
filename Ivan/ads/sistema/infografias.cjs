/* Dibuja infografías animadas como secuencias de PNG con transparencia.
 *
 * Por qué existen: hay frases del guion que describen una ESTRUCTURA («un mapa
 * de preguntas y prioridades», «en qué orden vas a conectar…», «de ideas
 * aisladas a decisiones conectadas», «cuando conecta sus ciclos»). Decirlas
 * sobre un plano de alguien hablando desperdicia la frase; dibujarlas la
 * remata. Fuera de esos momentos no pintan nada, así que van en cuatro
 * anuncios de diez y no en los diez.
 *
 * Cuatro gramáticas distintas a propósito. Si las cuatro fueran la misma lista
 * animada, la campaña entera se leería como una plantilla, que es justo lo que
 * el cliente no quiere.
 *
 *   ruta   · lista vertical que se va marcando   → un recorrido de preguntas
 *   orden  · barras escalonadas numeradas        → una secuencia
 *   red    · puntos sueltos que se conectan      → de aislado a sistema
 *   ciclo  · cuatro nodos en bucle con flechas   → un ciclo que se cierra
 *
 * La animación acaba en el 88 % de la ventana: el último medio segundo se
 * queda quieto para que dé tiempo a leerlo.
 *
 * Uso:
 *   node infografias.cjs anuncio-02      (NODE_PATH → Playwright/node_modules)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = '/Users/cristhian/Downloads/Paginas Web/Ivan/ads/sistema';
const FACES = fs.readFileSync(
  '/Users/cristhian/Downloads/Paginas Web/Ivan/videos/huerta-lab-login/assets/fonts/faces.css',
  'utf8');
const FPS = 25;
const W = 1080, H = 430;

const CSS = `
  :root{
    --deep:#061f1d; --green:#0f4640; --leaf:#87a942; --lime:#c8db52;
    --coral:#ef7854; --ivory:#f8f5ed;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent}
  body{width:${W}px;height:${H}px;overflow:hidden;
       font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif}
  #lienzo{position:relative;width:${W}px;height:${H}px}

  /* La referencia de tamaño es el subtítulo, que va a 74 px. Una infografía a
     40 px al lado de eso se lee como letra pequeña y en un móvil no se lee: la
     primera versión salió así y hubo que rehacerla. Aquí nada baja de 42. */

  .cap{position:absolute;left:0;right:0;top:6px;text-align:center}
  .cap span{display:inline-block;padding:10px 26px;border-radius:999px;
       background:rgba(6,31,29,.92);border:1px solid rgba(200,219,82,.34);
       font-size:36px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
       color:var(--lime)}

  /* --- ruta: cuatro paradas que se van marcando --- */
  .fila{position:absolute;left:56px;right:56px;display:flex;align-items:center;gap:24px}
  .bolita{flex:0 0 auto;width:64px;height:64px;border-radius:50%;
          background:var(--lime);color:var(--deep);display:grid;place-content:center;
          font-size:34px;font-weight:800;box-shadow:0 8px 26px rgba(4,16,15,.6)}
  .texto{padding:12px 24px;border-radius:16px;background:rgba(6,31,29,.90);
         border:1px solid rgba(200,219,82,.26);
         font-size:52px;font-weight:700;color:#fff;line-height:1.1;white-space:nowrap;
         box-shadow:0 10px 30px rgba(4,16,15,.5)}
  .hilo{position:absolute;left:85px;width:6px;border-radius:3px;
        background:linear-gradient(180deg,var(--lime),rgba(200,219,82,.30))}

  /* --- orden: barras escalonadas --- */
  .barra{position:absolute;height:78px;border-radius:18px;display:flex;align-items:center;
         gap:24px;padding:0 30px;background:rgba(6,31,29,.92);
         border:1px solid rgba(200,219,82,.32);box-shadow:0 12px 34px rgba(4,16,15,.55)}
  .barra i{font-style:normal;width:50px;height:50px;border-radius:50%;flex:0 0 auto;
           background:var(--lime);color:var(--deep);display:grid;place-content:center;
           font-size:30px;font-weight:800}
  .barra span{font-size:46px;font-weight:700;color:#fff;white-space:nowrap}

  /* --- red: puntos que se conectan --- */
  .punto{position:absolute;width:38px;height:38px;border-radius:50%;
         background:var(--ivory);box-shadow:0 4px 18px rgba(4,16,15,.7)}
  svg.lineas{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  svg.lineas line{stroke:var(--lime);stroke-width:7;stroke-linecap:round}

  /* --- ciclo: cuatro nodos en bucle --- */
  .nodo{position:absolute;padding:22px 32px;border-radius:20px;
        background:rgba(6,31,29,.93);border:1px solid rgba(200,219,82,.36);
        font-size:42px;font-weight:700;color:#fff;white-space:nowrap;
        box-shadow:0 12px 34px rgba(4,16,15,.55)}
  svg.flechas{position:absolute;inset:0;width:100%;height:100%}
  svg.flechas path{stroke:var(--lime);stroke-width:7;fill:none;
                   stroke-linecap:round;stroke-linejoin:round}
`;

/* Cada elemento entra en su turno y todos han entrado al 88 % de la ventana.
   El resto es tiempo de lectura: una infografía que sigue moviéndose cuando ya
   hay que leerla no se lee. */
function paso(t, k, total, ancho = 0.20) {
  const ini = 0.06 + (0.82 - ancho) * (total > 1 ? k / (total - 1) : 0);
  const p = Math.min(1, Math.max(0, (t - ini) / ancho));
  return p * p * (3 - 2 * p);            // suavizado
}

const DIBUJA = {
  ruta(d) {
    const n = d.items.length, alto = 102, y0 = (H - (n - 1) * alto) / 2 - 4;
    return `
      <div class="hilo" id="hilo" style="top:${y0 - 14}px;height:${(n - 1) * alto + 28}px"></div>
      ${d.items.map((x, k) => `
        <div class="fila" id="e${k}" style="top:${y0 + k * alto - 32}px">
          <div class="bolita">${k + 1}</div><div class="texto">${x}</div>
        </div>`).join('')}`;
  },
  orden(d) {
    const n = d.items.length, alto = 84, y0 = (H - (n - 1) * alto - 78) / 2;
    return d.items.map((x, k) => `
      <div class="barra" id="e${k}" style="top:${y0 + k * alto}px;left:${56 + k * 52}px">
        <i>${k + 1}</i><span>${x}</span>
      </div>`).join('');
  },
  red(d) {
    const P = [[140, 320], [330, 150], [520, 340], [700, 160], [900, 300], [430, 250], [780, 350]];
    const L = [[0, 5], [5, 1], [1, 3], [3, 6], [6, 4], [5, 2], [2, 6]];
    return `
      <div class="cap" id="cap1"><span>${d.antes}</span></div>
      <div class="cap" id="cap2"><span>${d.despues}</span></div>
      <svg class="lineas">${L.map((l, k) =>
        `<line id="l${k}" x1="${P[l[0]][0]}" y1="${P[l[0]][1]}" x2="${P[l[1]][0]}" y2="${P[l[1]][1]}"/>`).join('')}</svg>
      ${P.map((p, k) => `<div class="punto" id="e${k}" style="left:${p[0] - 13}px;top:${p[1] - 13}px"></div>`).join('')}`;
  },
  ciclo(d) {
    const pos = [[64, 44], [560, 44], [560, 254], [64, 254]];
    return `
      <svg class="flechas">
        <path id="f0" d="M 356 100 L 542 100 L 526  90 M 542 100 L 526 110"/>
        <path id="f1" d="M 790 162 L 790 240 L 780 226 M 790 240 L 800 226"/>
        <path id="f2" d="M 542 310 L 356 310 L 372 300 M 356 310 L 372 320"/>
        <path id="f3" d="M 196 240 L 196 162 L 186 178 M 196 162 L 206 178"/>
      </svg>
      ${d.items.map((x, k) => `<div class="nodo" id="e${k}" style="left:${pos[k][0]}px;top:${pos[k][1]}px">${x}</div>`).join('')}`;
  },
};

const ANIMA = {
  ruta: (t, d) => {
    const n = d.items.length;
    for (let k = 0; k < n; k++) {
      const p = paso(t, k, n);
      const e = document.getElementById('e' + k);
      e.style.opacity = p;
      e.style.transform = `translateX(${(1 - p) * -34}px)`;
    }
    document.getElementById('hilo').style.transform = `scaleY(${paso(t, 0, 1, 0.55)})`;
    document.getElementById('hilo').style.transformOrigin = 'top';
  },
  orden: (t, d) => {
    const n = d.items.length;
    for (let k = 0; k < n; k++) {
      const p = paso(t, k, n);
      const e = document.getElementById('e' + k);
      e.style.opacity = p;
      e.style.transform = `translateX(${(1 - p) * -46}px)`;
    }
  },
  red: (t) => {
    for (let k = 0; k < 7; k++) {
      const p = paso(t, k, 7, 0.14);
      const e = document.getElementById('e' + k);
      e.style.opacity = p;
      e.style.transform = `scale(${0.5 + 0.5 * p})`;
      // los puntos pasan de marfil a lima cuando ya hay red
      e.style.background = t > 0.52 ? 'var(--lime)' : 'var(--ivory)';
    }
    for (let k = 0; k < 7; k++) {
      const p = Math.min(1, Math.max(0, (t - 0.50 - k * 0.045) / 0.13));
      const l = document.getElementById('l' + k);
      const dx = l.x2.baseVal.value - l.x1.baseVal.value;
      const dy = l.y2.baseVal.value - l.y1.baseVal.value;
      const largo = Math.hypot(dx, dy);
      l.style.strokeDasharray = largo;
      l.style.strokeDashoffset = largo * (1 - p);
    }
    document.getElementById('cap1').style.opacity = Math.max(0, 1 - Math.max(0, (t - 0.36) / 0.14));
    document.getElementById('cap2').style.opacity = Math.min(1, Math.max(0, (t - 0.54) / 0.16));
  },
  ciclo: (t, d) => {
    for (let k = 0; k < d.items.length; k++) {
      const p = paso(t, k, d.items.length, 0.16);
      const e = document.getElementById('e' + k);
      e.style.opacity = p;
      e.style.transform = `scale(${0.86 + 0.14 * p})`;
    }
    for (let k = 0; k < 4; k++) {
      const p = Math.min(1, Math.max(0, (t - 0.20 - k * 0.155) / 0.13));
      const f = document.getElementById('f' + k);
      const largo = f.getTotalLength();
      f.style.strokeDasharray = largo;
      f.style.strokeDashoffset = largo * (1 - p);
    }
  },
};

(async () => {
  const nombre = process.argv[2];
  const spec = JSON.parse(fs.readFileSync(path.join(BASE, `infografias-${nombre}.json`), 'utf8'));
  const nav = await chromium.launch({ channel: 'chrome' });
  const pag = await nav.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  for (const g of spec) {
    const dir = path.join(BASE, '_rot', nombre, 'info', g.id);
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round((g.t1 - g.t0) * FPS);
    await pag.setContent(`<style>${FACES}${CSS}</style>
      <div id="lienzo">${DIBUJA[g.tipo](g)}</div>`, { waitUntil: 'load' });
    await pag.evaluate(() => document.fonts.ready);
    await pag.exposeFunction('nada', () => {});
    for (let i = 0; i < n; i++) {
      // `paso` vive en este fichero, no en la página: hay que mandarlo también,
      // o el navegador se queda con una función que llama a algo que no existe.
      await pag.evaluate(([ayuda, fn, t, d]) =>
        (new Function('t', 'd', `const paso=${ayuda};(${fn})(t,d)`))(t, d),
        [paso.toString(), ANIMA[g.tipo].toString(), i / (n - 1), g]);
      await pag.locator('#lienzo').screenshot({
        path: path.join(dir, String(i).padStart(3, '0') + '.png'), omitBackground: true });
    }
    console.log(`  ${g.id} (${g.tipo}): ${n} fotogramas · ${g.t0}-${g.t1}s`);
  }
  await nav.close();
})();
