/* Dibuja los rótulos del anuncio como PNG con transparencia.
 *
 * Este ffmpeg viene sin libass ni drawtext (no trae freetype), así que no puede
 * quemar texto por sí solo. Y aunque pudiera, libass no lee woff2: las
 * tipografías de La Huerta están en woff2. Chrome hace de motor tipográfico y
 * ffmpeg solo compone.
 *
 * VERTICAL 1080x1920, para Reels y Stories. Las zonas seguras de Meta no son
 * decorativas: la interfaz tapa los 250 px de arriba (foto de perfil, nombre)
 * y los 420 de abajo (texto del post, botón, iconos). Todo el texto vive entre
 * y=280 y y=1490, y ahí es donde se juega la lectura del anuncio.
 *
 * Uso:
 *   node rotulos.cjs subs anuncio-01
 *   node rotulos.cjs tarjetas anuncio-01
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = '/Users/cristhian/Downloads/Paginas Web/Ivan/ads/sistema';
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
/* Banda de 340 px que se superpone en y=1150, o sea de 1150 a 1490: justo
   encima de donde Instagram pone el texto del post. */

const SUBS_CSS = `
  body{width:1080px;height:340px;overflow:hidden}
  #caja{width:1080px;height:340px;display:flex;align-items:center;justify-content:center;padding:0 70px}
  #txt{
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;
    font-weight:700;font-size:74px;line-height:1.12;letter-spacing:-.018em;
    color:#fff;text-align:center;text-wrap:balance;
    /* En un anuncio el subtítulo compite con el scroll: el trazo va más grueso
       que en el VSL para que se lea a la primera y en pantalla pequeña. */
    paint-order:stroke fill;
    -webkit-text-stroke:13px rgba(4,16,15,.94);
    text-shadow:0 4px 16px rgba(4,16,15,.9), 0 0 50px rgba(4,16,15,.7);
  }
  #txt b{color:var(--lime)}
`;

/* ---------- tarjetas ---------- */

