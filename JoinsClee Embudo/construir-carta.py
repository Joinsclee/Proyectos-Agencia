#!/usr/bin/env python3
"""
Construye carta-de-presentacion-GHL.html: la página pública de portafolio que va
en joinsclee.com/lintree-page y recibe tráfico de anuncios.

    python3 construir-carta.py

De dónde sale cada cosa
-----------------------
- Las piezas (canales, embudos, sistemas) salen de sala-de-maquinas-fuente.html,
  que sigue siendo el inventario interno. Aquí solo se publica lo que ABRE: nada
  con `path` local y nada marcado `publico:false`.
- La marca sale del sitio real (joinsclee.com, medido el 2026-10-08): tokens
  --jcl-*, Instrument Serif para los títulos y Manrope para el cuerpo.
- El logo y las fotos van embebidos en base64. En un bloque Custom HTML de GHL
  ninguna ruta relativa carga, y un CDN ajeno puede caerse o expirar.

Las cuatro trampas de GHL (ver la nota del Vault) se resuelven igual que en la
versión anterior: Shadow DOM para que el CSS no se escape ni entre, corte
explícito de la herencia en :host, y detección del ancestro con transform para
degradar el sticky en vez de romperlo.

La versión interna con buscador y filtros es otra: sala-de-maquinas-fuente.html.
"""
import base64
import pathlib
import re

AQUI = pathlib.Path(__file__).parent
FUENTE = AQUI / "sala-de-maquinas-fuente.html"
SALIDA = AQUI / "carta-de-presentacion-GHL.html"
MEDIA = AQUI / "medios"  # /tmp se limpia: los medios viven junto al script

AGENDA = "https://link.joinsclee.com/widget/booking/87yMeDwUmzSTIMIytfJY"
SITIO = "https://joinsclee.com"


