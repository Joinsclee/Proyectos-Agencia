#!/usr/bin/env python3
"""Convierte los datos de una propuesta (propuestas/<slug>.json) en una página web.

    python3 construir.py adidas-colombia
    python3 construir.py --todas

Las cifras NO se escriben a mano en ninguna parte: los subtotales y el total salen
de sumar las filas. En cotizaciones de cincuenta millones, una suma a mano es una
factura mal hecha.

Las fotos son fijas y viven en el CDN (fotos-cdn.txt). Eso es a propósito: elegir y
subir fotos era lo que hacía que preparar una propuesta costara una tarde.
"""
import json, sys, re, unicodedata
from pathlib import Path

AQUI = Path(__file__).parent
CFG = json.loads((AQUI / 'config.json').read_text('utf-8')) if (AQUI / 'config.json').exists() else {}
HOTEL = json.loads((AQUI / 'hotel.json').read_text('utf-8'))
FOTOS = dict(l.split('|', 1) for l in (AQUI / 'fotos-cdn.txt').read_text('utf-8').split('\n') if '|' in l)


def foto(nombre, por_defecto='aerea-hotel-y-lago-calima'):
    return FOTOS.get(nombre) or FOTOS.get(por_defecto, '')


def pesos(n):
    """1428000 → $1.428.000 — punto de miles, como se escribe en Colombia."""
    return '$' + f'{int(round(n)):,}'.replace(',', '.')


def esc(t):
    return (str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))


def marcar(t):
    """Resalta OPCIONAL en el programa sin tener que meter HTML en los datos."""
    return esc(t).replace('OPCIONAL', '<b class="opc">opcional</b>')


# ── Cuentas ───────────────────────────────────────────────────────────────────
def calcular(p):
    pax = p['pax']
    aloj = p['alojamiento']
    noches = aloj.get('noches', 2)
    for f in aloj['filas']:
        f['total'] = f['hab'] * f['tarifa'] * noches
    aloj['hab_total'] = sum(f['hab'] for f in aloj['filas'])
    aloj['pax_total'] = sum(f['pax'] for f in aloj['filas'])
    aloj['total'] = sum(f['total'] for f in aloj['filas'])

    ali = p['alimentacion']
    for f in ali['filas']:
        f['cantidad'] = f['veces'] * pax
        f['total'] = f['cantidad'] * f['valor']
    ali['total'] = sum(f['total'] for f in ali['filas'])

    esp = p['espacio']
    esp['total'] = sum(f['valor'] for f in esp['filas'])

    tra = p['transporte']
    tra['total'] = sum(f['valor'] for f in tra['filas'])

    exp = p['experiencias']
    for e in exp['items']:
        e['total'] = e['valor'] * pax
    exp['total'] = sum(e['total'] for e in exp['items'])

    base = aloj['total'] + ali['total'] + esp['total'] + tra['total']
    p['_t'] = {
        'base': base, 'experiencias': exp['total'], 'con_todo': base + exp['total'],
        'pp_base': base / pax, 'pp_todo': (base + exp['total']) / pax,
    }
    # aviso si los datos no cuadran entre sí
    if aloj['pax_total'] != pax:
        print(f"  ! ojo: las habitaciones suman {aloj['pax_total']} personas y la propuesta dice {pax}")
    if aloj['hab_total'] != aloj['filas'][0].get('_hab_esperadas', aloj['hab_total']):
        pass
    return p


# ── Secciones ─────────────────────────────────────────────────────────────────
def cabecera(n, eyebrow, titulo):
    return (f'<div class="sec-cab"><span class="sec-num">{n}</span>'
            f'<div><p class="eyebrow">{esc(eyebrow)}</p><h2>{esc(titulo)}</h2></div></div>')


def sec_datos(p):
    f = [('Cliente', p['cliente']),
         ('Contacto', f"{esc(p['contacto']['nombre'])}<br><span class=\"tenue\">{esc(p['contacto']['email'])}</span>"),
         ('Evento', p['evento']), ('Fechas', p['fechas_corto']),
         ('Participantes', p['pax_detalle']), ('Modalidad', p['modalidad']),
         ('Responsable', f"{esc(HOTEL['responsable']['nombre'])} · <span class=\"tenue\">{esc(HOTEL['responsable']['email'])}</span>")]
    filas = ''.join(f'<tr><th>{esc(k)}</th><td>{v if "<" in str(v) else esc(v)}</td></tr>' for k, v in f)
    intro = ''.join(f'<p>{esc(t)}</p>' for t in p['intro'])
    return f'''<section id="datos" class="sec" data-sec="Datos generales" data-n="1">
  <figure class="banda"><img src="{foto('piscina-y-habitaciones')}" alt="Piscina y bloque de habitaciones de La Huerta Hotel" loading="lazy">
    <figcaption>Piscina y bloque de habitaciones</figcaption></figure>
  <div class="cols">
    <div><p class="saludo">{esc(p['saludo'])}</p>{intro}
      <blockquote>{esc(p['destacado_intro'])}</blockquote>
      <p class="firma-min"><b>{esc(HOTEL['responsable']['nombre'])}</b><br><span class="tenue">{esc(HOTEL['responsable']['cargo'])}</span></p></div>
    <div>{cabecera('01', 'El evento', 'Datos generales')}
      <table class="ficha"><tbody>{filas}</tbody></table>
      <p class="pie-nota">{esc(p['nota_fechas'])}</p></div>
  </div></section>'''


