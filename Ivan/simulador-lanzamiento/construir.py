#!/usr/bin/env python3
"""Monta ../SimuladorLanzamiento.html, el bloque que se pega en GHL.

    python3 construir.py

Toma plantilla.html (guía de bienvenida + botón flotante) e inserta en el
marcador <!-- SIMULADOR --> el simulador de ../SimuladorFincanciero.html tal
cual, sin tocarlo. Si el simulador cambia, basta con volver a correr esto.

No se edita el archivo generado: se edita la plantilla o el simulador.
"""
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
PLANTILLA = AQUI / "plantilla.html"
SIMULADOR = AQUI.parent / "SimuladorFincanciero.html"
SALIDA = AQUI.parent / "SimuladorLanzamiento.html"
MARCA = "<!-- SIMULADOR -->"

plantilla = PLANTILLA.read_text(encoding="utf-8")
simulador = SIMULADOR.read_text(encoding="utf-8").strip()

if plantilla.count(MARCA) != 1:
    sys.exit(f"La plantilla debe tener exactamente un {MARCA}")

# El simulador busca su raíz con document.currentScript.previousElementSibling:
# su <script> tiene que seguir pegado a su <div class="hlab">. Se comprueba en
# vez de suponerlo, porque si falla la página carga sin un solo número.
if not re.search(r'</div>\s*<script>\s*\(function\(\)\{\s*"use strict";|</div>\s*<script>', simulador):
    sys.exit("El <script> del simulador no va justo detrás de su <div>: revisa SimuladorFincanciero.html")
if simulador.count('class="hlab"') != 1:
    sys.exit("Se esperaba un solo <div class=\"hlab\"> en el simulador")

salida = plantilla.replace(MARCA, simulador)

cabecera = ("<!-- BLOQUE GHL · SimuladorLanzamiento.html · generado con "
            "simulador-lanzamiento/construir.py. No editar a mano.\n"
            "     Pegar completo dentro de un elemento «HTML/Javascript personalizado». -->\n")
SALIDA.write_text(cabecera + salida, encoding="utf-8")

relativas = sorted(set(re.findall(r'(?:src|href)="(?!https?:|#|data:|mailto:)([^"]+)"', salida)))
print(f"✓ {SALIDA.name} · {len(salida) / 1024:.0f} KB")
print("  rutas relativas:", relativas or "ninguna")