def b64(ruta: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(ruta.read_bytes()).decode()


def foto(nombre: str) -> str:
    p = MEDIA / "avatares" / f"{nombre}-96.jpg"
    return b64(p, "image/jpeg") if p.exists() else ""


def logo(nombre: str) -> str:
    p = MEDIA / "avatares" / f"{nombre}-96.png"
    return b64(p, "image/png") if p.exists() else ""


def miniatura(nombre: str) -> str:
    """Miniatura del testimonio, embebida. Hotlinkada desde cdn.loom.com no
    siempre carga, y una caja vacia en los testimonios es peor que el peso."""
    p = MEDIA / "testi" / f"{nombre}-min.jpg"
    return b64(p, "image/jpeg") if p.exists() else ""


LOGO = b64(MEDIA / "logo-320.png", "image/png")

# --- piezas del inventario -------------------------------------------------
src = FUENTE.read_text(encoding="utf-8")
bloque = src[src.index("const ITEMS = ["):src.index("\n];", src.index("const ITEMS = ["))]

PIEZAS = []
for b in re.findall(r"\{id:\"[^\"]+\".*?\n(?=\n|  \{id:|  //|$)", bloque, re.S):
    if "url:" not in b or "publico:false" in b:
        continue
    def campo(c, txt=b):
        m = re.search(c + r':"((?:[^"\\]|\\.)*)"', txt)
        return m.group(1).replace('\\"', '"') if m else ""
    PIEZAS.append({
        "id": campo("id"),
        "capas": re.findall(r'"([a-z]+)"', re.search(r"layers:\[([^\]]*)\]", b).group(1)),
        "nombre": campo("name"),
        "quien": campo("who"),
        "desc": campo("desc"),
        "url": campo("url"),
        "acceso": campo("access"),
        "datos": re.findall(r'\["((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\]', b),
    })

por_id = {p["id"]: p for p in PIEZAS}


def capa(nombre):
    return [p for p in PIEZAS if nombre in p["capas"]]


# --- contenido propio de la página pública ---------------------------------
# El sitio principal no estaba en el inventario: es el primero que hay que ver.
EMBUDOS_PROPIOS = [
    ("Sitio principal", "joinsclee.com", "Dónde explicamos qué hacemos y por dónde se agenda.", SITIO),
    ("Software a medida", "Oferta para empresas", "«Deja de alquilar software. Ten el tuyo propio.»", "https://joinsclee.com/empresas-long-page"),
    ("Automatizar empresas", "Ángulo de automatización", "Automatización de procesos para empresas de servicios.", "https://joinsclee.com/automatizar-empresas-page"),
    ("Funnels y CRM", "go.joinsclee.com", "La puerta de entrada comercial de la agencia.", "https://go.joinsclee.com/"),
]

# Cada red se comprobó una por una el 2026-10-08. Donde no hay cifra es porque
# Instagram devuelve muro de login y vidIQ se quedó sin créditos, o porque el
# canal es nuevo y la cifra restaría en vez de sumar.
CLIENTES = [
    ("Daniel Felipe Medina", "YouTube para vender", foto("daniel"), [
        ("YouTube", "https://www.youtube.com/@danielfelipemedina/videos", "107 K"),
        ("Instagram", "https://www.instagram.com/danielfelipemedina1/", ""),
        ("X", "https://x.com/medinadanielfe", ""),
        ("Skool", "https://www.skool.com/@danielfelipemedina", ""),
        ("Web", "https://danielmedina.net/", ""),
    ]),
    ("Nico CMW", "IA aplicada y agentes", foto("nico"), [
        ("YouTube", "https://www.youtube.com/@nicocmw/videos", "42,2 K"),
        ("Instagram", "https://www.instagram.com/nico.cmw/", "4,5 K"),
        ("LinkedIn", "https://www.linkedin.com/in/nicolascort", ""),
        ("Web", "https://nicolascort.com/", ""),
    ]),
    ("Lina Toro", "SAVIAS · jabonería de autor", foto("lina"), [
        ("YouTube", "https://www.youtube.com/@linatoro_jaboneria/videos", "9,45 K"),
        ("Instagram", "https://www.instagram.com/linatoro_jaboneria/", "17,8 K"),
        ("Skool", "https://www.skool.com/savias-8385", ""),
        ("Web", "https://savias.club/cursos-y-comunidad-page", ""),
    ]),
    ("Andrés Giraldo", "Sistema CRECE · inversión inmobiliaria", foto("andresyt"), [
        ("YouTube", "https://www.youtube.com/@andresgiraldocrece", "12,8 K"),
        ("Web", "https://sistemacrece.com", ""),
        ("Página de ventas", "https://sistemacrece.com/pagina-de-ventas-a", ""),
    ]),
    ("Paulina Valencia", "Barco de Papel · enfoque y hábitos", foto("paulina"), [
        ("Instagram", "https://www.instagram.com/paulinavalc/", ""),
        ("YouTube", "https://www.youtube.com/@Paulinavalc", ""),
        ("Skool", "https://www.skool.com/barco-de-papel-6471", ""),
        ("Web", "https://paulinavalencia.com/barco-550173", ""),
    ]),
    ("Andy Molina", "Ovejas Voladoras", foto("andy"), [
        ("Instagram", "https://www.instagram.com/andymolinab/", ""),
        ("YouTube", "https://www.youtube.com/@andymolinab", ""),
        ("Skool", "https://www.skool.com/ovejas-voladoras", ""),
    ]),
    ("Iván Castrillón", "La Huerta · hotel y laboratorio", logo("huerta"), [
        ("Instagram", "https://www.instagram.com/huertahotel/", ""),
        # sin los utm de su bio: si no, su analitica contaria este trafico como Instagram
        ("Web", "https://lahuertahotel.com.co/", ""),
        ("Skool", "https://www.skool.com/la-huerta-lab", ""),
    ]),
    ("Clínica Isis", "Recepcionista con IA", "", [
        ("Demo", "https://dineroconsciente-digital--agente-voz-ghl-fastapi-app.modal.run/sicurezza", ""),
    ]),
    ("The Betts AI", "Embudo completo", "", []),
]

MARCAS = [
    ("Daniel Felipe Medina", "107 K en YouTube", "https://www.youtube.com/@danielfelipemedina/videos", foto("daniel")),
    ("Nico CMW", "42,2 K en YouTube", "https://www.youtube.com/@nicocmw/videos", foto("nico")),
    ("Lina Toro", "SAVIAS · 9,45 K", "https://www.youtube.com/@linatoro_jaboneria/videos", foto("lina")),
    ("Andrés Giraldo", "Sistema CRECE", "https://sistemacrece.com", ""),
    ("Iván Castrillón", "La Huerta LAB", "https://lahuertalab.com/universo-ivan-page", ""),
    ("Paulina Valencia", "Barco de Papel", "https://paulinavalencia.com/barco-550173", ""),
    ("Clínica Isis", "Recepcionista con IA",
     "https://dineroconsciente-digital--agente-voz-ghl-fastapi-app.modal.run/sicurezza", ""),
    # Sin enlace público todavía: se nombran, no se enlazan a nada inventado.
    ("Andy", "Vuela · La Evolución", "", ""),
    ("The Betts AI", "Embudo completo", "", ""),
]

TESTIMONIOS = [
    ("Andrés", "db966e3e406f48bea9bb14b6dc2c7d44", "andres", "1:16"),
    ("Nico", "4166de74e3644fe49df35ef038f35525", "nico", "1:26"),
    ("Claridad y crecimiento para mi comunidad", "834e4afc86894ef0986bc91a5e4a6f15", "comunidad", "1:30"),
    ("Cristian, lanzamientos y embudos", "ef4f7bc1dbce45ecb10c65d7b8b676f2", "cristian", "0:55"),
]

ICONO_EMBUDO = ('<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
                '<path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" stroke="currentColor" stroke-width="1.5" '
                'stroke-linejoin="round"/></svg>')
ICONO_SISTEMA = ('<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
                 '<rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>'
                 '<path d="M8 20h8M3 9h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')
ICONO_CANAL = ('<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
               '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 5.5 6 3.5-6 3.5v-7Z" stroke="currentColor" '
               'stroke-width="1.5" stroke-linejoin="round"/></svg>')


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def tarjeta_canal(p):
    av = {"yt-daniel": foto("daniel"), "yt-nico": foto("nico"), "yt-lina": foto("lina")}.get(p["id"], "")
    medio = p["quien"].split("·")[0].strip()
    cara = (f'<img class="av" src="{av}" alt="" loading="lazy">' if av
            else f'<span class="av mono-av">{esc(p["nombre"][:1])}</span>')
    datos = "".join(f'<span><b>{esc(v)}</b> {esc(l)}</span>' for v, l in p["datos"][:3])
    return (f'<a class="card canal" href="{esc(p["url"])}" target="_blank" rel="noopener noreferrer" '
            f'aria-label="Abrir {esc(p["nombre"])}, {esc(p["quien"])}, en una pestaña nueva">'
            f'<div class="canal-top">{cara}<div><h3>{esc(p["nombre"])}</h3>'
            f'<span class="who">{esc(medio)}</span></div></div>'
            f'<p>{esc(p["desc"])}</p>'
            f'<div class="datos">{datos}</div><span class="ir">Abrir</span></a>')


def tarjeta_simple(titulo, sub, desc, url, icono, etiqueta=""):
    tag = f'<span class="tag">{esc(etiqueta)}</span>' if etiqueta else ""
    return (f'<a class="card pieza" href="{esc(url)}" target="_blank" rel="noopener noreferrer" '
            f'aria-label="Abrir {esc(titulo)} en una pestaña nueva">'
            f'<span class="ico">{icono}</span>'
            f'<div class="cuerpo"><h3>{esc(titulo)}{tag}</h3>'
            f'<span class="who">{esc(sub)}</span><p>{esc(desc)}</p></div>'
            f'<span class="ir">Abrir</span></a>')


canales = "".join(tarjeta_canal(p) for p in capa("atraccion")
                  if "YouTube" in p["quien"] or p["id"] == "narri4")

embudos = "".join(tarjeta_simple(t, s, d, u, ICONO_EMBUDO, "Nuestro")
                  for t, s, d, u in EMBUDOS_PROPIOS)
embudos += "".join(tarjeta_simple(p["nombre"], p["quien"].split("·")[-1].strip(), p["desc"], p["url"], ICONO_EMBUDO)
                   for p in capa("conversion") if p["id"] not in ("jc-home", "jc-empresas", "jc-automatizar"))

sistemas = "".join(tarjeta_simple(p["nombre"], p["quien"].split("·")[-1].strip(), p["desc"], p["url"],
                                  ICONO_SISTEMA, "Pide login" if p["acceso"] == "login" else "")
                   for p in capa("producto"))

def tarjeta_cliente(nombre, rol, f, redes):
    cara = (f'<img src="{f}" alt="" loading="lazy">' if f
            else f'<span class="mono-av">{esc(nombre[:1])}</span>')
    chips = "".join(
        f'<a class="red" href="{esc(u)}" target="_blank" rel="noopener noreferrer" '
        f'aria-label="{esc(red)} de {esc(nombre)}">{esc(red)}'
        + (f'<b>{esc(dato)}</b>' if dato else "") + '</a>'
        for red, u, dato in redes)
    if not chips:
        chips = '<span class="red sin">Sin perfil público</span>'
    return (f'<div class="cliente">{cara}'
            f'<div class="cliente-txt"><h3>{esc(nombre)}</h3><span class="who">{esc(rol)}</span>'
            f'<div class="redes">{chips}</div></div></div>')


clientes = "".join(tarjeta_cliente(*c) for c in CLIENTES)


def chip_marca(n, q, u, f):
    cara = (f'<img src="{f}" alt="" loading="lazy">' if f
            else f'<span class="mono-av">{esc(n[:1])}</span>')
    cuerpo = f'{cara}<span class="texto"><b>{esc(n)}</b><i>{esc(q)}</i></span>'
    if not u:
        return f'<span class="marca sin-enlace">{cuerpo}</span>'
    return (f'<a class="marca" href="{esc(u)}" target="_blank" rel="noopener noreferrer">'
            f'{cuerpo}</a>')


marcas = "".join(chip_marca(*m) for m in MARCAS)

testimonios = "".join(
    f'<a class="testi" href="https://www.loom.com/share/{sid}" target="_blank" rel="noopener noreferrer" '
    f'data-loom="{sid}" data-nombre="{esc(nombre)}" '
    f'aria-label="Ver el testimonio de {esc(nombre)}, {dur} minutos">'
    f'<span class="thumb"><img src="{miniatura(tid)}" '
    f'alt="" loading="lazy"><span class="play" aria-hidden="true">▶</span></span>'
    f'<span class="titulo">{esc(nombre)}</span><span class="dur">{dur}</span></a>'
    for nombre, sid, tid, dur in TESTIMONIOS)

n_destinos = len({p["url"] for p in PIEZAS} | {u for _, _, _, u in EMBUDOS_PROPIOS})
n_sistemas = len(capa("producto"))
n_embudos = len(EMBUDOS_PROPIOS) + len([p for p in capa("conversion")
                                        if p["id"] not in ("jc-home", "jc-empresas", "jc-automatizar")])

CSS = """
:host{
  /* corta la herencia de GHL: tipografia, alineacion y espaciado del tema */
  all: initial;
  display:block;
  --ink:#0a0d16; --surface:#10141f; --surface-2:#161b29;
  --blue:#1c92d2; --blue-soft:#79c9f2; --bone:#f5f5f2;
  --muted:#9ca3af; --line:rgba(255,255,255,.09); --line-2:rgba(255,255,255,.16);
  --bg:var(--ink); --fg:var(--bone); --card:var(--surface);
  --wrap:1120px;
  --ease-out:cubic-bezier(.23,1,.32,1);
  --ease-in-out:cubic-bezier(.77,0,.175,1);
  font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:16px; line-height:1.6; color:var(--fg); text-align:left;
  -webkit-font-smoothing:antialiased;
}
:host([data-tema="claro"]){
  --bg:#f5f5f2; --fg:#0a0d16; --card:#ffffff; --surface-2:#f0f0ec;
  --muted:#5b6472; --line:rgba(10,13,22,.12); --line-2:rgba(10,13,22,.2);
  --blue:#0f6b99;
}
*{box-sizing:border-box}

/* ---------- movimiento ----------
   data-motion lo pone el JS: si el script no corre, nada queda invisible. */
@keyframes jc-entra{from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:none}}
:host([data-motion="on"]) .hero > *{opacity:0; animation:jc-entra .46s var(--ease-out) forwards}
:host([data-motion="on"]) .hero > *:nth-child(2){animation-delay:.06s}
:host([data-motion="on"]) .hero > *:nth-child(3){animation-delay:.12s}
:host([data-motion="on"]) .hero > *:nth-child(4){animation-delay:.18s}
:host([data-motion="on"]) .hero > *:nth-child(5){animation-delay:.24s}
:host([data-motion="on"]) .revela{
  opacity:0; transform:translateY(14px);
  transition:opacity .42s var(--ease-out), transform .42s var(--ease-out);
  transition-delay:var(--retardo,0ms);
}
:host([data-motion="on"]) .revela.visto{opacity:1; transform:none}
.app{
  background:var(--bg); color:var(--fg); padding-bottom:5.5rem;
  transition:background .2s,color .2s;
  /* GHL mete el bloque en una columna centrada y angosta: sin esto el fondo
     deja franjas a los lados. Truco de solo margenes, que sirve en static,
     relative y sticky por igual. El JS lo afina midiendo. */
  width:100vw; margin-left:calc(50% - 50vw);
}
.wrap{max-width:var(--wrap); margin:0 auto; padding:0 1.25rem}
h1,h2,h3{font-family:"Instrument Serif",Georgia,serif; font-weight:400; margin:0}
p{margin:0}
a{color:inherit; text-decoration:none}

/* ---------- cabecera ---------- */
.top{display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1.4rem 0}
.top img{height:34px; width:auto; display:block}
:host([data-tema="claro"]) .top img{filter:invert(1) hue-rotate(180deg)}
.tema{
  display:inline-flex; align-items:center; gap:.45rem; cursor:pointer;
  font:500 .8rem/1 Manrope,sans-serif; color:var(--fg);
  background:transparent; border:1px solid var(--line-2); border-radius:999px; padding:.5rem .85rem;
}
.tema:hover{border-color:var(--blue)}
.tema:focus-visible{outline:2px solid var(--blue); outline-offset:2px}

/* ---------- hero ---------- */
.hero{padding:2.5rem 0 3rem; position:relative}
.hero .kicker{
  font:600 .72rem/1 Manrope,sans-serif; letter-spacing:.16em; text-transform:uppercase;
  color:var(--blue-soft); display:block; margin-bottom:1rem;
}
:host([data-tema="claro"]) .hero .kicker{color:var(--blue)}
.hero h1{font-size:clamp(2.6rem,6vw,4.6rem); line-height:1.02; letter-spacing:-.01em; max-width:16ch}
.hero h1 em{font-style:italic; color:var(--blue-soft)}
:host([data-tema="claro"]) .hero h1 em{color:var(--blue)}
.hero .lead{margin-top:1.1rem; max-width:52ch; font-size:1.05rem; color:var(--muted)}
.acciones{display:flex; gap:.7rem; flex-wrap:wrap; margin-top:1.8rem}
.btn{
  font:700 .95rem/1 Manrope,sans-serif; border-radius:999px; padding:.95rem 1.6rem;
  display:inline-flex; align-items:center; gap:.5rem; border:1px solid transparent;
}
.btn.primario{background:var(--blue); color:#fff; box-shadow:0 10px 30px -12px rgba(28,146,210,.9)}
.btn.primario:hover{filter:brightness(1.08)}
.btn.secundario{border-color:var(--line-2); color:var(--fg)}
.btn.secundario:hover{border-color:var(--blue)}
.btn:focus-visible{outline:2px solid var(--blue); outline-offset:3px}

.cifras{display:flex; gap:2.4rem; flex-wrap:wrap; margin-top:2.6rem; padding-top:1.6rem; border-top:1px solid var(--line)}
.cifras div{display:flex; flex-direction:column}
.cifras b{font-family:"Instrument Serif",Georgia,serif; font-size:2.1rem; line-height:1; font-variant-numeric:tabular-nums}
.cifras span{font:600 .68rem/1.4 Manrope,sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-top:.45rem}

/* ---------- marcas ---------- */
.marcas{display:flex; gap:.6rem; flex-wrap:wrap; margin-top:2rem}
.marca{
  display:inline-flex; align-items:center; gap:.6rem; padding:.5rem .9rem .5rem .5rem;
  border:1px solid var(--line); border-radius:999px; background:var(--card);
}
.marca:hover{border-color:var(--blue)}
.marca.sin-enlace{opacity:.72}
.marca:focus-visible{outline:2px solid var(--blue); outline-offset:2px}
.marca img,.marca .mono-av{width:34px; height:34px; border-radius:50%; object-fit:cover; flex:none}
.mono-av{
  display:grid; place-items:center; background:var(--surface-2); color:var(--blue-soft);
  font:700 .95rem/1 Manrope,sans-serif; border:1px solid var(--line);
}
:host([data-tema="claro"]) .mono-av{color:var(--blue)}
.marca .texto{display:flex; flex-direction:column; line-height:1.25}
.marca b{font:600 .88rem/1.3 Manrope,sans-serif}
.marca i{font:500 .72rem/1.3 Manrope,sans-serif; font-style:normal; color:var(--muted)}

/* ---------- clientes ---------- */
.clientes{display:grid; gap:.9rem; grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))}
.cliente{
  display:flex; gap:.9rem; align-items:flex-start; min-width:0;
  background:var(--card); border:1px solid var(--line); border-radius:16px; padding:1.1rem 1.15rem;
}
.cliente > img,.cliente > .mono-av{width:52px; height:52px; border-radius:50%; object-fit:cover; flex:none; border:1px solid var(--line-2)}
.cliente-txt{display:flex; flex-direction:column; gap:.3rem; min-width:0}
.cliente h3{font-size:1.1rem; line-height:1.25}
.redes{display:flex; gap:.35rem; flex-wrap:wrap; margin-top:.35rem}
.red{
  /* 24px de alto minimo: es un objetivo tactil (WCAG 2.2) */
  display:inline-flex; align-items:center; gap:.3rem; padding:.42rem .65rem; min-height:26px;
  border:1px solid var(--line-2); border-radius:999px;
  font:600 .72rem/1 Manrope,sans-serif; color:var(--fg-2); white-space:nowrap;
}
.red:hover{border-color:var(--blue); color:var(--fg)}
.red:focus-visible{outline:2px solid var(--blue); outline-offset:2px}
.red b{color:var(--blue-soft); font-weight:700}
:host([data-tema="claro"]) .red b{color:var(--blue)}
.red.sin{opacity:.55; border-style:dashed}

/* ---------- secciones ---------- */
section{padding:3.2rem 0 0}
.sec-head{display:flex; align-items:baseline; gap:.9rem; flex-wrap:wrap; margin-bottom:1.4rem}
.sec-head h2{font-size:clamp(1.7rem,3.4vw,2.4rem); line-height:1.1}
.sec-head p{color:var(--muted); font-size:.95rem; max-width:48ch}
.grid{display:grid; gap:.9rem; grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))}
.card{min-width:0; overflow-wrap:anywhere}
.canal-top > div{min-width:0}

.card{
  background:var(--card); border:1px solid var(--line); border-radius:16px;
  padding:1.2rem 1.25rem; display:flex; flex-direction:column; gap:.6rem;
  position:relative;
  transition:border-color .16s var(--ease-out), transform .16s var(--ease-out), background .16s var(--ease-out);
}
@media (hover:hover) and (pointer:fine){
  .card:hover,.testi:hover{border-color:var(--blue); transform:translateY(-3px)}
  .cliente:hover{border-color:var(--line-hi)}
  /* mismo peso que la regla de revelado: si no, su transform:none gana */
  :host([data-motion="on"]) .card.visto:hover,
  :host([data-motion="on"]) .testi.visto:hover{transform:translateY(-3px)}
}
.card:focus-visible{outline:2px solid var(--blue); outline-offset:3px}
.card h3{font-size:1.18rem; line-height:1.25; display:flex; align-items:center; gap:.5rem; flex-wrap:wrap}
.card p{font:400 .9rem/1.5 Manrope,sans-serif; color:var(--muted)}
.who{font:600 .68rem/1.4 Manrope,sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--muted)}
.ir{
  margin-top:auto; padding-top:.4rem; font:700 .8rem/1 Manrope,sans-serif; color:var(--blue-soft);
  display:inline-flex; align-items:center; gap:.35rem;
}
:host([data-tema="claro"]) .ir{color:var(--blue)}
.ir::after{content:"→"}
.tag{
  font:700 .6rem/1 Manrope,sans-serif; letter-spacing:.08em; text-transform:uppercase;
  color:var(--blue-soft); border:1px solid var(--line-2); border-radius:999px; padding:.25rem .5rem;
}
:host([data-tema="claro"]) .tag{color:var(--blue)}

.canal-top{display:flex; align-items:center; gap:.8rem}
.av{width:52px; height:52px; border-radius:50%; object-fit:cover; flex:none; border:1px solid var(--line-2)}
.canal .datos{display:flex; gap:1.1rem; flex-wrap:wrap}
.canal .datos span{font:500 .72rem/1.3 Manrope,sans-serif; color:var(--muted); display:flex; flex-direction:column}
.canal .datos b{font:700 .95rem/1.2 Manrope,sans-serif; color:var(--fg); font-variant-numeric:tabular-nums}

.pieza{flex-direction:row; align-items:flex-start; gap:.9rem}
.pieza .ico{
  width:42px; height:42px; border-radius:11px; flex:none; display:grid; place-items:center;
  background:var(--surface-2); border:1px solid var(--line); color:var(--blue-soft);
}
:host([data-tema="claro"]) .pieza .ico{color:var(--blue)}
.pieza .ico svg{width:21px; height:21px}
.pieza .cuerpo{display:flex; flex-direction:column; gap:.35rem; min-width:0}
.pieza .ir{position:absolute; right:1.25rem; bottom:1.1rem}
.pieza{padding-bottom:2.6rem}

/* ---------- testimonios ---------- */
.testis{display:grid; gap:.9rem; grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.testi{
  background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden;
  display:flex; flex-direction:column;
  transition:border-color .16s var(--ease-out), transform .16s var(--ease-out);
}
.testi:focus-visible{outline:2px solid var(--blue); outline-offset:3px}
.thumb{position:relative; display:block; aspect-ratio:4/5; background:var(--surface-2); overflow:hidden}
/* en absoluto: si no, la imagen vertical estira la caja y se come el aspect-ratio */
.thumb img{position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center 22%; display:block}
.play{
  position:absolute; inset:auto auto 50% 50%; transform:translate(-50%,50%);
  width:44px; height:44px; border-radius:50%; background:rgba(10,13,22,.72); color:#fff;
  display:grid; place-items:center; font-size:.9rem; backdrop-filter:blur(3px);
}
.testi .titulo{font:600 .92rem/1.35 Manrope,sans-serif; padding:.85rem 1rem .2rem}
.testi .dur{font:600 .7rem/1 Manrope,sans-serif; color:var(--muted); padding:0 1rem 1rem}

/* ---------- cierre ---------- */
.cierre{
  margin-top:3.5rem; background:var(--card); border:1px solid var(--line); border-radius:22px;
  padding:2.6rem 2rem; text-align:center;
}
.cierre h2{font-size:clamp(1.8rem,4vw,2.8rem); line-height:1.1; max-width:20ch; margin:0 auto}
.cierre p{color:var(--muted); margin:.9rem auto 0; max-width:46ch}
.cierre .acciones{justify-content:center}
footer{
  margin-top:2.5rem; padding-top:1.4rem; border-top:1px solid var(--line);
  display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap;
  font:500 .78rem/1.5 Manrope,sans-serif; color:var(--muted);
}

/* ---------- CTA flotante ---------- */
.btn.primario.flotante{
  position:fixed; right:1.5rem; bottom:1.5rem; z-index:2147483000;
  box-shadow:0 14px 40px -10px rgba(0,0,0,.6);
}
:host([data-motion="on"]) .flotante{
  /* visibility, no solo opacity: oculto tiene que salir del tabulador */
  opacity:0; transform:translateY(130%); pointer-events:none; visibility:hidden;
  transition:opacity .22s var(--ease-out), transform .22s var(--ease-out), visibility 0s linear .22s;
}
:host([data-motion="on"]) .flotante.dentro{
  opacity:1; transform:none; pointer-events:auto; visibility:visible; transition-delay:0s;
}
.btn.primario.flotante.estatico{position:sticky; bottom:1rem; right:auto; margin:1rem 1.25rem 0; display:inline-flex}
@media (max-width:640px){
  .flotante{right:.75rem; left:.75rem; bottom:.75rem; justify-content:center}
  .hero{padding:1.6rem 0 2rem}
  .cifras{display:grid; grid-template-columns:repeat(2,1fr); gap:1.2rem 1rem}
  .cifras b{font-size:1.7rem}
  .cifras span{font-size:.62rem}
  .sec-head{gap:.4rem}
  .cierre{padding:2rem 1.2rem}
  .top img{height:28px}
}
@media (prefers-reduced-motion:reduce){
  :host([data-motion="on"]) .hero > *{animation:none; opacity:1}
  :host([data-motion="on"]) .revela{opacity:1; transform:none; transition:none}
  :host([data-motion="on"]) .flotante{opacity:1; transform:none; pointer-events:auto}
  .card:hover,.testi:hover,.cliente:hover{transform:none}
  :host([data-motion="on"]) .card.visto:hover,
  :host([data-motion="on"]) .testi.visto:hover{transform:none}
  *{animation-duration:.01ms!important; transition-duration:.12s!important}
}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
"""

MARKUP = f"""
<div class="app">
  <div class="wrap">
    <header class="top">
      <img src="{LOGO}" alt="JoinsClee">
      <button class="tema" type="button" aria-pressed="false">
        <span class="icono" aria-hidden="true">☀</span><span class="etiqueta">Modo claro</span>
      </button>
    </header>

    <div class="hero">
      <span class="kicker">Portafolio</span>
      <h1>Todo lo que <em>hemos construido</em></h1>
      <p class="lead">Canales que crecen, embudos que convierten y software que opera el negocio
        de nuestros clientes. Están todos en vivo: ábrelos y míralos por dentro.</p>
      <div class="acciones">
        <a class="btn primario" href="{AGENDA}" target="_blank" rel="noopener noreferrer">Agendar una llamada</a>
        <a class="btn secundario" href="{SITIO}" target="_blank" rel="noopener noreferrer">Ver joinsclee.com</a>
      </div>
      <div class="cifras">
        <div><b>{len(CLIENTES)}</b><span>Marcas atendidas</span></div>
        <div><b>+158.000</b><span>Suscriptores que gestionamos</span></div>
        <div><b>+7 M</b><span>Visualizaciones generadas</span></div>
        <div><b>{n_sistemas}</b><span>Sistemas en vivo</span></div>
      </div>
    </div>

    <section>
      <div class="sec-head"><h2>Con quién trabajamos</h2>
        <p>Personas reales. Entra en sus perfiles y míralo tú mismo.</p></div>
      <div class="clientes">{clientes}</div>
    </section>

    <section>
      <div class="sec-head"><h2>Nuestros embudos y los de nuestros clientes</h2>
        <p>Cada uno está publicado y recibiendo tráfico real.</p></div>
      <div class="grid">{embudos}</div>
    </section>

    <section>
      <div class="sec-head"><h2>Canales que hacemos crecer</h2>
        <p>Contenido, empaquetado y publicación. Las cifras son de septiembre de 2026.</p></div>
      <div class="grid">{canales}</div>
    </section>

    <section>
      <div class="sec-head"><h2>Software que opera el negocio</h2>
        <p>Herramientas y sistemas a medida, funcionando todos los días.</p></div>
      <div class="grid">{sistemas}</div>
    </section>

    <section>
      <div class="sec-head"><h2>Te lo cuentan ellos</h2>
        <p>Experiencias de quienes han trabajado con nosotros.</p></div>
      <div class="testis">{testimonios}</div>
    </section>

    <div class="cierre">
      <h2>¿Construimos el tuyo?</h2>
      <p>Media hora por videollamada. Miramos dónde estás, qué te frena y qué se puede
         construir para ti. Si te sale mejor quedarte como estás, te lo decimos.</p>
      <div class="acciones">
        <a class="btn primario" href="{AGENDA}" target="_blank" rel="noopener noreferrer">Agendar una llamada</a>
      </div>
    </div>

    <footer>
      <span>JoinsClee · {n_destinos} enlaces, todos en vivo</span>
      <span>Audiencias verificadas en septiembre de 2026</span>
    </footer>
  </div>
</div>

<a class="btn primario flotante" href="{AGENDA}" target="_blank" rel="noopener noreferrer">
  Conversemos
</a>
"""

JS = """
(function(){
  "use strict";
  // dentro de la IIFE a proposito: `var CSS` en el ambito global pisa window.CSS
  var cssTexto = __CSS__;
  var markupTexto = __MARKUP__;

  // por instancia: si el bloque se pega dos veces, cada copia se monta sola
  var pendientes = document.querySelectorAll("[data-jc-carta]:not([data-jc-montado])");
  for(var i = 0; i < pendientes.length; i++){ monta(pendientes[i]); }

  function monta(host){
  if(!host || host.shadowRoot) return;
  host.setAttribute("data-jc-montado", "1");

  // Las @font-face no cruzan el limite del shadow: la hoja va al head del documento.
  if(!document.getElementById("jc-carta-fuentes")){
    var f = document.createElement("link");
    f.id = "jc-carta-fuentes"; f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(f);
  }

  var R = host.attachShadow({mode:"open"});
  R.innerHTML = ["<style>", cssTexto, "</style>", markupTexto].join("");

  // El movimiento se enciende desde aqui: si este script no corre, no hay nada
  // oculto esperando un revelado que nunca llega.
  var flotante = R.querySelector(".flotante");
  var app = R.querySelector(".app");

  // clientWidth, no innerWidth: innerWidth incluye la barra de scroll y provoca
  // scroll lateral. Se neutraliza el margen ANTES de medir: si no, se mide la
  // posicion ya corregida y el desfase se duplica.
  function sangra(){
    app.style.marginLeft = "0px";
    app.style.width = "auto";
    var izq = app.getBoundingClientRect().left;
    var ancho = document.documentElement.clientWidth;
    app.style.width = ancho + "px";
    app.style.marginLeft = (-izq) + "px";
  }
  sangra();
  window.addEventListener("resize", sangra);
  window.addEventListener("load", sangra);
  var menosMovimiento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  host.setAttribute("data-motion", "on");

  var porRevelar = [];
  var grupos = R.querySelectorAll(".sec-head, .grid, .clientes, .testis, .cierre");
  grupos.forEach(function(g){
    var piezas = (g.classList.contains("sec-head") || g.classList.contains("cierre"))
      ? [g] : Array.prototype.slice.call(g.children);
    piezas.forEach(function(el, i){
      el.classList.add("revela");
      // el retardo se corta a 6 pasos: si no, las ultimas tarjetas llegan tarde
      el.style.setProperty("--retardo", (Math.min(i, 3) * 50) + "ms");
      porRevelar.push(el);
    });
  });

  var ctaHero = R.querySelector(".hero .acciones");
  var pedido = false;

  // Un IntersectionObserver solo avisa de lo que CRUZA la pantalla: si alguien
  // salta al pie (ancla, tecla Fin, scroll restaurado), lo de en medio nunca
  // cruza y se queda invisible para siempre. Esto mira posiciones, no cruces.
  function repasa(){
    pedido = false;
    var limite = window.innerHeight * 0.94;
    for(var i = porRevelar.length - 1; i >= 0; i--){
      if(porRevelar[i].getBoundingClientRect().top < limite){
        porRevelar[i].classList.add("visto");
        porRevelar.splice(i, 1);     // revelado una vez y fuera de la lista
      }
    }
    if(ctaHero){
      flotante.classList.toggle("dentro", ctaHero.getBoundingClientRect().bottom < 0);
    }
  }
  function pide(){
    if(pedido) return;
    pedido = true;
    requestAnimationFrame(repasa);
  }
  // si alguien llega tabulando a una tarjeta todavia sin revelar, se revela ya
  R.addEventListener("focusin", function(e){
    var el = e.target.closest && e.target.closest(".revela:not(.visto)");
    if(el){ el.style.setProperty("--retardo", "0ms"); el.classList.add("visto"); }
  });
  window.addEventListener("scroll", pide, {passive: true});
  window.addEventListener("resize", pide);
  repasa();

  // --- tema claro / oscuro, recordado en el navegador de quien mira
  var boton = R.querySelector(".tema");
  function pinta(tema){
    host.setAttribute("data-tema", tema);
    var claro = tema === "claro";
    boton.setAttribute("aria-pressed", String(claro));
    boton.querySelector(".icono").textContent = claro ? "☾" : "☀";
    boton.querySelector(".etiqueta").textContent = claro ? "Modo oscuro" : "Modo claro";
  }
  var guardado = null;
  try { guardado = localStorage.getItem("jc-carta-tema"); } catch(e){}
  pinta(guardado === "claro" ? "claro" : "oscuro");
  boton.addEventListener("click", function(){
    var nuevo = host.getAttribute("data-tema") === "claro" ? "oscuro" : "claro";
    pinta(nuevo);
    try { localStorage.setItem("jc-carta-tema", nuevo); } catch(e){}
  });

  // --- GHL envuelve el bloque en secciones propias; un ancestro con transform,
  //     filter, perspective o contain rompe position:fixed. Degradar, no romper.
  function ancestroQueEstorba(el){
    // desde el propio host: su seccion de GHL tambien puede llevar transform
    for(var n = el; n && n !== document.documentElement; n = n.parentElement){
      var cs = getComputedStyle(n);
      if(cs.transform !== "none" || cs.perspective !== "none") return true;
      if(cs.filter !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")) return true;
      if(cs.translate && cs.translate !== "none") return true;
      if(cs.rotate && cs.rotate !== "none") return true;
      if(cs.scale && cs.scale !== "none") return true;
      if(/transform|filter|perspective|translate|rotate|scale/.test(cs.willChange || "")) return true;
      if(/paint|layout|strict|content/.test(cs.contain || "")) return true;
      if(/auto|hidden/.test(cs.contentVisibility || "")) return true;
    }
    return false;
  }
  function ajusta(){
    flotante.classList.toggle("estatico", ancestroQueEstorba(host));
  }

  // --- reproductor de testimonios, sin salir de la pagina -------------------
  // Se cuelga de document.body a proposito: dentro de la seccion de GHL, que
  // lleva transform, un position:fixed se ancla a esa caja y no al viewport.
  var capa = null, abridor = null, scrollPrevio = "";

  function estilo(el, css){ el.setAttribute("style", css); return el; }

  function construyeCapa(){
    var c = estilo(document.createElement("div"),
      "all:initial;position:fixed;inset:0;z-index:2147483600;display:flex;" +
      "align-items:center;justify-content:center;padding:4vmin;" +
      "background:rgba(6,8,14,.86);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);" +
      "font-family:Manrope,-apple-system,sans-serif;");
    c.setAttribute("role", "dialog");
    c.setAttribute("aria-modal", "true");

    var caja = estilo(document.createElement("div"),
      "all:initial;position:relative;width:min(94vw,calc(86vh * 9 / 16));aspect-ratio:9/16;max-height:86vh;" +
      "border-radius:18px;overflow:hidden;background:#000;box-shadow:0 30px 80px -20px rgba(0,0,0,.8);");

    var marco = document.createElement("iframe");
    // allow ya cubre fullscreen: declarar tambien allowfullscreen solo avisa en consola
    marco.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    marco.setAttribute("title", "Testimonio");
    estilo(marco, "all:initial;position:absolute;inset:0;width:100%;height:100%;border:0;display:block;");

    var cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.textContent = "\u2715";
    cerrar.setAttribute("aria-label", "Cerrar el testimonio");
    estilo(cerrar,
      "all:initial;position:absolute;top:.6rem;right:.6rem;z-index:2;width:2.4rem;height:2.4rem;border-radius:50%;" +
      "border:1px solid rgba(255,255,255,.3);background:rgba(10,13,22,.72);color:#fff;" +
      "font:600 1.05rem/1 Manrope,sans-serif;cursor:pointer;display:grid;place-items:center;" +
      "outline-offset:3px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);");

    var enlace = document.createElement("a");
    enlace.target = "_blank"; enlace.rel = "noopener noreferrer";
    enlace.textContent = "Abrir en Loom";
    estilo(enlace,
      "all:initial;position:absolute;left:50%;bottom:1.1rem;transform:translateX(-50%);color:rgba(255,255,255,.8);" +
      "font:600 .78rem/1 Manrope,sans-serif;text-decoration:underline;cursor:pointer;");

    caja.appendChild(marco); caja.appendChild(cerrar); c.appendChild(caja); c.appendChild(enlace);
    c.__caja = caja;
    c.addEventListener("click", function(e){ if(e.target === c) cierra(); });
    cerrar.addEventListener("click", cierra);
    // el foco se queda dentro del dialogo: si no, se tabula al fondo sin ver nada
    c.addEventListener("keydown", function(e){
      if(e.key !== "Tab") return;
      var foco = [cerrar, marco, enlace];   // el reproductor tambien es alcanzable
      var activo = (c.getRootNode().activeElement) || document.activeElement;
      var i = foco.indexOf(activo);
      e.preventDefault();
      foco[(i + (e.shiftKey ? foco.length - 1 : 1) + foco.length) % foco.length].focus();
    });
    c.__marco = marco; c.__cerrar = cerrar; c.__enlace = enlace;
    return c;
  }

  var abierto = false, bloqueado = false;

  var salida = null;

  function animaCapa(entrando){
    // La preferencia quita la transicion, nunca las asignaciones: si se salta
    // el opacity:1 el modal queda invisible y aun asi captura clics.
    var reducido = !!(menosMovimiento && menosMovimiento.matches);
    var ms = reducido ? 0 : (entrando ? 220 : 160);
    var curva = "cubic-bezier(.23,1,.32,1)";
    capa.style.transition = reducido ? "none" : "opacity " + ms + "ms " + curva;
    capa.__caja.style.transition = reducido ? "none" : "transform " + ms + "ms " + curva;
    capa.style.opacity = entrando ? "1" : "0";
    // una sola señal: el fondo funde, la caja se mueve. La caja no funde ademas.
    capa.__caja.style.transform = entrando ? "none" : "scale(.96) translateY(8px)";
    return ms;
  }

  function abre(id, nombre, origen){
    if(!capa){ capa = construyeCapa(); }
    clearTimeout(salida);
    capa.setAttribute("aria-label", "Testimonio de " + nombre);
    capa.__marco.setAttribute("title", "Testimonio de " + nombre);
    capa.__marco.src = "https://www.loom.com/embed/" + id + "?autoplay=1";
    capa.__enlace.href = "https://www.loom.com/share/" + id;
    if(!bloqueado){
      // solo al pasar de cerrado a abierto: si no, la segunda apertura guarda
      // "hidden" como valor previo y al cerrar la pagina queda bloqueada
      scrollPrevio = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      abridor = origen || null;
      bloqueado = true;
    }
    abierto = true;
    if(!capa.parentNode){
      capa.style.opacity = "0";
      capa.__caja.style.transform = "scale(.96) translateY(8px)";
      document.body.appendChild(capa);
      void capa.offsetWidth;        // fuerza el reflujo antes de animar
    }
    animaCapa(true);
    capa.__cerrar.focus();
  }

  function cierra(){
    if(!abierto) return;
    abierto = false;
    if(!capa) return;
    capa.__marco.src = "";              // detiene la reproduccion ya
    var ms = animaCapa(false);
    clearTimeout(salida);
    var quien = abridor;
    // el scroll y el foco vuelven cuando la capa ya no esta: si no, el foco
    // queda detras de un dialogo todavia presente
    salida = setTimeout(function(){
      if(capa && capa.parentNode) capa.parentNode.removeChild(capa);
      document.body.style.overflow = scrollPrevio;
      bloqueado = false;
      if(quien && quien.focus) quien.focus({preventScroll: true});
    }, ms);
    abridor = null;
  }

  // Un rastreador que mire document.querySelectorAll("a") no ve nada: los enlaces
  // viven dentro del shadow. Se emite un evento que si sale al documento.
  R.querySelectorAll("a[href]").forEach(function(a){
    a.addEventListener("click", function(){
      var destino = a.getAttribute("href") || "";
      document.dispatchEvent(new CustomEvent("jc-carta-clic", {
        bubbles: true,
        detail: {
          destino: destino,
          etiqueta: (a.textContent || "").trim().slice(0, 60),
          tipo: destino.indexOf("booking") > -1 ? "agendar"
              : (a.className || "").indexOf("testi") > -1 ? "testimonio" : "pieza"
        }
      }));
    });
  });

  R.querySelectorAll(".testi").forEach(function(a){
    a.addEventListener("click", function(e){
      // con cmd, ctrl, shift o boton central, que se abra en Loom como siempre
      if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      abre(a.getAttribute("data-loom"), a.getAttribute("data-nombre") || "cliente", a);
    });
  });

  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && capa && capa.parentNode) cierra();
  });
  ajusta();
  window.addEventListener("load", ajusta);
  window.addEventListener("resize", ajusta);
  setTimeout(ajusta, 900);
  }
})();
"""


def jsstr(t):
    return t.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


salida = f"""<!-- ===================================================================
     CARTA DE PRESENTACIÓN · JoinsClee — bloque Custom HTML para GoHighLevel
     Va en joinsclee.com/lintree-page. Pegar ENTERO en un bloque Custom HTML.

     Es la página pública: recibe tráfico de anuncios, así que lleva marca,
     miniaturas, testimonios y un CTA de agendar siempre visible. La versión
     interna con buscador y filtros es otra (sala-de-maquinas-fuente.html).

     Construida contra las trampas de GHL:
     1. Ninguna ruta relativa carga: el logo y las fotos van embebidos en base64
        y la tipografía se pide a Google con URL absoluta desde document.head.
     2. El CSS de un documento completo arrasa la cabecera y el pie de GHL: aquí
        todo vive en un Shadow DOM. Y como las propiedades heredables SÍ cruzan
        el shadow, :host corta la herencia con all:initial.
     3. Un ancestro con transform rompe position:fixed: se detecta al arrancar y
        el botón flotante pasa a sticky en vez de romperse.

     No editar a mano: se edita construir-carta.py y se vuelve a generar.
     ==================================================================== -->
<div data-jc-carta></div>
<script>
{JS.replace("__CSS__", "`" + jsstr(CSS) + "`").replace("__MARKUP__", "`" + jsstr(MARKUP) + "`")}
</script>
"""

SALIDA.write_text(salida, encoding="utf-8")
print(f"escrito {SALIDA.name}: {len(salida)/1024:.1f} KB")
print(f"  destinos únicos: {n_destinos} | embudos: {n_embudos} | sistemas: {n_sistemas} | canales: {len(capa('atraccion'))}")
print(f"  marcas: {len(MARCAS)} ({sum(1 for m in MARCAS if m[2])} con enlace) | testimonios: {len(TESTIMONIOS)}")
