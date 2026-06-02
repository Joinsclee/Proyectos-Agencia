#!/bin/bash
# copy_to_capcut.sh
# Copia un draft generado por VectCutAPI a la carpeta de drafts de CapCut International en macOS.
#
# Uso:
#   ./copy_to_capcut.sh dfd_xxx
#   ./copy_to_capcut.sh /ruta/absoluta/al/dfd_xxx

set -e

CAPCUT_DRAFTS="$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft"
VECTCUT_DIR="${VECTCUT_DIR:-$HOME/dev/joinsclee-tools/VectCutAPI}"

if [ -z "$1" ]; then
  echo "❌ Falta el nombre del draft"
  echo "Uso: ./copy_to_capcut.sh dfd_xxx"
  exit 1
fi

if [[ "$1" = /* ]]; then
  SRC="$1"
else
  SRC="$VECTCUT_DIR/$1"
fi

if [ ! -d "$SRC" ]; then
  echo "❌ La carpeta $SRC no existe"
  exit 1
fi

if [ ! -d "$CAPCUT_DRAFTS" ]; then
  echo "❌ La carpeta de drafts de CapCut no existe en:"
  echo "   $CAPCUT_DRAFTS"
  echo ""
  echo "Asegúrate de que CapCut International esté instalado y abierto al menos una vez."
  exit 1
fi

if pgrep -x "CapCut" > /dev/null; then
  echo "⚠️  CapCut está abierto. Para que el draft aparezca, debe estar cerrado."
  read -p "¿Cerrar CapCut automáticamente? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    osascript -e 'quit app "CapCut"'
    sleep 2
  else
    echo "Cierra CapCut manualmente y vuelve a ejecutar."
    exit 1
  fi
fi

DRAFT_NAME=$(basename "$SRC")
DEST="$CAPCUT_DRAFTS/$DRAFT_NAME"

if [ -d "$DEST" ]; then
  echo "⚠️  Ya existe un draft con el mismo nombre en CapCut: $DRAFT_NAME"
  read -p "¿Sobrescribir? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$DEST"
  else
    echo "Cancelado."
    exit 0
  fi
fi

echo "📋 Copiando $DRAFT_NAME a CapCut..."
cp -R "$SRC" "$DEST"

echo "✅ Draft copiado exitosamente"
echo ""
echo "📁 Ubicación: $DEST"
echo ""
read -p "¿Abrir CapCut ahora? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  open -a CapCut
fi
