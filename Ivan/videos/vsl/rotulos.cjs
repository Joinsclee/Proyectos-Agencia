/* Dibuja los rótulos del VSL como PNG con transparencia.
 *
 * Este ffmpeg viene sin libass ni drawtext (no trae freetype), así que no puede
 * quemar subtítulos por sí solo. Y aunque pudiera, libass no lee woff2: las
 * tipografías de La Huerta están en woff2 dentro de faces.css. Chrome sí lee
 * ambas cosas, así que hace de motor tipográfico y ffmpeg solo compone.
 *
 * Uso:
 *   node rotulos.cjs subs registro     → un PNG por subtítulo
 *   node rotulos.cjs tarjetas registro → las tarjetas de pilares, fecha y CTA
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = '/Users/cristhian/Downloads/Paginas Web/Ivan/videos/vsl';
const FACES = fs.readFileSync(
  '/Users/cristhian/Downloads/Paginas Web/Ivan/videos/huerta-lab-login/assets/fonts/faces.css',
  'utf8');

const MARCA = `
  :root{
    --deep:#061f1d; --green:#0f4640; --leaf:#87a942; --lime:#c8db52;
    --coral:#ef7854; --ivory:#f8f5ed; --paper:#fffdf8;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent}
`;

/* ---------- subtítulos ---------- */

const SUBS_CSS = `
  body{width:1920px;height:320px;overflow:hidden}
  #caja{
    width:1920px;height:320px;display:flex;align-items:flex-end;
    justify-content:center;padding:0 220px 34px;
  }
  #txt{
    /* Ancho tope al 56% del cuadro: un subtítulo que cruza los 1920 px de
       lado a lado obliga a barrer con los ojos y se lee peor que en dos
       líneas cortas. */
    max-width:1080px;
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;
    font-weight:600;font-size:60px;line-height:1.17;letter-spacing:-.012em;
    color:#fff;text-align:center;text-wrap:balance;
    /* Contorno + sombra: el subtítulo tiene que leerse igual sobre el cielo
       blanco del hero que sobre la tierra oscura del b-roll. paint-order pone
       el trazo DEBAJO del relleno para que no engorde la letra. */
    paint-order:stroke fill;
    -webkit-text-stroke:9px rgba(4,16,15,.92);
    text-shadow:0 3px 14px rgba(4,16,15,.85), 0 0 44px rgba(4,16,15,.6);
  }
  #txt b{color:var(--lime);font-weight:700}
`;

/* ---------- tarjetas ---------- */