const TARJ_CSS = `
  body{width:1080px;height:1920px;overflow:hidden}
  .lienzo{position:relative;width:1080px;height:1920px}

  /* Gancho de los dos primeros segundos. Es lo que para el scroll, así que va
     arriba y grande, pero por debajo de y=280 para que no lo tape la interfaz. */
  .gancho{
    position:absolute;left:60px;right:60px;top:290px;text-align:center;
    font-family:'Zilla Slab',Georgia,serif;font-weight:700;
    font-size:92px;line-height:1.02;letter-spacing:-.03em;color:#fff;
    text-shadow:0 6px 26px rgba(4,16,15,.85), 0 0 70px rgba(4,16,15,.6);
  }
  .gancho em{display:block;color:var(--lime);font-style:italic}

  /* Ficha de datos del evento. Bloque sólido: se lee en mute y de pasada. */
  .ficha{
    position:absolute;left:70px;right:70px;top:330px;padding:44px 46px;
    border-radius:28px;background:rgba(6,31,29,.94);
    border:1px solid rgba(200,219,82,.36);
    box-shadow:0 30px 90px rgba(0,0,0,.55);
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .ficha .eti{color:var(--lime);font-size:26px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
  .ficha h3{margin-top:14px;font-family:'Zilla Slab',Georgia,serif;font-weight:700;font-size:64px;line-height:1.04;letter-spacing:-.028em}
  .ficha ul{margin-top:26px;list-style:none;display:grid;gap:14px}
  .ficha li{display:flex;gap:14px;align-items:baseline;font-size:36px;line-height:1.3;color:rgba(255,255,255,.93)}
  .ficha li i{color:var(--lime);font-style:normal;font-weight:700}

  /* Pastilla suelta para marcar un concepto sin tapar la cara. */
  .pastilla{
    position:absolute;left:70px;right:70px;top:330px;text-align:center;
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;
  }
  .pastilla span{
    display:inline-block;padding:18px 38px;border-radius:999px;
    background:var(--lime);color:var(--deep);
    font-size:38px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    box-shadow:0 14px 44px rgba(4,16,15,.5);
  }
  .pastilla strong{
    display:block;margin-top:26px;font-family:'Zilla Slab',Georgia,serif;
    font-weight:700;font-size:76px;line-height:1.05;letter-spacing:-.028em;color:#fff;
    text-shadow:0 5px 24px rgba(4,16,15,.85), 0 0 60px rgba(4,16,15,.6);
  }

  /* Cierre a pantalla completa. Idéntico en los diez anuncios: fue lo que mejor
     funcionó en la campaña anterior. */
  .cierre{
    position:absolute;inset:0;display:grid;place-content:center;justify-items:center;
    gap:26px;padding:0 80px;text-align:center;
    background:linear-gradient(0deg,rgba(6,31,29,.96),rgba(6,31,29,.80));
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;color:#fff;
  }
  .cierre .eti{color:var(--lime);font-size:30px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
  .cierre h2{font-family:'Zilla Slab',Georgia,serif;font-weight:700;font-size:104px;line-height:1;letter-spacing:-.03em}
  .cierre .datos{margin-top:8px;font-size:40px;line-height:1.45;color:rgba(255,255,255,.9)}
  .cierre .boton{
    margin-top:22px;padding:30px 54px;border-radius:20px;background:var(--coral);
    font-size:40px;font-weight:800;letter-spacing:.02em;
    box-shadow:0 26px 64px rgba(239,120,84,.45);
  }
  .cierre small{font-size:30px;color:rgba(255,255,255,.7)}

  /* Tapa para el clip del móvil: la grabación trae la barra del navegador y
     los iconos del sistema, que en un anuncio se leen como un descuido. */
  .tapa-movil{
    position:absolute;left:0;right:0;top:0;height:150px;
    background:linear-gradient(180deg,rgba(6,31,29,1) 62%,rgba(6,31,29,0));
  }
  .tapa-movil span{
    position:absolute;left:0;right:0;top:44px;text-align:center;
    font-family:'Source Sans 3',-apple-system,Helvetica,Arial,sans-serif;
    font-size:34px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--lime);
  }

  /* ---------- cierre para contenido orgánico ----------
     En un Reel orgánico no hay enlace en el que hacer clic: el único camino
     hacia el registro es el comentario. Así que el botón coral deja de decir
     «reservar» y pasa a ser la palabra que hay que escribir, que es la acción
     literal que se le pide al espectador.

     La flecha va DENTRO del cuadro, no pegada al borde inferior: Instagram
     tapa los 420 px de abajo, así que una flecha a y=1600 apuntando al icono
     de comentarios queda debajo de la interfaz y no la ve nadie. */
  /* Centrada en lo que se ve, no en el cuadro. Instagram tapa los 420 px de
     abajo, así que el área visible va de 250 a 1500 y su centro está en 875,
     no en 960. El padding inferior sube el bloque esos 85 px. */
  .cierre.org{
    gap:20px;padding-bottom:170px;
    /* El .80 de abajo del cierre original funcionaba sobre un plano de Iván,
       que es oscuro y sin texto. Sobre la grabación de la landing deja leer
       «RESERVAR MI LUGAR GRATIS» por debajo de la cartela. Con .94 el fondo
       sigue notándose en movimiento y el texto de la página ya no compite. */
    background:linear-gradient(0deg,rgba(6,31,29,.975),rgba(6,31,29,.94));
  }
  .cierre.org .datos{margin-top:4px;font-size:36px;line-height:1.4}
  .cierre .pide{margin-top:26px;display:grid;justify-items:center;gap:14px}
  .cierre .pide-eti{
    font-size:32px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;
    color:rgba(255,255,255,.82);
  }
  .cierre .palabra{
    padding:26px 58px;border-radius:22px;background:var(--coral);color:#fff;
    font-size:88px;font-weight:800;line-height:1;letter-spacing:.06em;
    box-shadow:0 26px 64px rgba(239,120,84,.45);
  }
  .cierre .flecha{display:block;line-height:0}
  .cierre .flecha svg{display:block}
  .cierre .pie{
    font-size:34px;line-height:1.3;color:rgba(255,255,255,.86);max-width:760px;
  }
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
  const pg = await paginaBase(b, SUBS_CSS, 1080, 340);
  await pg.evaluate(() => { document.body.innerHTML = '<div id="caja"><div id="txt"></div></div>'; });
  for (let i = 0; i < datos.length; i++) {
    const s = datos[i];
    const html = s.palabras.map((w, k) => s.resalte[k] ? `<b>${w}</b>` : w).join(' ');
    await pg.evaluate(h => { document.getElementById('txt').innerHTML = h; }, html);
    await pg.screenshot({ path: path.join(dir, `${String(i).padStart(3, '0')}.png`), omitBackground: true });
  }
  await b.close();
  console.log(`${datos.length} subtítulos dibujados`);
}

async function tarjetas(nombre) {
  const spec = JSON.parse(fs.readFileSync(path.join(BASE, `tarjetas-${nombre}.json`), 'utf8'));
  const dir = path.join(BASE, '_rot', nombre, 'tarjetas');
  fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await paginaBase(b, TARJ_CSS, 1080, 1920);
  for (const t of spec) {
    await pg.evaluate(h => { document.body.innerHTML = `<div class="lienzo">${h}</div>`; }, t.html);
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(dir, `${t.id}.png`), omitBackground: true });
  }
  await b.close();
  console.log(`${spec.length} tarjetas dibujadas`);
}

(async () => {
  const [modo, nombre] = process.argv.slice(2);
  if (modo === 'subs') await subs(nombre);
  else if (modo === 'tarjetas') await tarjetas(nombre);
  else { console.error('uso: node rotulos.cjs subs|tarjetas <nombre>'); process.exit(1); }
})();
