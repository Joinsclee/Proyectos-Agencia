# Brand kits — Clientes JoinsClee activos

Brand kits de los clientes activos. La skill debe leer el bloque del cliente antes de generar el draft. Confirmado por Cristhian que están correctos.

---

## Paulina Valencia / Barco de Origami

**Vertical:** coaching de hábitos / desarrollo personal femenino
**Audiencia:** mujeres 28-45, hispanohablantes, buscan rutinas sostenibles

```yaml
nombre_marca: "Barco de Origami"
tipografias:
  primaria: "Cormorant Garamond Bold"     # títulos en pantalla
  primaria_fallback: "Playfair Display Bold"
  secundaria: "Inter Medium"               # cuerpo
  subtitulos: "Inter Bold"

paleta:
  texto_principal: "#1A1A1A"
  texto_sobre_oscuro: "#FAF7F2"
  acento_1: "#C9966B"   # terracota cálido (CTAs)
  acento_2: "#7A8B6E"   # verde salvia
  background: "#F2EBE0" # beige

logo:
  posicion: "bottom_right"
  posicion_x: -0.40
  posicion_y: 0.40
  opacidad: 0.7
  duracion: "ultimos_5s"
  scale: 0.12

subtitulos_quemados:
  bg_color: "#1A1A1A"
  bg_alpha: 0.80
  padding_h: 16
  padding_v: 8
  radius: 8
  color: "#FAF7F2"
  font_size: 38
  position_y: 0.40

lower_third:
  x: -0.35
  y: 0.25
  font: "Inter Medium"
  font_size: 32
  color: "#C9966B"
  texto_default: "Paulina Valencia  |  Coach de Hábitos"

cta_default: "ÚNETE A LA COMUNIDAD"

sound_design:
  estilo: "piano/cuerdas suaves"
  bpm: "70-90"
  volumen_base: 0.18
  volumen_cta: 0.28

estilo_edicion:
  cuts_min_separacion: 3
  zooms: "muy_sutiles"
  zoom_max: 1.08
  transiciones_permitidas: ["cut"]
  transiciones_prohibidas: ["whip", "glitch", "fade"]
```

---

## SAVIAS / Lina Toro

**Vertical:** jabones artesanales + comunidad de skincare consciente
**Audiencia:** mujeres 25-50, consumo responsable, naturales

```yaml
nombre_marca: "SAVIAS"
tipografias:
  primaria: "Recoleta Bold"
  primaria_fallback: "DM Serif Display"
  secundaria: "Manrope Medium"
  subtitulos: "Manrope Bold"

paleta:
  texto_principal: "#2C3E2D"   # verde bosque oscuro
  texto_sobre_oscuro: "#F5F1E8" # marfil
  acento_1: "#D4A574"   # miel (CTAs)
  acento_2: "#8B6F47"   # madera
  background: "#E8DFD0" # arena

logo:
  posicion: "top_left"
  posicion_x: -0.40
  posicion_y: -0.40
  opacidad: 0.85
  duracion: "primeros_3s_y_ultimos_4s"
  scale: 0.10

subtitulos_quemados:
  bg_color: "#2C3E2D"
  bg_alpha: 0.75
  padding_h: 14
  padding_v: 6
  radius: 4
  color: "#F5F1E8"
  font_size: 36
  position_y: 0.42

lower_third:
  x: -0.35
  y: 0.28
  font: "Manrope Medium"
  font_size: 30
  color: "#D4A574"
  texto_default: "Lina Toro  |  Fundadora SAVIAS"

cta_default: "VEN A LA COMUNIDAD"

sound_design:
  estilo: "folk/acustica suave"
  bpm: "80-100"
  volumen_base: 0.20
  sonidos_diegeticos: true   # agua, espuma en close-ups producto

estilo_edicion:
  cuts_min_separacion: 4
  close_ups_producto_cada: 5
  color_grading: "calido_dorado"
  transiciones_permitidas: ["cut", "cross_dissolve_300ms"]
```

---

## IA LAB 2026 / Nico

**Vertical:** programa de automatización con IA
**Audiencia:** emprendedores 25-45, tech-friendly

```yaml
nombre_marca: "IA LAB 2026"
tipografias:
  primaria: "Space Grotesk Bold"
  primaria_fallback: "Inter Bold"
  secundaria: "JetBrains Mono Medium"
  subtitulos: "Space Grotesk Bold"

paleta:
  texto_principal: "#0A0A0F"
  texto_sobre_oscuro: "#FFFFFF"
  acento_1: "#00F0A8"   # verde neón (CTAs/keywords)
  acento_2: "#A78BFA"   # violeta tech
  background_dark: "#0F0F1A"
  background_light: "#F5F5F7"

logo:
  posicion: "top_right"
  posicion_x: 0.40
  posicion_y: -0.40
  opacidad: 1.0
  duracion: "primer_1s_y_ultimos_4s"
  scale: 0.14

subtitulos_quemados:
  bg_color: "#0A0A0F"
  bg_alpha: 0.90
  padding_h: 18
  padding_v: 10
  radius: 0     # estilo terminal
  color: "#FFFFFF"
  color_keywords: "#00F0A8"
  font_size: 42
  position_y: 0.30   # mas arriba, deja espacio para CTAs visuales

lower_third:
  x: -0.35
  y: 0.20
  font: "JetBrains Mono Medium"
  font_size: 28
  color: "#00F0A8"
  texto_default: "Nico  |  Fundador IA LAB"

cta_default: "ENTRA A IA LAB 2026"

sound_design:
  estilo: "synthwave/techno suave"
  bpm: "100-120"
  volumen_base: 0.22
  sound_fx_max: 3

estilo_edicion:
  cuts_min_separacion: 1.5
  zooms: "frecuentes"
  texto_en_pantalla_siempre_animado: true
  glitch_permitido: 1
  color_grading: "frio_cyan"
  transiciones_permitidas: ["cut", "glitch_max_1"]
```