def sec_lugar(p):
    cifras = ''.join(f'<div><b>{esc(c["dato"])}</b><span>{esc(c["pie"])}</span></div>' for c in HOTEL['cifras'])
    g = HOTEL['galeria']
    pies = ' · '.join(f'<b>{esc(x["pie"].split(" ")[0])}</b> {esc(" ".join(x["pie"].split(" ")[1:]))}' for x in g)
    return f'''<section id="lugar" class="sec" data-sec="Sobre el hotel" data-n="2">
  {cabecera('02', 'El lugar', 'Sobre ' + HOTEL['nombre'])}
  <div class="cols"><p class="destacar">{esc(HOTEL['descripcion'])}</p><p>{esc(HOTEL['descripcion2'])}</p></div>
  <div class="cifras">{cifras}</div>
  <div class="galeria">
    <figure class="g1"><img src="{foto(g[0]['foto'])}" alt="{esc(g[0]['pie'])}" loading="lazy"></figure>
    <figure class="g2"><img src="{foto(g[1]['foto'])}" alt="{esc(g[1]['pie'])}" loading="lazy"></figure>
    <figure class="g3"><img src="{foto(g[2]['foto'])}" alt="{esc(g[2]['pie'])}" loading="lazy"></figure>
  </div><p class="pie-foto">{pies}</p></section>'''


def sec_alojamiento(p):
    a = p['alojamiento']
    filas = ''.join(
        f'<tr><td><b>{esc(f["tipo"])}</b>{f"<br><span class=\'tenue\'>{esc(f["detalle"])}</span>" if f.get("detalle") else ""}</td>'
        f'<td class="n">{f["hab"]}</td><td class="n">{f["pax"]}</td>'
        f'<td class="n">{pesos(f["tarifa"])}</td><td class="n">{pesos(f["total"])}</td></tr>' for f in a['filas'])
    return f'''<section id="alojamiento" class="sec" data-sec="Alojamiento" data-n="3">
  <figure class="banda"><img src="{foto('habitacion-king')}" alt="Habitación King de La Huerta Hotel" loading="lazy">
    <figcaption>Habitación King</figcaption></figure>
  {cabecera('03', 'Descanso', f'Alojamiento · {a["noches"]} noches')}
  <div class="cols-2-1"><div>
    <table class="datos"><thead><tr><th>Tipo de habitación</th><th class="n">Hab.</th><th class="n">Pax</th><th class="n">Tarifa / noche</th><th class="n">Total</th></tr></thead>
    <tbody>{filas}</tbody>
    <tfoot><tr><th>Total alojamiento</th><th class="n">{a['hab_total']}</th><th class="n">{a['pax_total']}</th><th></th><th class="n">{pesos(a['total'])}</th></tr></tfoot></table>
    <p class="pie-nota">{esc(a['nota'])}</p></div>
    <figure class="lateral"><img src="{foto('habitacion-triple')}" alt="Habitación triple" loading="lazy">
      <figcaption><b>Habitación triple</b>, la ocupación de la mayoría del grupo. Amplia, con escritorio y wifi.</figcaption></figure>
  </div></section>'''


def sec_alimentacion(p):
    a, d = p['alimentacion'], p['destacado_comida']
    filas = ''.join(
        f'<tr><td>{esc(f["servicio"])}{" <span class=\'chip\'>nuevo</span>" if f.get("nuevo") else ""}</td>'
        f'<td class="tenue">{esc(f["dias"])}</td><td class="n">{f["veces"]} × {p["pax"]}</td>'
        f'<td class="n">{pesos(f["valor"])}</td><td class="n">{pesos(f["total"])}</td></tr>' for f in a['filas'])
    platos = ''.join(f'<figure><img src="{foto(x["foto"])}" alt="{esc(x["pie"])}" loading="lazy"></figure>' for x in HOTEL['platos'])
    nom_platos = ' · '.join(f'<b>{esc(x["pie"])}</b>' for x in HOTEL['platos'])
    return f'''<section id="alimentacion" class="sec" data-sec="Alimentación" data-n="4">
  {cabecera('04', 'De la huerta a la mesa', f'Alimentación · {p["pax"]} personas')}
  <div class="destacado">
    <figure><img src="{foto('cena-siete-tiempos')}" alt="{esc(d['titulo'])}" loading="lazy"></figure>
    <div><p class="eyebrow lima">{esc(d['cuando'])}</p><h3>{esc(d['titulo'])}</h3><p>{esc(d['texto'])}</p>
      <div class="tiempos">{'<i></i>' * 7}</div>
      <p class="precio">{pesos(d['precio'])} <span>por persona · {p['pax']} pax · {pesos(d['precio'] * p['pax'])}</span></p></div>
  </div>
  <table class="datos"><thead><tr><th>Servicio</th><th>Días</th><th class="n">Cantidad</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead>
  <tbody>{filas}</tbody>
  <tfoot><tr><th colspan="4">Subtotal alimentación</th><th class="n">{pesos(a['total'])}</th></tr></tfoot></table>
  <p class="pie-nota">{esc(a['nota'])}</p>
  <div class="platos">{platos}</div><p class="pie-foto">Platos de nuestra carta farm-to-table: {nom_platos}</p></section>'''


