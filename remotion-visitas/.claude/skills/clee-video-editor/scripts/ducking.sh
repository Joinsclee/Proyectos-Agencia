#!/usr/bin/env bash
# ducking.sh MUSIC VOICE OUT — baja la música cuando hay voz (sidechaincompress). La voz se re-suma limpia.
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
MUSIC="${1:?uso: ducking.sh <music> <voice> <out.m4a>}"; VOICE="${2:?}"; OUT="${3:?}"
"$FF" -y -hide_banner -i "$MUSIC" -i "$VOICE" -filter_complex \
"[0:a]aformat=sample_rates=48000:channel_layouts=stereo[m];\
 [1:a]aformat=sample_rates=48000:channel_layouts=stereo[voc];[voc]asplit=2[vk][vout];\
 [m][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[duck];\
 [duck][vout]amix=inputs=2:duration=longest:normalize=0[a]" \
-map "[a]" -c:a aac -b:a 192k "$OUT"
echo "ducking -> $OUT  (aplica loudnorm-2pass DESPUÉS)"
