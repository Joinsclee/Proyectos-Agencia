#!/usr/bin/env python3
"""Inyecta agente/conocimiento.md dentro de la edge function chat-huerta.

La base de conocimiento tiene una sola fuente: agente/conocimiento.md.
De ahí sale (a) el texto que se pega en el system prompt de la edge function y
(b) el contenido de las entradas TIERRA_KB de la página. Este script se ocupa
de (a); si editas el .md, córrelo antes de desplegar la función.

Uso:
    python3 agente/sync-kb.py
"""
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
KB_MD = BASE / "agente/conocimiento.md"
FN    = BASE / "supabase/functions/chat-huerta/index.ts"

PLACEHOLDER = "__CONOCIMIENTO_MD__"
MARK_START  = "const KB = `"
MARK_END    = "`;\n\nconst SYSTEM_PROMPT"


def escape_for_template_literal(text: str) -> str:
    """El KB vive dentro de un template literal de TypeScript."""
    return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def main() -> int:
    if not KB_MD.exists():
        print(f"✗ falta {KB_MD.relative_to(BASE)}")
        return 1
    if not FN.exists():
        print(f"✗ falta {FN.relative_to(BASE)}")
        return 1

    kb = escape_for_template_literal(KB_MD.read_text(encoding="utf-8").strip())
    src = FN.read_text(encoding="utf-8")

    if PLACEHOLDER in src:
        new = src.replace(PLACEHOLDER, kb, 1)
    else:
        i = src.find(MARK_START)
        j = src.find(MARK_END)
        if i == -1 or j == -1 or j < i:
            print("✗ no encuentro el bloque `const KB = ...` en la función")
            return 1
        new = src[: i + len(MARK_START)] + kb + src[j:]

    if new == src:
        print("= la función ya está al día")
        return 0

    FN.write_text(new, encoding="utf-8")
    print(f"✓ conocimiento.md ({len(kb)//1024} KB) inyectado en chat-huerta/index.ts")
    print("  Despliega con: supabase functions deploy chat-huerta")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