def sec_espacio(p):
    e = p['espacio']
    filas = ''.join(f'<tr><td><b>{esc(f["espacio"])}</b>{f"<br><span class=\'tenue\'>{esc(f["detalle"])}</span>" if f.get("detalle") else ""}</td>'
                    f'<td class="tenue">{esc(f["alcance"])}</td><td class="n">{pesos(f["valor"])}</td></tr>' for f in e['filas'])
    vin = ''.join(f'<li>{esc(v)}</li>' for v in e['vinetas'])
    return f'''<section id="espacio" class="sec" data-sec="Espacio de trabajo" data-n="5">
  <figure class="banda"><img src="{foto('maloca-montaje-auditorio')}" alt="Maloca en montaje tipo auditorio" loading="lazy">
    <figcaption>Maloca en montaje tipo auditorio con vista al valle</figcaption></figure>
  {cabecera('05', 'Para trabajar', 'Espacio de trabajo')}
  <div class="cols-2-1"><div><p class="destacar">{esc(e['texto'])}</p>
    <table class="datos"><thead><tr><th>Espacio</th><th>Alcance</th><th class="n">Valor</th></tr></thead>
    <tbody>{filas}</tbody><tfoot><tr><th colspan="2">Total espacio de trabajo</th><th class="n">{pesos(e['total'])}</th></tr></tfoot></table>
    <ul class="marcas">{vin}</ul></div>
    <figure class="lateral"><img src="{foto('maloca-exterior-jardines')}" alt="La maloca desde los jardines" loading="lazy">
      <figcaption>La maloca, rodeada de jardines y con vista a las montañas.</figcaption></figure></div></section>'''


def sec_experiencias(p):
    x = p['experiencias']
    tarjetas = ''.join(f'''<article class="exp">
      <figure><img src="{foto(e['foto'])}" alt="{esc(e['titulo'])}" loading="lazy"></figure>
      <div><p class="eyebrow terra">{esc(e['etiqueta'])}</p><h3>{esc(e['titulo'])}</h3><p>{esc(e['texto'])}</p>
      <p class="precio-exp">{pesos(e['valor'])} <span>pp · {pesos(e['total'])}</span></p></div></article>''' for e in x['items'])
    return f'''<section id="experiencias" class="sec" data-sec="Experiencias" data-n="6">
  {cabecera('06', 'Opcionales · a elección del equipo', 'Experiencias de integración')}
  <p class="destacar">{esc(x['texto'])}</p>
  <div class="exps">{tarjetas}</div>
  <div class="galeria-2">
    <figure><img src="{foto('guadual-y-bosque')}" alt="Guadual y bosque del recorrido" loading="lazy"></figure>
    <figure><img src="{foto('restaurante-80-comensales')}" alt="Restaurante para 80 comensales" loading="lazy"></figure>
  </div>
  <p class="pie-foto"><b>Guadual y bosque</b> del recorrido · <b>Restaurante</b> para 80 comensales<br>
    Total de las tres experiencias para {p['pax']} personas: <b>{pesos(x['total'])}</b></p></section>'''


def sec_programa(p):
    dias = ''
    for d in p['programa']:
        hitos = ''.join(f'<li class="{"hito" if h.get("hito") else ""}"><span>{esc(h["hora"])}</span><p>{marcar(h["texto"])}</p></li>' for h in d['hitos'])
        dias += f'<div class="dia"><p class="dia-cab"><b>{esc(d["dia"])}</b> {esc(d["nombre"])}</p><h3>{esc(d["titulo"])}</h3><ul class="linea">{hitos}</ul></div>'
    t = p['transporte']
    filas = ''.join(f'<tr><td><b>{esc(f["cuando"])}</b> · {esc(f["trayecto"])}</td><td class="n">{pesos(f["valor"])}</td></tr>' for f in t['filas'])
    return f'''<section id="programa" class="sec" data-sec="Programa" data-n="7">
  {cabecera('07', 'Tres días en La Huerta', 'Programa sugerido')}
  <div class="dias">{dias}</div>
  <div class="cols-2-1 abajo">
    <figure class="lateral grande"><img src="{foto('hotel-al-atardecer')}" alt="El hotel al caer la tarde" loading="lazy">
      <figcaption>El hotel al caer la tarde, con la zona húmeda y el bloque de habitaciones</figcaption></figure>
    <div class="caja-crema"><p class="eyebrow terra">Traslados</p><h3>Transporte</h3>
      <p>Con nuestro aliado <b>{esc(t['aliado'])}</b>: {esc(t['texto'])}</p>
      <table class="datos compacta"><tbody>{filas}</tbody>
      <tfoot><tr><th>{len(t['filas'])} traslados</th><th class="n">{pesos(t['total'])}</th></tr></tfoot></table></div>
  </div><p class="pie-foto">Programa ajustable según agenda de trabajo del equipo</p></section>'''


