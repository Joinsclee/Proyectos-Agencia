# Setup completo macOS — ads-factory-clee

Instalación end-to-end del stack. Tiempo total estimado: 45-60 min (incluye descarga de Whisper model).

Componentes:
1. Python 3.10+, FFmpeg, Git (base)
2. CapCutAPI (VectCutAPI) + MCP server
3. rclone configurado con Google Drive (para descargar binarios)
4. Whisper local (para transcripción)
5. MCP `capcut-api` registrado en Claude Code

---

## 0. Pre-requisitos del sistema

```bash
# Python 3.10+
python3 --version
brew install python@3.11  # si no tienes

# FFmpeg
brew install ffmpeg

# Git
git --version

# rclone
brew install rclone

# CapCut International (descargar de https://www.capcut.com/ y abrirlo una vez)
ls "$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft/"
# Si no existe, abre CapCut y crea un proyecto vacío
```

---

## 1. Instalar VectCutAPI

```bash
mkdir -p ~/dev/joinsclee-tools
cd ~/dev/joinsclee-tools

git clone https://github.com/sun-guannan/VectCutAPI.git
cd VectCutAPI

python3 -m venv venv-capcut
source venv-capcut/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-mcp.txt

cp config.json.example config.json
```

Editar `config.json` (cambiar `TU_USUARIO`):
```json
{
  "draft_domain": "http://localhost:9001",
  "preview_router": "/preview",
  "is_capcut_env": true,
  "draft_path": "/Users/TU_USUARIO/Movies/CapCut/User Data/Projects/com.lveditor.draft",
  "port": 9001
}
```

Probar HTTP server:
```bash
python capcut_server.py &
sleep 2
curl -X POST http://localhost:9001/create_draft \
  -H "Content-Type: application/json" \
  -d '{"width": 1080, "height": 1920}'
# Debe responder con draft_id
kill %1
```

---

## 2. Instalar Whisper

```bash
# Con el venv activo
pip install openai-whisper

# Descargar el modelo "medium" (1.5GB) — primera vez tarda
whisper --help  # verifica instalación

# Pre-descargar modelo para evitar latencia en primer uso
python -c "import whisper; whisper.load_model('medium')"
```

**Alternativa más rápida pero menos precisa:** modelo `small` (488MB).
**Alternativa más precisa pero más lenta:** modelo `large-v3` (3GB).

Para Ads de cliente, `medium` es el sweet spot. Para clips muy largos (>5min) considerar `small`.

---

## 3. Configurar rclone con Google Drive

```bash
rclone config
```

Flujo interactivo:
1. `n` (new remote)
2. Nombre: `gdrive` (importante — la skill usa este nombre)
3. Storage: elegir el número de `Google Drive`
4. `client_id`: dejar vacío (Enter)
5. `client_secret`: dejar vacío (Enter)
6. `scope`: elegir `1` (full access)
7. `service_account_file`: dejar vacío
8. `Edit advanced config`: `n`
9. `Use auto config`: `y` — se abre el navegador, autorizar con la cuenta de Google de Cristhian
10. `Configure this as a Shared Drive`: `n` (salvo que tus assets vivan en Shared Drive de equipo)
11. Confirmar y salir con `q`

Probar:
```bash
# Listar carpeta raíz de Drive
rclone ls gdrive: --max-depth 1

# Buscar carpeta de un cliente específico
rclone lsd gdrive: | grep -i paulina
```

Si funciona, listo. Si pide reautorización después de unas semanas, repetir `rclone config reconnect gdrive:`.

---

## 4. Registrar MCP en Claude Code

En la carpeta de trabajo del proyecto (ej. `~/dev/joinsclee-clients/`), crear `.claude/settings.json`:

```json
{
  "mcpServers": {
    "capcut-api": {
      "command": "/Users/TU_USUARIO/dev/joinsclee-tools/VectCutAPI/venv-capcut/bin/python",
      "args": [
        "/Users/TU_USUARIO/dev/joinsclee-tools/VectCutAPI/mcp_server.py"
      ],
      "env": {
        "PYTHONPATH": "/Users/TU_USUARIO/dev/joinsclee-tools/VectCutAPI",
        "DEBUG": "0"
      }
    }
  }
}
```

**Importante:** la `command` apunta al Python del venv, no al global.

