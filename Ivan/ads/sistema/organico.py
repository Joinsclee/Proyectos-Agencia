#!/usr/bin/env python3
"""Convierte un anuncio pagado en pieza de contenido orgánico para Instagram.

El anuncio y el Reel orgánico piden llamadas a la acción incompatibles. El
anuncio manda al enlace: «haz clic, reserva tu lugar». En un Reel orgánico no
hay enlace en el que hacer clic — el único camino al registro es el comentario,
que dispara el privado con el enlace. Así que el final del anuncio no vale y hay
que cambiarlo.

**Se cambia solo el final, y no se toca el original.** Los diez anuncios
aprobados se quedan tal cual en `entrega/`; lo orgánico sale a `entrega-organico/`.

La idea del montaje: **la grabación del móvil recorriendo la landing entra ANTES
de donde entraba en el anuncio**, y la cartela de la palabra aparece encima de
ella mientras Iván todavía está hablando. Así la pieza acaba con la última
palabra del máster y no hay que rellenar nada.

Las dos versiones anteriores fallaron justo ahí, y las dos por lo mismo — poner
la cartela DESPUÉS de la voz obliga a inventarse sonido:

  * la primera congelaba el último fotograma con un empuje del 5 %, y en
    pantalla se leía como si el vídeo se hubiera colgado;
  * la segunda ya dejaba la página corriendo, pero la cartela seguía yendo
    detrás de la voz y sus 3,4 s de ambiente salían de un bucle de 1,2 s: se
    oía repetir tres veces.

Ahora el sonido de la cola son tramos de la propia entrega, en su orden, con
room tone real de la cola de la grabación en las junturas. No hay bucles: lo
único sintético es un respiro de dos décimas donde se quitó la frase del clic.

Uso:
    python3 organico.py anuncio-01

Lee `organico-<nombre>.json`:

    {
      "nombre": "anuncio-01",
      "corte": 46.20,                    # hasta aquí, vídeo de la entrega tal cual
      "voz": [[46.20, 50.32],            # tramos que siguen sonando, ya sobre el móvil
              [52.08, 55.44]],           # (entre medias se cae «haz clic, reserva…»)
      "respiro": 0.20,                   # room tone en la juntura
      "ambiente": [55.44, 56.06],        # de dónde sale ese room tone, o ruta a un wav
      "cola_final": 0.62,                # cuánto respira la pieza tras la última palabra
      "movil": {"src": "../recursos/Movil la huerta.mp4", "in": 5.6,
                "crop": "1080:1920:0:418", "eti": "La página del evento"},
      "palabra": "ORDEN",
      "master": "../brutos/ANUNCIO 1.mp4",
      "datos": {...}
    }

La cartela entra donde arranca el último tramo de voz, salvo que `cartela_en`
diga otra cosa. Sin `movil`, la cola se construye congelando el último fotograma
del cuerpo, reconstruido desde el bruto (ver `congelar`): es el respaldo.
"""
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
# Los filtros de imagen se reutilizan de `montar.py` en vez de copiarse: si el
# grado de color o el recorte de un plano cambian ahí, el fotograma congelado
# de la cola tiene que cambiar con ellos o se ve el salto en el empalme.
from montar import filtro_plano, filtro_clip   # noqa: E402

PW = Path("/Users/cristhian/Downloads/Paginas Web/Playwright")
W, H, FPS = 1080, 1920, 25
ENTRADA = 0.40      # fundido de entrada de la cartela, igual que en componer.py
EMPUJE = 0.05       # acercamiento del fotograma congelado, si no hay móvil
CRUCE = 0.10        # crossfade entre el audio del cuerpo y el de la cola
COLA_FADE = 1.20    # fundido de salida del ambiente al final

ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18",
       "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
       "-g", "25", "-keyint_min", "25", "-sc_threshold", "0",
       # La fuente sale de `componer.py` con maxrate 6M: por encima de 8M no hay
       # información que recuperar y el archivo se dobla para nada.
       "-maxrate", "8M", "-bufsize", "16M",
       "-r", str(FPS), "-an"]


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        sys.stderr.write("\n$ " + " ".join(shlex.quote(str(c)) for c in cmd) + "\n")
        sys.stderr.write((r.stderr or "")[-3000:] + "\n")
        raise SystemExit(f"falló ({r.returncode})")
    return r


def dur(p):
    return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                     "-of", "csv=p=0", str(p)]).stdout.strip())