def sec_resumen(p):
    t, a, ali, e, tr, x = p['_t'], p['alojamiento'], p['alimentacion'], p['espacio'], p['transporte'], p['experiencias']
    base = [('Alojamiento', f"{a['hab_total']} habitaciones · {a['noches']} noches", a['total']),
            ('Alimentación', f"{sum(f['veces'] for f in ali['filas'] if 'lmuerzo' in f['servicio'])} almuerzos, "
                             f"{sum(f['veces'] for f in ali['filas'] if 'efrigerio' in f['servicio'])} refrigerios y cena de siete tiempos", ali['total']),
            ('Maloca', 'Uso exclusivo, incl. IVA', e['total']),
            ('Transporte', f"{len(tr['filas'])} traslados · 2 buses por trayecto", tr['total'])]
    fb = ''.join(f'<tr><td><b>{esc(k)}</b><br><span class="tenue">{esc(d)}</span></td><td class="n">{pesos(v)}</td></tr>' for k, d, v in base)
    fx = ''.join(f'<tr><td><b>{esc(i["titulo"])}</b><br><span class="tenue">{p["pax"]} pax</span></td><td class="n">{pesos(i["total"])}</td></tr>' for i in x['items'])
    cond = ''.join(f'<li>{esc(c)}</li>' for c in p['condiciones'])
    return f'''<section id="resumen" class="sec" data-sec="Resumen de inversión" data-n="8">
  {cabecera('08', 'Consolidado', 'Resumen de inversión')}
  <div class="cols">
    <div><table class="datos"><thead><tr><th>Servicios base</th><th class="n">Valor</th></tr></thead>
      <tbody>{fb}</tbody><tfoot><tr><th>Subtotal base</th><th class="n">{pesos(t['base'])}</th></tr></tfoot></table></div>
    <div><table class="datos"><thead><tr><th>Experiencias opcionales</th><th class="n">Valor</th></tr></thead>
      <tbody>{fx}</tbody><tfoot><tr><th>Subtotal experiencias</th><th class="n">{pesos(t['experiencias'])}</th></tr></tfoot></table></div>
  </div>
  <div class="totales">
    <div class="tot crema"><p class="eyebrow terra">Servicios base</p><b>{pesos(t['base'])}</b>
      <span>Aprox. {pesos(round(t['pp_base'] / 1000) * 1000)} por persona, transporte incluido</span></div>
    <div class="tot verde"><p class="eyebrow lima">Con las tres experiencias</p><b>{pesos(t['con_todo'])}</b>
      <span>Aprox. {pesos(round(t['pp_todo'] / 1000) * 1000)} por persona: dos noches, alimentación, espacio de trabajo, transporte y actividades</span></div>
  </div>
  <div class="cols-2-1 abajo" id="condiciones" data-sec="Condiciones" data-n="9">
    <div>{cabecera('09', 'Letra pequeña', 'Condiciones y notas')}<ul class="marcas">{cond}</ul></div>
    <figure class="lateral"><img src="{foto('mindfulness-junto-a-piscina')}" alt="Sesión de mindfulness junto a la piscina" loading="lazy">
      <figcaption>Sesión de mindfulness junto a la piscina.</figcaption></figure>
  </div></section>'''


def pie(p):
    r = HOTEL['responsable']
    return f'''<footer class="pie">
  <div class="cols"><div><p class="firma"><b>{esc(r['nombre'])}</b><br>{esc(r['cargo'])}<br>
      <span class="tenue">{esc(HOTEL['razon_social'])} · NIT {esc(HOTEL['nit'])} · RNT {esc(HOTEL['rnt'])}</span><br>
      <a href="mailto:{esc(r['email'])}">{esc(r['email'])}</a> · <a href="https://{esc(HOTEL['web'])}" target="_blank" rel="noopener">{esc(HOTEL['web'])}</a></p></div>
    <div><p class="tenue">{esc(HOTEL['direccion'])}</p>
      <p><a class="btn" href="mailto:{esc(r['email'])}?subject={esc('Propuesta ' + p['cliente'] + ' · La Huerta Hotel')}">Responder a esta propuesta</a></p></div>
  </div></footer>'''