const TARJ_CSS = `
  body{width:1920px;height:1080px;overflow:hidden}
  .lienzo{position:relative;width:1920px;height:1080px}

  /* Pilar: va a la DERECHA. En el plano abierto Iván ocupa de x=400 a x=845
     (medido sobre el 4K); el único hueco limpio es la mesa del lado derecho.
     Y arriba, porque los subtítulos ocupan de y=690 a y=1010. */
  .pilar{
    position:absolute;right:104px;top:132px;width:700px;
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .pilar .n{
    display:inline-block;padding:7px 20px;border-radius:999px;
    background:var(--lime);color:var(--deep);
    font-size:23px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
    box-shadow:0 10px 34px rgba(4,16,15,.5);
  }
  .pilar h2{
    margin-top:22px;font-family:'Zilla Slab',Georgia,serif;font-weight:700;
    font-size:76px;line-height:1.03;letter-spacing:-.03em;
    text-shadow:0 4px 22px rgba(4,16,15,.75), 0 0 60px rgba(4,16,15,.5);
  }
  .pilar p{
    margin-top:18px;font-size:31px;line-height:1.42;font-weight:400;
    color:rgba(255,255,255,.93);
    text-shadow:0 3px 16px rgba(4,16,15,.85);
  }
  .pilar .barra{
    width:96px;height:5px;margin-top:26px;border-radius:3px;background:var(--lime);
    box-shadow:0 6px 22px rgba(4,16,15,.5);
  }

  /* Ficha de datos: bloque sólido, se lee de un vistazo aunque el vídeo esté
     en mute y de fondo.

     El lado NO es decorativo: en el VSL de registro Iván ocupa de x=0.20 a
     x=0.44 del cuadro y la ficha va a la derecha; en el de gracias está de
     x=0.55 a x=0.79 y hay que ponerla a la izquierda con la clase .izq, o le tapa la
     cara. Medido sobre fotograma. */
  .ficha{
    position:absolute;right:104px;top:172px;width:660px;padding:44px 46px;
    border-radius:26px;background:rgba(6,31,29,.93);
    border:1px solid rgba(200,219,82,.34);
    box-shadow:0 34px 90px rgba(0,0,0,.55);
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .ficha.izq{left:104px;right:auto}
  .ficha .eti{color:var(--lime);font-size:21px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
  .ficha h3{margin-top:16px;font-family:'Zilla Slab',Georgia,serif;font-weight:700;font-size:52px;line-height:1.06;letter-spacing:-.025em}
  .ficha ul{margin-top:26px;list-style:none;display:grid;gap:14px}
  .ficha li{display:flex;gap:14px;align-items:baseline;font-size:29px;line-height:1.35;color:rgba(255,255,255,.92)}
  .ficha li i{color:var(--lime);font-style:normal;font-weight:700}

  /* Banda superior, para avisos. En el plano cerrado no queda hueco a los
     lados —Iván ocupa de x=0.30 a x=0.72— pero por encima de su cabeza
     (y<0.30) el cuadro está libre de lado a lado. */
  .banda{
    position:absolute;left:104px;right:104px;top:58px;
    display:flex;align-items:center;gap:28px;padding:26px 34px;
    border-left:6px solid var(--coral);border-radius:0 18px 18px 0;
    background:rgba(6,31,29,.93);box-shadow:0 22px 60px rgba(0,0,0,.5);
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .banda .eti{
    flex:none;color:var(--coral);font-size:20px;font-weight:700;
    letter-spacing:.16em;text-transform:uppercase;
  }
  .banda strong{display:block;font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1.12}
  .banda span{display:block;margin-top:6px;font-size:25px;color:rgba(255,255,255,.8);line-height:1.35}

  /* Rótulo de identificación. A la derecha y por encima de y=690, que es
     donde empieza la banda de subtítulos; abajo a la izquierda —el sitio
     clásico— chocaría con ellos y con el propio Iván, que en el plano abierto
     ocupa de x=400 a x=845. */
  .rotulo{
    position:absolute;right:104px;bottom:420px;padding:24px 34px 26px;
    border-right:6px solid var(--lime);border-radius:16px 0 0 16px;text-align:right;
    background:rgba(6,31,29,.9);backdrop-filter:blur(6px);
    box-shadow:0 24px 64px rgba(0,0,0,.5);
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .rotulo strong{display:block;font-size:46px;font-weight:700;letter-spacing:-.02em}
  .rotulo span{display:block;margin-top:8px;font-size:26px;color:rgba(255,255,255,.78)}

  /* Cierre: ocupa toda la pantalla porque ahí ya no hay nada que mirar
     salvo la acción. */
  .cierre{
    position:absolute;inset:0;display:grid;place-content:center;justify-items:center;
    gap:26px;padding:0 200px;text-align:center;
    background:linear-gradient(0deg,rgba(6,31,29,.94),rgba(6,31,29,.72));
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .cierre .eti{color:var(--lime);font-size:24px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
  .cierre h2{font-family:'Zilla Slab',Georgia,serif;font-weight:700;font-size:92px;line-height:1.02;letter-spacing:-.03em;max-width:1300px}
  .cierre .boton{
    margin-top:12px;padding:26px 56px;border-radius:18px;background:var(--coral);
    font-size:34px;font-weight:700;letter-spacing:.03em;box-shadow:0 22px 56px rgba(239,120,84,.42);
  }
  .cierre small{font-size:26px;color:rgba(255,255,255,.72)}
`;

async function paginaBase(browser, css, w, h) {
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await pg.setContent(`<!doctype html><meta charset="utf-8">
    <style>${FACES}${MARCA}${css}</style><body></body>`, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  return pg;
}

async function subs(nombre) {
  const datos = JSON.parse(fs.readFileSync(path.join(BASE, `subs-${nombre}.json`), 'utf8'));
  const dir = path.join(BASE, '_rot', nombre, 'subs');
  fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await paginaBase(b, SUBS_CSS, 1920, 320);
  await pg.evaluate(() => {
    document.body.innerHTML = '<div id="caja"><div id="txt"></div></div>';
  });
  for (let i = 0; i < datos.length; i++) {
    const s = datos[i];
    const html = s.palabras.map((w, k) => s.resalte[k] ? `<b>${w}</b>` : w).join(' ');
    await pg.evaluate(h => { document.getElementById('txt').innerHTML = h; }, html);
    await pg.screenshot({ path: path.join(dir, `${String(i).padStart(3, '0')}.png`), omitBackground: true });
  }
  await b.close();
  console.log(`${datos.length} subtítulos dibujados en ${dir}`);
}

async function tarjetas(nombre) {
  const spec = JSON.parse(fs.readFileSync(path.join(BASE, `tarjetas-${nombre}.json`), 'utf8'));
  const dir = path.join(BASE, '_rot', nombre, 'tarjetas');
  fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await paginaBase(b, TARJ_CSS, 1920, 1080);
  for (const t of spec) {
    await pg.evaluate(h => { document.body.innerHTML = `<div class="lienzo">${h}</div>`; }, t.html);
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(dir, `${t.id}.png`), omitBackground: true });
  }
  await b.close();
  console.log(`${spec.length} tarjetas dibujadas en ${dir}`);
}

(async () => {
  const [modo, nombre] = process.argv.slice(2);
  if (modo === 'subs') await subs(nombre);
  else if (modo === 'tarjetas') await tarjetas(nombre);
  else { console.error('uso: node rotulos.cjs subs|tarjetas <nombre>'); process.exit(1); }
})();