def fin_de_frases(nombre):
    """Dónde acaba cada frase, según la transcripción palabra a palabra."""
    ruta = BASE / f"../trabajo/{nombre}-palabras.json"
    if not ruta.exists():
        return None
    d = json.loads(ruta.read_text(encoding="utf-8"))
    w = [(x["text"].strip(), x["offsets"]["to"] / 1000)
         for x in d["transcription"] if x["text"].strip()]
    return [0.0] + [b for t, b in w if t.endswith((".", "!", "?"))]


def comprobar_corte(nombre, corte):
    """El corte tiene que caer en final de frase. Avisa, no corrige."""
    fines = fin_de_frases(nombre)
    if fines is None:
        print("  (sin transcripción: no puedo comprobar el corte)")
        return
    d = min(abs(corte - f) for f in fines)
    if d > 0.20:
        cerca = sorted(fines, key=lambda f: abs(corte - f))[:3]
        print(f"  ⚠ el corte en {corte:.2f}s no cae en final de frase "
              f"(el más cercano está a {d:.2f}s). Finales cerca: "
              + ", ".join(f"{f:.2f}" for f in cerca))
    else:
        print(f"  corte en {corte:.2f}s: cae en final de frase (±{d:.2f}s)")


def rotulos(nombre, palabra, datos, eti_movil):
    """Dibuja las dos cartelas de la cola en Chrome, con el motor de siempre.

    Pasan por `rotulos.cjs` a propósito, en vez de dibujarse aparte: así usan las
    mismas woff2 de la marca y los mismos tokens de color, y si mañana cambia la
    tipografía cambia en los dos sitios a la vez.

    La tapa del móvil se redibuja en lugar de reaprovechar la del anuncio porque
    aquella decía «REGÍSTRATE GRATIS», que en el orgánico compite con la única
    instrucción que queremos dar. Aquí solo nombra lo que se está viendo.
    """
    flecha = ('<span class="flecha"><svg width="98" height="76" viewBox="0 0 82 64" '
              'fill="none" xmlns="http://www.w3.org/2000/svg">'
              '<path d="M41 4 V52 M41 58 L14 30 M41 58 L68 30" stroke="#c8db52" '
              'stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>'
              '</svg></span>')
    spec = [
        {"id": "tapa", "t0": 0.0, "t1": 1.0, "desliz": 0,
         "html": f'<div class="tapa-movil"><span>{eti_movil}</span></div>'},
        {"id": "cierre-org", "t0": 0.0, "t1": 1.0, "desliz": 0,
         "html": ('<div class="cierre org">'
                  f'<p class="eti">{datos["eti"]}</p>'
                  f'<h2>{datos["titulo"]}</h2>'
                  f'<p class="datos">{datos["cuando"]}</p>'
                  '<div class="pide">'
                  '<span class="pide-eti">Comenta la palabra</span>'
                  f'<div class="palabra">{palabra}</div>'
                  f'{flecha}'
                  f'<span class="pie">{datos["pie"]}</span>'
                  '</div></div>')},
    ]
    ruta = BASE / f"tarjetas-{nombre}-organico.json"
    ruta.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    sh(["node", str(BASE / "rotulos.cjs"), "tarjetas", f"{nombre}-organico"],
       cwd=PW, env={**os.environ, "NODE_PATH": str(PW / "node_modules")})
    dirp = BASE / "_rot" / f"{nombre}-organico" / "tarjetas"
    for x in ("tapa", "cierre-org"):
        if not (dirp / f"{x}.png").exists():
            raise SystemExit(f"no se dibujó la cartela «{x}»: {dirp}")
    return dirp / "tapa.png", dirp / "cierre-org.png"