# ── Página ────────────────────────────────────────────────────────────────────
def construir(p):
    calcular(p)
    sup = CFG.get('supabase', {})
    seguimiento = ''
    if sup.get('url') and sup.get('anon'):
        seguimiento = f'''<script>
/* Seguimiento de la propuesta. Solo INSERTA (la clave anon viaja en esta página y la
   tiene el cliente; leer exige sesión, ver la migración). Si falla, la página sigue
   funcionando: nunca se interpone entre el cliente y la propuesta. */
(function () {{
  var URL_ = {json.dumps(sup['url'])} + '/rest/v1/propuesta_vistas';
  var KEY  = {json.dumps(sup['anon'])};
  var SLUG = {json.dumps(p['slug'])};
  var TOKEN = new URLSearchParams(location.search).get('t');
  var t0 = Date.now(), maxN = 0, maxSec = '', enviado = false;

  function seg() {{ return Math.round((Date.now() - t0) / 1000); }}
  function manda(evento, extra) {{
    var cuerpo = Object.assign({{ slug: SLUG, token: TOKEN, evento: evento, segundos: seg() }}, extra || {{}});
    try {{
      var txt = JSON.stringify(cuerpo);
      if (evento === 'cierre' && navigator.sendBeacon) {{
        navigator.sendBeacon(URL_ + '?apikey=' + encodeURIComponent(KEY), new Blob([txt], {{ type: 'application/json' }}));
        return;
      }}
      fetch(URL_, {{ method: 'POST', keepalive: true,
        headers: {{ 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'return=minimal' }},
        body: txt }}).catch(function () {{}});
    }} catch (e) {{}}
  }}

  manda('abrir', {{ ua: navigator.userAgent.slice(0, 250), pantalla: innerWidth + 'x' + innerHeight }});

  var obs = new IntersectionObserver(function (es) {{
    es.forEach(function (e) {{
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.n || 0;
      if (n > maxN) {{ maxN = n; maxSec = e.target.dataset.sec || ''; }}
    }});
  }}, {{ threshold: 0.4 }});
  document.querySelectorAll('[data-sec]').forEach(function (s) {{ obs.observe(s); }});

  function cerrar() {{
    if (enviado) return; enviado = true;
    manda('cierre', {{ seccion: maxSec, seccion_n: maxN }});
  }}
  addEventListener('visibilitychange', function () {{ if (document.visibilityState === 'hidden') cerrar(); }});
  addEventListener('pagehide', cerrar);
  setTimeout(function () {{ if (!enviado) manda('avance', {{ seccion: maxSec, seccion_n: maxN }}); }}, 60000);
}})();
</script>'''

    return f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(p['titulo'])} · {esc(p['cliente'])} · {esc(HOTEL['nombre'])}</title>
<meta name="description" content="{esc(p['entradilla'])}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="{esc(p['titulo'])} · {esc(p['cliente'])}">
<meta property="og:description" content="{esc(p['entradilla'])}">
<meta property="og:image" content="{foto('aerea-hotel-y-lago-calima')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700;800&display=swap">
<style>{CSS}</style>
<script>
/* Si imprimen la propuesta a PDF sin haber bajado del todo, las imágenes con
   loading="lazy" salen como huecos en blanco. Al pedir imprimir se fuerzan todas. */
addEventListener('beforeprint', function () {{
  document.querySelectorAll('img[loading="lazy"]').forEach(function (i) {{ i.loading = 'eager'; }});
}});
</script>
</head>
<body>
<header class="portada" data-sec="Portada" data-n="0">
  <img class="portada-fondo" src="{foto('aerea-hotel-y-lago-calima')}" alt="Vista aérea de La Huerta Hotel entre la Reserva de Yotoco y el Lago Calima" fetchpriority="high">
  <div class="portada-capa"></div>
  <div class="portada-txt">
    <div class="portada-top">
      <div><p class="marca">{esc(HOTEL['nombre'])}</p><p class="marca-lema">{esc(HOTEL['lema'])}</p></div>
      <div class="ta-der"><p class="eyebrow">Propuesta para</p><p class="para">{esc(p['cliente'])}</p></div>
    </div>
    <div class="portada-abajo">
      <p class="eyebrow lima"><i></i> Propuesta de servicios · primera aproximación</p>
      <h1>{esc(p['titulo'])}<br><em>{esc(p['subtitulo'])}</em></h1>
      <p class="entradilla">{esc(p['entradilla'])}</p>
      <dl class="meta">
        <div><dt>Fechas</dt><dd>{esc(p['fechas'])}</dd></div>
        <div><dt>Participantes</dt><dd>{esc(str(p['pax']))} personas<br>{esc(p['pax_detalle'].split('(')[-1].rstrip(')')) if '(' in p['pax_detalle'] else ''}</dd></div>
        <div><dt>Modalidad</dt><dd>{esc(p['modalidad'])}</dd></div>
        <div><dt>Preparada para</dt><dd>{esc(p['contacto']['nombre'])}</dd></div>
      </dl>
      <p class="portada-pie"><span>{esc(HOTEL['razon_social'])} · NIT {esc(HOTEL['nit'])} · RNT {esc(HOTEL['rnt'])}</span><span>{esc(p['fecha_documento'])}</span></p>
    </div>
  </div>
