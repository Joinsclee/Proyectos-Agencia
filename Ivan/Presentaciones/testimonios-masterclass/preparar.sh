#!/bin/zsh
set -e
cd "/Users/cristhian/Downloads/Paginas Web/Ivan/Presentaciones/testimonios-masterclass"
for par in "testimonios_project_Andrtes castrillón.mp4:andres" "testimonios_project_HermisMerchan.mp4:hermis"; do
  src="${par%%:*}"; out="${par##*:}"
  ffmpeg -v error -y -i "$src" -vf "scale=1280:-2" -c:v libx264 -crf 23 -preset veryfast -profile:v high -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k "mc-testimonio-$out.mp4"
  ffmpeg -v error -y -ss 1.5 -i "mc-testimonio-$out.mp4" -frames:v 1 -vf "scale=1280:-2" "mc-poster-$out.jpg"
  ffmpeg -v error -y -i "$src" -ar 16000 -ac 1 "$out.wav"
  whisper-cli -m "/Users/cristhian/Library/Application Support/cleevoice/models/ggml-small.bin" -l es -otxt -of "$out" "$out.wav" >/dev/null 2>&1
  rm -f "$out.wav"
  echo "listo $out"
done
ls -la mc-*.mp4 mc-*.jpg