---

## HUMANOX / Dr. Ariel Llamas

**Vertical:** Fe cristiana + finanzas personales
**Audiencia:** cristianos hispanohablantes 30-55, profesionales, padres

```yaml
nombre_marca: "HUMANOX"
tipografias:
  primaria: "Cinzel Bold"
  primaria_fallback: "Playfair Display Bold"
  secundaria: "Lato Medium"
  subtitulos: "Lato Bold"

paleta:
  texto_principal: "#1A1A1A"
  texto_sobre_oscuro: "#F8F4E8"   # pergamino
  acento_1: "#C9A961"   # dorado (autoridad)
  acento_2: "#4A2C1F"   # caoba oscuro
  background_dark: "#1F1812"
  background_light: "#F8F4E8"

logo:
  posicion: "bottom_center"
  posicion_x: 0
  posicion_y: 0.35
  opacidad: 0.80
  duracion: "ultimos_4s"
  scale: 0.14

subtitulos_quemados:
  bg_color: "#1F1812"
  bg_alpha: 0.85
  padding_h: 16
  padding_v: 8
  radius: 4
  color: "#F8F4E8"
  color_keywords: "#C9A961"
  font_size: 40
  position_y: 0.38

lower_third:
  x: -0.30
  y: 0.25
  font: "Lato Medium"
  font_size: 30
  color: "#C9A961"
  texto_default: "Dr. Ariel Llamas  |  HUMANOX"

cta_default: "EMPIEZA TU PROCESO"

sound_design:
  estilo: "orquestal sutil / piano cuerdas"
  bpm: "60-80"
  volumen_base: 0.15
  silencio_dramatico_permitido: true

estilo_edicion:
  cuts_min_separacion: 4
  zooms: "muy_lentos_prolongados"
  color_grading: "calido_sepia_dorado"
  transiciones_permitidas: ["cut", "fade_lento_600ms"]
  transiciones_prohibidas: ["glitch", "whip", "vhs"]
```

---

## Ovejas Voladoras / Andy Molina

**Vertical:** comunidad Skool de lanzamientos para coaches
**Audiencia:** coaches, consultores, expertos 28-50

```yaml
nombre_marca: "Ovejas Voladoras"
tipografias:
  primaria: "Archivo Black"
  primaria_fallback: "Inter Black"
  secundaria: "Inter Medium"
  subtitulos: "Inter Bold"

paleta:
  texto_principal: "#FFFFFF"
  acento_1: "#FFD700"   # dorado vibrante
  acento_2: "#FF6B35"   # naranja energético
  background_dark: "#0D0D0D"
  background_mid: "#1F1F1F"

logo:
  posicion: "top_center"
  posicion_x: 0
  posicion_y: -0.40
  opacidad: 1.0
  duracion: "primeros_2s_y_ultimos_5s"
  scale: 0.13

subtitulos_quemados:
  bg_color: null              # transparente
  stroke_enabled: true
  stroke_color: "#000000"
  stroke_width: 3
  color: "#FFFFFF"
  color_keywords: "#FFD700"
  font_size: 44
  position_y: 0.32

lower_third:
  x: -0.30
  y: 0.15
  font: "Inter Bold"
  font_size: 32
  color: "#FFD700"
  texto_default: "Andy Molina  |  Ovejas Voladoras"

cta_default: "ÚNETE A LA COMUNIDAD"

sound_design:
  estilo: "hip-hop/electro motivacional"
  bpm: "95-115"
  volumen_base: 0.25
  sound_fx_en_hooks: true

estilo_edicion:
  cuts_min_separacion: 1
  zooms: "con_bounce"
  texto_animaciones_agresivas: true
  color_grading: "saturado_alto_contraste"
  transiciones_permitidas: ["cut", "whip_max_2", "zoom_punch"]
```

---

## Plantilla para clientes nuevos

Cuando entre un cliente no listado, preguntar a Cristhian:
1. Tipografía principal (familia + peso)
2. Color de acento principal (CTAs)
3. Posición y duración del logo

Inferir el resto del brand kit existente del cliente (landing page, IG, web). Guardarlo en este archivo después.

```yaml
nombre_marca: ""
tipografias:
  primaria: ""
  primaria_fallback: ""
  secundaria: ""
  subtitulos: ""
paleta:
  texto_principal: ""
  texto_sobre_oscuro: ""
  acento_1: ""
  acento_2: ""
logo:
  posicion: ""
  posicion_x: 0
  posicion_y: 0
  opacidad: 0
  duracion: ""
  scale: 0
subtitulos_quemados:
  bg_color: ""
  bg_alpha: 0
  color: ""
  font_size: 0
  position_y: 0
lower_third:
  texto_default: ""
cta_default: ""
sound_design:
  estilo: ""
  volumen_base: 0
estilo_edicion:
  cuts_min_separacion: 0
  color_grading: ""
```