</header>
<main>
{sec_datos(p)}
{sec_lugar(p)}
{sec_alojamiento(p)}
{sec_alimentacion(p)}
{sec_espacio(p)}
{sec_experiencias(p)}
{sec_programa(p)}
{sec_resumen(p)}
</main>
{pie(p)}
{seguimiento}
</body></html>'''


CSS = r'''
:root{
  --verde:#1c3a2b; --verde-2:#16301f; --lima:#a9c346; --terra:#b8603c;
  --crema:#f4efe3; --crema-borde:#ddd5c4; --beige:#ddd5c4;
  --tinta:#3f4a43; --tenue:#6c7871; --linea:#e4e2da; --fondo:#fff;
  /* versiones oscurecidas: la lima da 1,98:1 sobre blanco y la terracota 4,4:1,
     así que el texto pequeño sobre fondo claro usa estas, no las de marca */
  --terra-txt:#9c4a28; --oliva-txt:#4a6b22;
  --ancho:1120px;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fondo);color:var(--verde);
  font:17px/1.65 Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%;height:auto}
h1,h2,h3{margin:0;font-family:Lora,Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-.015em;text-wrap:balance}
p{margin:0 0 1em}
a{color:inherit}
.n{text-align:right;font-variant-numeric:tabular-nums}
.tenue{color:var(--tenue)}
.ta-der{text-align:right}
.eyebrow{margin:0 0 10px;color:var(--oliva-txt);font-size:11px;font-weight:700;letter-spacing:.18em;line-height:1.5;text-transform:uppercase}
.eyebrow.lima{color:var(--lima)}
.eyebrow.terra{color:var(--terra-txt)}
.eyebrow i{display:inline-block;width:26px;height:2px;margin-right:8px;vertical-align:middle;background:var(--lima)}

/* ── Portada ─────────────────────────────────────────────── */
.portada{position:relative;min-height:min(980px,105vh);display:flex;color:#fff;overflow:hidden}
.portada-fondo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.portada-capa{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(18,42,30,.62) 0%,rgba(18,42,30,.28) 38%,rgba(18,42,30,.86) 78%,rgba(18,42,30,.96) 100%)}
.portada-txt{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:60px;
  width:min(var(--ancho),calc(100% - 64px));margin:auto;padding:44px 0 46px}
.portada-top{display:flex;align-items:flex-start;justify-content:space-between;gap:28px}
.marca{margin:0;font-family:Lora,Georgia,serif;font-size:27px;font-weight:600;letter-spacing:-.01em}
.marca-lema{margin:5px 0 0;color:rgba(255,255,255,.78);font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase}
.portada-top .eyebrow{color:rgba(255,255,255,.78);margin-bottom:5px}
.para{margin:0;font-family:Lora,Georgia,serif;font-size:21px;font-weight:600}
h1{font-size:clamp(40px,6.4vw,74px);line-height:1.04}
h1 em{color:var(--lima);font-style:italic;font-weight:500}
.entradilla{max-width:46ch;margin:22px 0 0;color:rgba(255,255,255,.9);font-size:clamp(17px,1.6vw,19px)}
.meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:38px 0 0;padding-top:22px;border-top:1px solid rgba(255,255,255,.28)}
.meta div{padding-right:22px}
.meta dt{color:var(--lima);font-size:10px;font-weight:700;letter-spacing:.17em;text-transform:uppercase}
.meta dd{margin:8px 0 0;color:#fff;font-size:14.5px;line-height:1.5}
.portada-pie{display:flex;justify-content:space-between;gap:20px;margin:34px 0 0;padding-top:16px;
  border-top:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.62);font-size:11.5px}

/* ── Secciones ───────────────────────────────────────────── */
main{display:block}
.sec{width:min(var(--ancho),calc(100% - 64px));margin:0 auto;padding:86px 0 0}
.sec-cab{display:flex;align-items:flex-start;gap:20px;margin-bottom:32px}
.sec-num{font-family:Lora,Georgia,serif;font-size:54px;font-weight:600;line-height:.85;color:var(--beige)}
h2{font-size:clamp(29px,3.4vw,44px);line-height:1.1}
h3{font-size:clamp(20px,2vw,25px);line-height:1.22}
.cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:46px;align-items:start}
.cols-2-1{display:grid;grid-template-columns:1.55fr 1fr;gap:38px;align-items:start}
.cols-2-1.abajo{margin-top:44px}
.destacar{font-family:Lora,Georgia,serif;font-size:19.5px;line-height:1.55}
.saludo{font-family:Lora,Georgia,serif;font-size:21px;line-height:1.45}
blockquote{margin:24px 0;padding:4px 0 4px 20px;border-left:3px solid var(--terra);
  font-family:Lora,Georgia,serif;font-style:italic;font-size:17.5px;line-height:1.55;color:var(--tinta)}
.firma-min{margin-top:26px;font-size:14.5px;line-height:1.5}
.pie-nota{margin:14px 0 0;color:var(--tenue);font-size:13px;line-height:1.6}
.pie-foto{margin:14px 0 0;color:var(--tenue);font-size:13px;line-height:1.6}

