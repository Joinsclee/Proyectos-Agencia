#!/bin/bash
# Rehace los 10 cuerpos (montar + rótulos + componer parcheado) y los 10 Reels. No sube ni borra entregas.
SK=~/.claude/skills/montaje-vertical-clee/scripts
NM="/Users/cristhian/Downloads/Paginas Web/Playwright/node_modules"
A="/Users/cristhian/Downloads/Paginas Web/Ivan/ads-venta"
cd "$A"
echo "### b-roll $(date +%H:%M:%S)"
python3 - <<'PY'
import json,subprocess,os
falta=json.load(open('/private/tmp/claude-501/-Users-cristhian-Downloads-Paginas-Web-Ivan/f4e5d64e-d767-475c-8847-89fde3675658/scratchpad/reels/clips-falta.json'))
ext={'VID_20260819_154811488':'.mp4'}
for stem,dur in falta.items():
    f=f'fuentes/broll/{stem}_0.mp4'
    if os.path.exists(f): os.remove(f)
    r=subprocess.run(['python3','herramientas/preparar.py','clip',stem+ext.get(stem,'.MP4'),'0',str(dur)],capture_output=True,text=True)
    print(stem, dur, 'ok' if os.path.exists(f) else 'FALLO '+r.stderr[-200:])
PY
for g in presencial online; do
  if [ $g = presencial ]; then ids="01 02 03 04 05"; else ids="11 12 13 14 15"; fi
  cd "$A/reels-$g/sistema"
  for i in $ids; do n=venta-$i
    echo "### cuerpo $n $(date +%H:%M:%S) · libres $(df -h / | tail -1 | awk '{print $4}')"
    python3 $SK/montar.py edl-$n.json > /dev/null || { echo "FALLÓ montar $n"; continue; }
    NODE_PATH="$NM" PROYECTO_BASE="$PWD" node $SK/rotulos.cjs subs $n > /dev/null || echo "FALLÓ subs $n"
    NODE_PATH="$NM" PROYECTO_BASE="$PWD" node $SK/rotulos.cjs tarjetas $n > /dev/null || echo "FALLÓ tarjetas $n"
    [ -f infografias-$n.json ] && { NODE_PATH="$NM" PROYECTO_BASE="$PWD" node $SK/infografias.cjs $n > /dev/null || echo "FALLÓ infografías $n"; }
    python3 $SK/componer.py $n || echo "FALLÓ componer $n"
    m=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 salida/$n-montado.mp4)
    e=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 entrega/$n.mp4)
    echo "    fotogramas montaje $m · entrega $e"
    rm -rf _tmp/$n salida/$n-montado.mp4
  done
  for i in $ids; do n=venta-$i
    echo "### reel $n $(date +%H:%M:%S)"
    python3 $SK/organico.py $n | grep -E "→ /|⚠ dura" || echo "FALLÓ organico $n"
  done
done
echo "### FIN $(date +%H:%M:%S) · libres $(df -h / | tail -1 | awk '{print $4}')"