def congelar(nombre, corte, master, destino):
    """Fotograma congelado desde el bruto, para las colas sin clip de móvil.

    Congelar el último fotograma de `entrega/` parecía lo obvio y está mal: ese
    fotograma lleva el subtítulo QUEMADO, y como la cartela de cierre es
    translúcida (.96 arriba, .80 abajo) el subtítulo se lee por debajo como un
    fantasma. Así que se reconstruye: se busca en la EDL qué corte está en
    pantalla en ese instante y se rehace con los filtros que usó `montar.py`.
    """
    edl = json.loads((BASE / f"edl-{nombre}.json").read_text(encoding="utf-8"))
    t = corte - 1 / FPS
    c = next((c for c in edl["cortes"] if c["t0"] <= t < c["t1"]), edl["cortes"][-1])
    if "broll" in c:
        b = c["broll"]
        src = (BASE / b["src"]).resolve()
        if not src.exists():
            raise SystemExit(
                f"el último corte de {nombre} es b-roll y su clip no está:\n  {src}\n"
                "  recupéralo (ver «Cómo recuperar el b-roll» en LEEME.md) o mueve\n"
                "  el corte a una frase que acabe sobre un plano.")
        ss = b["in"] + (t - c["t0"]) * b.get("velocidad", 1.0)
        vf = filtro_clip(b.get("crop"), W, H, FPS, b.get("velocidad", 1.0),
                         b.get("enfocar", False), src)
        print(f"  congelando b-roll {src.name} en {ss:.2f}s")
    else:
        src, ss = master, t
        vf = filtro_plano(c, edl["planos"], W, H, FPS)
        print(f"  congelando plano {c['plano']} del bruto en {ss:.2f}s")
    sh(["ffmpeg", "-y", "-v", "error", "-ss", f"{ss:.4f}", "-i", str(src),
        "-map", "0:v:0", "-frames:v", "1", "-vf", vf, str(destino)])
    return destino


def imagen_cola(cfg, nombre, master, corte, largo, t_cartela, tapa, cartela, destino):
    """La imagen de la cola: la página del móvil corriendo, y las cartelas encima."""
    mov = cfg.get("movil")
    if mov:
        src = (BASE / mov["src"]).resolve()
        disponible = dur(src) - mov["in"]
        if disponible < largo:
            raise SystemExit(f"la grabación del móvil da {disponible:.1f}s desde "
                             f"{mov['in']}s y la cola pide {largo:.1f}s")
        print(f"  móvil {src.name} desde {mov['in']}s · {largo:.2f}s de recorrido "
              f"({disponible - largo:.0f}s sin usar)")
        entradas = ["-ss", str(mov["in"]), "-t", f"{largo:.4f}", "-i", str(src),
                    "-loop", "1", "-t", f"{largo:.4f}", "-i", str(tapa)]
        # El mismo recorte del anuncio: quita la barra de estado del teléfono y
        # la del navegador, que en una pieza publicada se leen como un descuido.
        # La página se ve nítida mientras se la enseña y se desenfoca justo
        # cuando entra la cartela. Va con `xfade` en la misma ventana que el
        # fundido de la cartela: cambiar el desenfoque de golpe se ve como un
        # fallo de reproducción, y dejarlo nítido deja el texto de la landing
        # compitiendo con el de la cartela.
        cadena = (f"[0:v]crop={mov['crop']},scale={W}:{H}:"
                  f"force_original_aspect_ratio=increase,crop={W}:{H},"
                  f"setsar=1,fps={FPS},split[nit][des];"
                  f"[nit]trim=0:{t_cartela + ENTRADA:.3f},setpts=PTS-STARTPTS[a];"
                  f"[des]trim={t_cartela:.3f}:{largo:.3f},setpts=PTS-STARTPTS,"
                  f"gblur=sigma=13,eq=brightness=-0.02[b];"
                  f"[a][b]xfade=transition=fade:duration={ENTRADA}:"
                  f"offset={t_cartela:.3f}[bg];"
                  f"[1:v]format=rgba[tapa];[bg][tapa]overlay=0:0[v1];")
        i = 2
    else:
        quieto = congelar(nombre, corte, master, destino.parent / "quieto.png")
        n = max(2, round(largo * FPS))
        S = 6   # la receta anti-temblor de montar.py: z absoluto y 6x la salida
        entradas = ["-loop", "1", "-t", f"{largo:.4f}", "-i", str(quieto)]
        cadena = (f"[0:v]scale={W*S}:{H*S}:force_original_aspect_ratio=increase,"
                  f"crop={W*S}:{H*S},zoompan=z='1+{EMPUJE}*on/{n}':d={n}:"
                  f"x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':fps={FPS}:s={W}x{H},"
                  f"setsar=1[v1];")
        i = 1

    sh(["ffmpeg", "-y", "-v", "error", *entradas,
        "-loop", "1", "-t", f"{largo:.4f}", "-i", str(cartela),
        "-filter_complex",
        cadena +
        f"[{i}:v]format=rgba,fade=t=in:st={t_cartela:.3f}:d={ENTRADA}:alpha=1[c];"
        f"[v1][c]overlay=0:0:format=auto[v]",
        "-map", "[v]", "-t", f"{largo:.4f}", *ENC, str(destino)])
    return destino