/* Imágenes */
.banda{margin:0 0 40px;border-radius:3px;overflow:hidden}
.banda img{width:100%;aspect-ratio:16/6.2;object-fit:cover}
.banda figcaption{margin-top:9px;color:var(--tenue);font-size:12.5px}
.lateral{margin:0}
.lateral img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:3px}
.lateral.grande img{aspect-ratio:16/11}
.lateral figcaption{margin-top:10px;color:var(--tenue);font-size:13px;line-height:1.55}
.galeria{display:grid;grid-template-columns:1.12fr 1fr;grid-template-rows:auto auto;gap:14px;margin-top:34px}
.galeria figure{margin:0;border-radius:3px;overflow:hidden}
.galeria .g1{grid-row:span 2}
.galeria .g1 img{width:100%;height:100%;min-height:340px;object-fit:cover}
.galeria .g2 img,.galeria .g3 img{width:100%;aspect-ratio:16/10;object-fit:cover}
.galeria-2{display:grid;grid-template-columns:1fr 1.75fr;gap:14px;margin-top:30px}
.galeria-2 figure{margin:0;border-radius:3px;overflow:hidden}
.galeria-2 img{width:100%;aspect-ratio:16/10;object-fit:cover}
.platos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:30px}
.platos figure{margin:0;border-radius:3px;overflow:hidden}
.platos img{width:100%;aspect-ratio:1/1;object-fit:cover}

