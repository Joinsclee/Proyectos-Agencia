#!/bin/bash
# process_client_clip.sh
# Pipeline pre-MCP: descarga el clip de Drive vía rclone, extrae audio, transcribe con Whisper.
# Deja todo listo en disco para que la skill llame al MCP capcut-api.
#
# Uso:
#   ./process_client_clip.sh <cliente> <ruta_drive> [whisper_model]
#
# Ejemplo:
#   ./process_client_clip.sh paulina "clientes/paulina/raw_sessions/2026-05-19/hook_v3.mp4" medium

set -e

CLIENTE="$1"
DRIVE_PATH="$2"
WHISPER_MODEL="${3:-medium}"

if [ -z "$CLIENTE" ] || [ -z "$DRIVE_PATH" ]; then
  echo "❌ Uso: ./process_client_clip.sh <cliente> <ruta_drive> [whisper_model]"
  echo ""
  echo "Ejemplo:"
  echo "  ./process_client_clip.sh paulina 'clientes/paulina/raw_sessions/2026-05-19/hook_v3.mp4'"
  exit 1
fi

CLIENT_DIR="$HOME/dev/joinsclee-clients/$CLIENTE/raw"
mkdir -p "$CLIENT_DIR"

FILENAME=$(basename "$DRIVE_PATH")
BASENAME="${FILENAME%.*}"
LOCAL_VIDEO="$CLIENT_DIR/$FILENAME"
LOCAL_AUDIO="$CLIENT_DIR/${BASENAME}.mp3"
LOCAL_SRT="$CLIENT_DIR/${BASENAME}.srt"

echo "📥 1/4 Descargando desde Drive: gdrive:$DRIVE_PATH"
if [ -f "$LOCAL_VIDEO" ]; then
  echo "   ✓ Archivo ya existe localmente, omitiendo descarga"
else
  rclone copy "gdrive:$DRIVE_PATH" "$CLIENT_DIR/" --progress
  if [ ! -f "$LOCAL_VIDEO" ]; then
    echo "❌ La descarga falló — verifica la ruta de Drive"
    exit 1
  fi
fi

echo "🎵 2/4 Extrayendo audio con ffmpeg"
if [ -f "$LOCAL_AUDIO" ]; then
  echo "   ✓ Audio ya existe, omitiendo"
else
  ffmpeg -i "$LOCAL_VIDEO" -vn -acodec mp3 -q:a 2 "$LOCAL_AUDIO" -y -loglevel error
fi

echo "📝 3/4 Transcribiendo con Whisper (model: $WHISPER_MODEL)"
if [ -f "$LOCAL_SRT" ]; then
  echo "   ✓ SRT ya existe, omitiendo"
else
  whisper "$LOCAL_AUDIO" \
    --model "$WHISPER_MODEL" \
    --language Spanish \
    --output_format srt \
    --output_dir "$CLIENT_DIR" \
    --verbose False
fi

echo "🧹 4/4 Limpiando SRT (removiendo líneas vacías)"
TMP_SRT="${LOCAL_SRT}.tmp"
awk '
BEGIN { RS=""; FS="\n" }
{
  # Saltar bloques con timestamps idénticos (silencios)
  if ($2 !~ /^([0-9]{2}:){2}[0-9]{2},[0-9]{3} --> \1[0-9]{2},[0-9]{3}$/) {
    print $0 "\n"
  }
}
' "$LOCAL_SRT" > "$TMP_SRT" 2>/dev/null || cp "$LOCAL_SRT" "$TMP_SRT"
mv "$TMP_SRT" "$LOCAL_SRT"

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LOCAL_VIDEO")
NUM_LINES=$(grep -c '\-\->' "$LOCAL_SRT" || echo 0)

echo ""
echo "✅ Procesamiento completado"
echo ""
echo "📊 Resultado:"
echo "   Cliente:        $CLIENTE"
echo "   Video:          $LOCAL_VIDEO"
echo "   Duración:       ${DURATION}s"
echo "   Audio:          $LOCAL_AUDIO"
echo "   SRT:            $LOCAL_SRT"
echo "   Líneas SRT:     $NUM_LINES"
echo ""
echo "🎬 Listo para alimentar a la skill ads-factory-clee:"
echo "   - video_url:    file://$LOCAL_VIDEO"
echo "   - srt_path:     $LOCAL_SRT"
echo "   - duration:     $DURATION"