Reiniciar Claude Code completamente. Verificar que el MCP aparece:
> "Lista las herramientas MCP disponibles del servidor capcut-api"

Esperado: 11 herramientas (`create_draft`, `add_video`, `add_audio`, `add_image`, `add_text`, `add_subtitle`, `add_effect`, `add_sticker`, `add_video_keyframe`, `get_video_duration`, `save_draft`).

---

## 5. Instalar la skill ads-factory-clee

```bash
# Copiar la skill al directorio de skills de Claude Code
cp -R /ruta/a/ads-factory-clee ~/.claude/skills/

# O si está empaquetada como .skill:
unzip ads-factory-clee.skill -d ~/.claude/skills/
```

Verificar:
```bash
ls ~/.claude/skills/ads-factory-clee/
# Debería listar: SKILL.md, references/, scripts/
```

---

## 6. Estructura de carpetas recomendada

```
~/dev/
├── joinsclee-tools/
│   └── VectCutAPI/                    # repo + drafts generados aquí
│       └── dfd_*/                     # cada draft generado
└── joinsclee-clients/
    ├── paulina/
    │   ├── raw/                       # clips descargados de Drive
    │   ├── broll/                     # B-roll del cliente
    │   ├── assets/                    # logo, fuentes, música
    │   └── output/                    # exports finales (manual)
    ├── savias/
    ├── ia-lab/
    └── humanox/
```

Crear de una vez:
```bash
mkdir -p ~/dev/joinsclee-clients/{paulina,savias,ia-lab,humanox,ovejas-voladoras}/{raw,broll,assets,output}
```

---

## 7. Test end-to-end

Con todo instalado, en Claude Code dentro de `~/dev/joinsclee-clients/`:

> "Lista las herramientas MCP disponibles del servidor capcut-api"
> → Debe listar las 11

> "Lista la carpeta de Paulina en Drive"
> → Claude usa MCP Drive y muestra contenido

> "Descarga el primer .mp4 que encuentres en clientes/paulina/raw_sessions/ usando rclone"
> → Debe descargar a `~/dev/joinsclee-clients/paulina/raw/`

> "Crea un draft de prueba: vertical 1080x1920, texto 'Test JoinsClee' del segundo 1 al 5, color blanco. Guárdalo."
> → Claude llama create_draft + add_text + save_draft del MCP
> → Genera carpeta dfd_ en `~/dev/joinsclee-tools/VectCutAPI/`

> "Copia ese draft a CapCut"
> → Claude ejecuta el script copy_to_capcut.sh

Si los 4 pasos pasan, todo está listo para el primer Ad real.

---

## 8. Troubleshooting

**Error: "rclone: command not found"** → `brew install rclone`.

**Error: rclone "couldn't read token"** → `rclone config reconnect gdrive:`.

**Whisper muy lento** → Mac con Apple Silicon usa MPS automáticamente. Verificar con `python -c "import torch; print(torch.backends.mps.is_available())"`. Si False, instalar PyTorch con soporte MPS: `pip install --upgrade torch torchvision torchaudio`.

**MCP capcut-api no aparece tras reiniciar Claude Code** → verificar paths absolutos en `.claude/settings.json`. Probar el path manualmente: `/path/to/venv-capcut/bin/python /path/to/mcp_server.py --help`.

**El draft generado no abre en CapCut** → CapCut debía estar cerrado al copiar. Cerrar, eliminar el draft fallido de `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/`, copiar de nuevo desde `dfd_*`.

**Whisper genera SRT con líneas vacías** → `process_client_clip.sh` incluye limpieza con grep. Si manual, filtrar líneas con timestamps `00:00:00,000 --> 00:00:00,000`.

**Drive search devuelve muchos resultados** → afinar el query con fecha + nombre cliente: `name contains 'hook' and modifiedTime > '2026-05-15'`.

---

## 9. Actualización del stack

```bash
cd ~/dev/joinsclee-tools/VectCutAPI
git pull origin main
source venv-capcut/bin/activate
pip install -r requirements.txt --upgrade
pip install -r requirements-mcp.txt --upgrade
pip install --upgrade openai-whisper

# rclone
brew upgrade rclone
```

Si una actualización rompe algo, rollback:
```bash
git log --oneline | head -10
git checkout <commit-estable>
```