def linea_de_tiempo(cfg):
    """Las piezas de la cola en orden, su duración total y cuándo entra la cartela.

    La cartela entra al empezar el ÚLTIMO tramo de voz, no después del último.
    Ahí está la corrección: mientras la cartela se lee, todavía suena el máster,
    así que no hay silencio que tapar con un bucle de ambiente.
    """
    tramos = [tuple(x) for x in cfg["voz"]]
    respiro = float(cfg.get("respiro", 0.20))
    final = float(cfg.get("cola_final", 0.62))
    piezas, t, t_cartela = [], 0.0, 0.0
    for i, (a, b) in enumerate(tramos):
        if i:
            piezas.append(("amb", respiro))
            t += respiro
        if i == len(tramos) - 1:
            t_cartela = t
        piezas.append(("voz", a, b))
        t += b - a
    if final > 0:
        piezas.append(("amb", final))
        t += final
    return piezas, t, float(cfg.get("cartela_en", t_cartela))


def room_tone(cfg, fuente, tmp):
    """El trozo de ambiente que se usa en las junturas y al final.

    Sale de la propia ENTREGA, no del bruto: la entrega ya pasó por loudnorm y
    mezclar los dos deja un escalón de nivel en la juntura. Y sale de un tramo
    REAL de la grabación, no de un bucle — el bucle es lo que se oía repetir.
    """
    amb = cfg["ambiente"]
    destino = tmp / "ambiente.wav"
    if isinstance(amb, str):
        origen = (BASE / amb).resolve()
        if not origen.exists():
            raise SystemExit(f"no encuentro la cama de ambiente: {origen}")
        sh(["ffmpeg", "-y", "-v", "error", "-i", str(origen),
            "-ar", "48000", "-ac", "2", str(destino)])
    else:
        a0, a1 = amb
        sh(["ffmpeg", "-y", "-v", "error", "-ss", str(a0), "-t", f"{a1 - a0:.3f}",
            "-i", str(fuente), "-map", "0:a:0",
            "-ar", "48000", "-ac", "2", str(destino)])
    return destino


def sonido_cola(cfg, fuente, piezas, tmp, destino):
    """Encadena los tramos de la entrega con room tone en las junturas.

    Cada pieza entra y sale con tres centésimas de fundido, que es lo justo para
    que la juntura no chasquee sin que se note un bajón.
    """
    amb = room_tone(cfg, fuente, tmp)
    d_amb = dur(amb)
    pedido = max([p[1] for p in piezas if p[0] == "amb"] or [0])
    if pedido > d_amb + 0.01:
        raise SystemExit(
            f"el ambiente dura {d_amb:.2f}s y la cola pide un tramo de {pedido:.2f}s.\n"
            "  Alárgalo o baja `respiro`/`cola_final`: repetirlo en bucle es\n"
            "  exactamente el defecto que este montaje existe para evitar.")

    entradas, filtros, etiquetas = [], [], []
    for i, p in enumerate(piezas):
        if p[0] == "voz":
            largo = p[2] - p[1]
            entradas += ["-ss", f"{p[1]:.3f}", "-t", f"{largo:.3f}", "-i", str(fuente)]
        else:
            largo = p[1]
            entradas += ["-t", f"{largo:.3f}", "-i", str(amb)]
        filtros.append(f"[{i}:a]afade=t=in:st=0:d=0.03,"
                       f"afade=t=out:st={max(0, largo - 0.03):.3f}:d=0.03,"
                       f"aresample=48000[a{i}]")
        etiquetas.append(f"[a{i}]")
    filtros.append("".join(etiquetas) + f"concat=n={len(piezas)}:v=0:a=1[o]")
    sh(["ffmpeg", "-y", "-v", "error", *entradas,
        "-filter_complex", ";".join(filtros), "-map", "[o]",
        "-ar", "48000", "-ac", "2", str(destino)])
    return destino