/* Cifras */
.cifras{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin-top:34px;
  border-radius:4px;background:var(--verde);color:#fff;overflow:hidden}
.cifras div{padding:26px 22px;text-align:center}
.cifras div+div{border-left:1px solid rgba(255,255,255,.14)}
.cifras b{display:block;font-family:Lora,Georgia,serif;font-size:31px;font-weight:600;line-height:1.1}
.cifras span{display:block;margin-top:7px;color:rgba(255,255,255,.72);font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;line-height:1.45}

/* Tablas */
table{width:100%;border-collapse:collapse;font-size:15px}
.ficha th{width:34%;padding:13px 16px 13px 0;border-bottom:1px solid var(--linea);color:var(--tenue);
  font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:left;vertical-align:top}
.ficha td{padding:13px 0;border-bottom:1px solid var(--linea);vertical-align:top}
.datos thead th{padding:0 14px 11px 0;border-bottom:1px solid var(--verde);color:var(--verde);
  font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:left}
.datos thead th.n{text-align:right;padding-right:0}
.datos td{padding:14px 14px 14px 0;border-bottom:1px solid var(--linea);vertical-align:top}
.datos td.n{padding-right:0}
.datos tfoot th{padding:15px 14px;background:var(--verde);color:#fff;font-size:14.5px;font-weight:700;text-align:left}
.datos tfoot th.n{text-align:right}
.datos tfoot th:first-child{border-radius:3px 0 0 3px}
.datos tfoot th:last-child{border-radius:0 3px 3px 0}
.datos.compacta td,.datos.compacta th{padding:9px 10px;font-size:14px}
.chip{display:inline-block;margin-left:7px;padding:2px 7px;border-radius:3px;background:var(--crema);
  color:var(--terra-txt);font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;vertical-align:1px}

/* Destacado de la cena */
.destacado{display:grid;grid-template-columns:1fr 1.25fr;gap:0;margin-bottom:34px;border-radius:4px;overflow:hidden}
.destacado figure{margin:0}
.destacado figure img{width:100%;height:100%;min-height:290px;object-fit:cover}
.destacado>div{padding:34px 34px 30px;background:var(--verde);color:#fff}
.destacado h3{margin-bottom:12px;color:#fff}
.destacado p{color:rgba(255,255,255,.85);font-size:15.5px}
.tiempos{display:flex;gap:7px;margin:20px 0}
.tiempos i{flex:1;height:4px;border-radius:2px;background:var(--lima);opacity:.9}
.precio{margin:0;font-family:Lora,Georgia,serif;font-size:30px;font-weight:600;color:#fff}
.precio span{font-family:Inter,sans-serif;font-size:13px;font-weight:500;color:rgba(255,255,255,.7)}

/* Experiencias */
.exps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:26px}
.exp{display:flex;flex-direction:column;border:1px solid var(--crema-borde);border-radius:4px;background:var(--crema);overflow:hidden}
.exp figure{margin:0}
.exp figure img{width:100%;aspect-ratio:16/10;object-fit:cover}
.exp>div{display:flex;flex-direction:column;flex:1;padding:22px 22px 20px}
.exp h3{margin-bottom:10px;font-size:21px}
.exp p{color:var(--tinta);font-size:14.5px;line-height:1.55}
.precio-exp{margin:auto 0 0;padding-top:15px;border-top:1px solid var(--crema-borde);
  font-family:Lora,Georgia,serif;font-size:23px;font-weight:600}
.precio-exp span{float:right;padding-top:9px;font-family:Inter,sans-serif;font-size:12.5px;font-weight:500;color:var(--tenue)}

/* Programa */
.dias{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px}
.dia-cab{margin:0 0 4px;padding-top:14px;border-top:2px solid var(--verde);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tenue)}
.dia-cab b{font-family:Lora,Georgia,serif;font-size:30px;font-weight:600;letter-spacing:-.02em;color:var(--verde);vertical-align:-3px;margin-right:6px;text-transform:none}
.dia h3{margin:8px 0 18px;font-size:19px}
.linea{margin:0;padding:0;list-style:none;border-left:1px solid var(--linea)}
.linea li{position:relative;padding:0 0 17px 20px}
.linea li::before{content:'';position:absolute;left:-5px;top:6px;width:9px;height:9px;border-radius:50%;
  background:#fff;border:1.5px solid var(--crema-borde)}
.linea li.hito::before{background:var(--terra);border-color:var(--terra)}
.linea span{display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tenue)}
.linea p{margin:4px 0 0;font-size:14.5px;line-height:1.5}
.opc{color:var(--terra-txt);font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.caja-crema{padding:26px 26px 22px;border-radius:4px;background:var(--crema)}
.caja-crema h3{margin-bottom:12px}
.caja-crema p{font-size:14.5px}

/* Totales */
.totales{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:30px}
.tot{padding:28px 28px 26px;border-radius:4px}
.tot.crema{background:var(--crema);border:1px solid var(--crema-borde)}
.tot.verde{background:var(--verde);color:#fff}
.tot b{display:block;margin:4px 0 10px;font-family:Lora,Georgia,serif;font-size:clamp(32px,4vw,44px);font-weight:600;letter-spacing:-.03em}
.tot span{display:block;font-size:13.5px;line-height:1.55;color:var(--tenue)}
.tot.verde span{color:rgba(255,255,255,.75)}

/* Listas con marca */
.marcas{margin:0;padding:0;list-style:none}
.marcas li{position:relative;padding:0 0 13px 24px;font-size:15px;line-height:1.6}
.marcas li::before{content:'';position:absolute;left:0;top:8px;width:8px;height:8px;
  background:var(--lima);transform:rotate(45deg)}

/* Pie */
.pie{width:min(var(--ancho),calc(100% - 64px));margin:86px auto 0;padding:34px 0 60px;border-top:1px solid var(--linea)}
.firma{font-size:15px;line-height:1.7}
.firma b{font-family:Lora,Georgia,serif;font-size:21px;font-weight:600}
.pie a{color:var(--verde);text-decoration:underline;text-underline-offset:3px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;margin-top:8px;padding:14px 26px;
  border-radius:4px;background:var(--verde);color:#fff!important;font-size:15px;font-weight:700;
  text-decoration:none!important;transition:background-color .2s ease}
.btn:hover{background:var(--verde-2)}
a:focus-visible{outline:3px solid var(--terra);outline-offset:3px}

/* Móvil */
@media(max-width:900px){
  .cols,.cols-2-1,.dias,.totales,.destacado,.galeria-2{grid-template-columns:1fr;gap:26px}
  .exps{grid-template-columns:1fr}
  .cifras{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cifras div:nth-child(3),.cifras div:nth-child(4){border-top:1px solid rgba(255,255,255,.14)}
  .cifras div:nth-child(3){border-left:0}
  .meta{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:20px}
  .galeria{grid-template-columns:1fr}
  .galeria .g1{grid-row:auto}
  .galeria .g1 img{min-height:0;aspect-ratio:16/10}
  .destacado figure img{min-height:0;aspect-ratio:16/10}
  .sec,.pie{width:calc(100% - 40px)}
  .sec{padding-top:58px}
}
@media(max-width:560px){
  body{font-size:16px}
  .portada-txt{width:calc(100% - 40px);gap:40px;padding:30px 0 34px}
  .portada-top{flex-direction:column;gap:16px}
  .portada-top .ta-der{text-align:left}
  .portada-pie{flex-direction:column;gap:4px}
  .platos{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sec-cab{gap:14px}
  .sec-num{font-size:40px}
  .datos thead{display:none}
  .datos td{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border:0}
  .datos tbody tr{display:block;padding:12px 0;border-bottom:1px solid var(--linea)}
  .datos td.n{text-align:right}
  .datos tfoot tr{display:flex;flex-wrap:wrap;margin-top:12px}
  .datos tfoot th{flex:1;border-radius:0}
  .precio-exp span{float:none;display:block;padding-top:4px}
}

/* Impresión: que salga un PDF decente si lo imprimen */
@media print{
  body{font-size:11pt}
  .portada{min-height:auto;page-break-after:always}
  .sec{padding-top:26px;page-break-inside:avoid;width:100%}
  .banda img{aspect-ratio:16/5}
  .btn{display:none}
  a{text-decoration:none}
}
'''


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        print('Propuestas disponibles:')
        for f in sorted((AQUI / 'propuestas').glob('*.json')):
            print('  ', f.stem)
        return 1
    slugs = [f.stem for f in sorted((AQUI / 'propuestas').glob('*.json'))] if args[0] == '--todas' else args
    (AQUI / 'salida').mkdir(exist_ok=True)
    for s in slugs:
        f = AQUI / 'propuestas' / f'{s}.json'
        if not f.exists():
            print(f'  no existe {f}'); continue
        p = json.loads(f.read_text('utf-8'))
        html = construir(p)
        out = AQUI / 'salida' / f'{s}.html'
        out.write_text(html, 'utf-8')
        t = p['_t']
        print(f"  {s}: {len(html)//1024} KB · base {pesos(t['base'])} · con experiencias {pesos(t['con_todo'])} "
              f"· {pesos(round(t['pp_todo']/1000)*1000)} por persona → {out.relative_to(AQUI)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