def main():
    nombre = sys.argv[1]
    cfg = json.loads((BASE / f"organico-{nombre}.json").read_text(encoding="utf-8"))
    fuente = BASE / "entrega" / f"{nombre}.mp4"
    master = (BASE / cfg["master"]).resolve()
    tmp = BASE / "_tmp" / f"{nombre}-organico"
    tmp.mkdir(parents=True, exist_ok=True)
    salida = BASE / "entrega-organico"
    salida.mkdir(exist_ok=True)

    corte = round(float(cfg["corte"]) * FPS) / FPS
    piezas, largo, t_cartela = linea_de_tiempo(cfg)

    print(f"\n{nombre} → orgánico   (palabra: «{cfg['palabra']}»)")
    print(f"  fuente: {fuente.name}  {dur(fuente):.2f}s")
    comprobar_corte(nombre, float(cfg["corte"]))
    print(f"  cuerpo 0→{corte:.2f}s, y desde ahí la página del móvil:")
    t = corte
    for x in piezas:
        if x[0] == "voz":
            print(f"    {t:6.2f} → {t + x[2] - x[1]:6.2f}   voz del máster {x[1]:.2f}-{x[2]:.2f}")
            t += x[2] - x[1]
        else:
            print(f"    {t:6.2f} → {t + x[1]:6.2f}   ambiente {x[1]:.2f}s")
            t += x[1]
    print(f"  la cartela entra en {corte + t_cartela:.2f} y se queda "
          f"{largo - t_cartela:.2f}s · total {corte + largo:.2f}s")
    # Lo que se lee sin voz por debajo. Si crece, vuelve el problema del bucle.
    mudo = sum(x[1] for x in piezas if x[0] == "amb" and x is piezas[-1])
    print(f"  sin voz al final: {mudo:.2f}s")

    print("· dibujando las cartelas")
    tapa, cartela = rotulos(nombre, cfg["palabra"], cfg["datos"],
                            cfg.get("movil", {}).get("eti", "La página del evento"))

    print("· cuerpo")
    cuerpo = tmp / "cuerpo.mp4"
    sh(["ffmpeg", "-y", "-v", "error", "-i", str(fuente), "-t", f"{corte:.4f}",
        "-vf", f"fps={FPS},setsar=1", *ENC, str(cuerpo)])

    print("· cola")
    colav = imagen_cola(cfg, nombre, master, corte, largo, t_cartela,
                        tapa, cartela, tmp / "cola.mp4")

    lista = tmp / "lista.txt"
    lista.write_text(f"file '{cuerpo}'\nfile '{colav}'\n", encoding="utf-8")
    muda = tmp / "muda.mp4"
    sh(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
        "-i", str(lista), "-c", "copy", str(muda)])

    print("· sonido")
    # Todo el audio sale de la ENTREGA, cuerpo y cola: ya pasó por loudnorm, así
    # que en la juntura no hay escalón de nivel. Y el primer tramo de la cola
    # empieza justo donde acaba el cuerpo, o sea que ese empalme no corta nada.
    cola_a = sonido_cola(cfg, fuente, piezas, tmp, tmp / "cola.wav")
    voz_cuerpo = tmp / "cuerpo.wav"
    sh(["ffmpeg", "-y", "-v", "error", "-i", str(fuente), "-t", f"{corte:.4f}",
        "-map", "0:a:0", "-ar", "48000", "-ac", "2", str(voz_cuerpo)])
    pista = tmp / "pista.wav"
    sh(["ffmpeg", "-y", "-v", "error", "-i", str(voz_cuerpo), "-i", str(cola_a),
        "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[o]",
        "-map", "[o]", "-ar", "48000", "-ac", "2", str(pista)])

    final = salida / f"{nombre}-organico.mp4"
    sh(["ffmpeg", "-y", "-v", "error", "-i", str(muda), "-i", str(pista),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
        "-af", "loudnorm=I=-14:TP=-1.4:LRA=11",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", "-shortest", str(final)])
    sh(["ffmpeg", "-y", "-v", "error", "-ss", "2.4", "-i", str(final),
        "-frames:v", "1", "-vf", "scale=1600:-1", "-q:v", "3",
        str(salida / f"{nombre}-organico-poster.jpg")])

    d = dur(final)
    print(f"\n→ {final}  ({d:.2f}s · {final.stat().st_size / 2**20:.0f} MB)")
    if abs(d - (corte + largo)) > 0.06:
        print(f"  ⚠ dura {d:.2f}s y debería durar {corte + largo:.2f}s")

    # Los intermedios de una conversión pesan unos 150 MB y esta máquina va justa
    # de disco. Se borran solo cuando el MP4 final ya está escrito.
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
