# BRANDING — JOINSCLEE

Extraído de `https://go.joinsclee.com/` (CSS bundle `index-DIKDETD_.css` + JS bundle `index-BnipWuiJ.js`).

---

## 1. Identidad de marca

| Campo | Valor |
|---|---|
| Marca | **JOINSCLEE** |
| Tagline | Funnels Automatizados y CRM de Ventas |
| Propuesta | Implementamos Funnels y CRM de Ventas para Ayudarte a Organizar, Automatizar y Escalar tu Negocio. |
| Tema | Dark mode por defecto (`<html lang="es" class="dark">`) |
| Dominio | go.joinsclee.com |

---

## 2. Paleta de colores

Sistema basado en **shadcn/ui** sobre dark theme. Variables HSL definidas en `:root` y `.dark`.

### Tokens del sistema

| Token CSS | HSL | HEX aprox. | Uso |
|---|---|---|---|
| `--primary` / `--accent` / `--ring` | `212 100% 45%` | `#0070E6` | CTAs, focus, énfasis principal |
| `--secondary` | `212 100% 35%` | `#0057B3` | Botones secundarios / hover oscuro |
| `--background` | `222 47% 4%` | `#070A13` | Fondo principal |
| `--foreground` | `210 40% 98%` | `#F8FAFC` | Texto principal |
| `--card` / `--popover` | `222 47% 8%` | `#0E1424` | Tarjetas y popovers |
| `--muted` / `--border` / `--input` | `217 32% 17%` | `#1E293B` | Bordes, inputs, áreas atenuadas |
| `--muted-foreground` | `215 20% 65%` | `#94A3B8` | Texto secundario |
| `--destructive` | `0 63% 31%` | `#7F1F1F` | Errores / acciones destructivas |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Texto sobre primary |
| `--radius` | `0.5rem` (8px) | — | Border-radius base |

### Color signature (glow)

El acento real usado en sombras y gradientes es **`#0070F3`** (azul "Vercel"), levemente distinto del primary tokenizado:

```css
shadow-[0_0_20px_rgba(0,112,243,0.8)]
drop-shadow-[0_0_10px_rgba(0,112,243,0.6)]
```

Variantes con alpha presentes en el bundle: `rgba(0,112,243, .15 / .2 / .3 / .4 / .5 / .6 / .8)`.

### Colores complementarios (Tailwind)

| Token Tailwind | HEX | Aparece en |
|---|---|---|
| `blue-400` | `#60A5FA` | `from-blue-400 to-primary` (iconografía) |
| `blue-500` | `#3B82F6` | borders y rings auxiliares |
| `blue-600` | `#2563EB` | hovers y backgrounds |
| `slate-800` | `#1E293B` | `hover:from-slate-800` |
| `slate-900` | `#0F172A` | `from-slate-900 to-primary` (CTA principal) |
| `zinc-900` | `#18181B` | cards alternas |
| `red-500/60` | `#EF4444` (60%) | acentos negativos |
| `green-600` | `#16A34A` | confirmaciones |
| `#03B2CB` | — | accent del PhoneInput (formularios) |

---

## 3. Gradientes característicos

```css
/* Divisor decorativo principal */
bg-gradient-to-r from-transparent via-primary to-transparent
  shadow-[0_0_20px_rgba(0,112,243,0.8)]
  drop-shadow-[0_0_10px_rgba(0,112,243,0.6)]

/* CTA principal */
bg-gradient-to-b from-slate-900 to-primary
  hover:from-slate-800 hover:to-primary/90
  text-white font-sans font-bold rounded-full
  border border-primary

/* Iconografía / detalles brillantes */
bg-gradient-to-b from-blue-400 to-primary

/* Hover decorativo en cards */
bg-gradient-to-r from-primary/50 via-primary/20 to-transparent
```

---

## 4. Tipografías

Cargadas desde Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@300..700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
```

| Familia | Pesos | Uso |
|---|---|---|
| **Teko** | 300–700 | Titulares display (condensados, alta densidad vertical) — `font-family: Teko, sans-serif` |
| **Playfair Display** | 400–900 + itálicas | Acentos editoriales, quotes |
| **Rubik** | 300–900 + itálicas | Cuerpo de texto — `font-family: Rubik, sans-serif` |

---

## 5. Assets

### Logo / favicon
- **Favicon:** `https://vibe.filesafe.space/1779853814963839930/attachments/5498cf53-d1d5-4dc8-ae73-977545f788d3.png`
- **Open Graph:** `https://assets.cdn.filesafe.space/Np6qnux1pM5NRF9JY3lh/media/68e8a4f135e8693434043962.png`

### Mockups / hero (alojados en `elmeralmeida.com/wp-content/uploads/`)
- `2023/05/MOCK-UP-LANDING-PAGE-_1_-e1683241975975-1024x530.webp`
- `2024/05/HIGH-TICKER-FU-1024x709.png`
- `2024/05/DASDASDFREE-1024x709.png`
- `2024/05/MacBook-Pro-16SS-1024x709.png`
- `2024/05/MacBook-Pro-16sss-1024x709.png`
- `2024/05/macbookproiphone13mockup1fp-1.png`
- `2024/05/Your-content-marketingSS-funnel-should-be-mapped-to-your-sales-funnel-1024x1024.png`
- `2024/11/ANUNCIOS-CRM-LEADPILOT360-e1731695903882-1024x727.png`
- `2024/11/66c72c768c2d0136132052e5-2-768x1024.png`
- `2025/03/MyMarketing_calendario-1-2048x1541-1-1-1024x771.png`
- `2023/03/NEW-rm355-pf-s73-card-laptop-01-mockup-1.png`

### Videos embebidos (Loom)
- `https://cdn.loom.com/sessions/thumbnails/4166de74e3644fe49df35ef038f35525-299378b7c527314e.jpg`
- `https://cdn.loom.com/sessions/thumbnails/db966e3e406f48bea9bb14b6dc2c7d44-de24c2a2eb4a00a1.jpg`
- `https://cdn.loom.com/sessions/thumbnails/efe2ec28f8fd4766a1e7211f4fae837a-62650290e25b0784.jpg`

### Otros assets de marca (filesafe)
- `https://vibe.filesafe.space/1779853814963839930/attachments/0d9428db-1b19-4016-ba66-0cbc4660d2eb.png`
- `https://vibe.filesafe.space/1779853814963839930/attachments/7e4b68a2-bb50-4b1d-b1b7-d8ee12e0f38c.png`
- `https://vibe.filesafe.space/1779853814963839930/attachments/dd176251-ab7a-426d-90e5-5f5210df7ec1.png`

---

## 6. Voz, tono y copy

**Verbos núcleo:** Organizar · Automatizar · Escalar

**Frases bandera:**
- "Menos desorden. Más automatización."
- "Construimos un sistema de ventas automatizado"
- "Quiero escalar mi negocio" (CTA)
- "Implementamos sistemas comerciales diseñados para ayudarte a crecer de forma organizada y escalable."

**Líneas de producto:**
- Funnel de ventas high ticket
- Funnel de captación
- Funnel de agendamiento
- Funnel webinar/masterclass
- Funnel para cursos online
- Funnel para mentorías
- Community Funnel
- Funnel automatizado por WhatsApp

**Stack ofrecido:**
- CRM + Landing Pages + Automatizaciones
- Integración WhatsApp al CRM
- Funnels con IA
- App móvil del CRM (iOS / Android)

**Audiencia objetivo:**
- Empresas que buscan automatizar su proceso comercial
- Negocios que venden programas high ticket
- Equipos comerciales desorganizados y sin procesos claros

**Dolores que ataca:**
- "Mucho trabajo manual y poca automatización"
- "Procesos difíciles de escalar"
- "Equipos comerciales desorganizados y sin procesos claros"

---

## 7. Snippet listo para reutilizar

### `globals.css` (Tailwind v4 + shadcn)

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 222 47% 4%;
    --foreground: 210 40% 98%;
    --card: 222 47% 8%;
    --card-foreground: 210 40% 98%;
    --popover: 222 47% 8%;
    --popover-foreground: 210 40% 98%;
    --primary: 212 100% 45%;
    --primary-foreground: 0 0% 100%;
    --secondary: 212 100% 35%;
    --secondary-foreground: 0 0% 100%;
    --muted: 217 32% 17%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 212 100% 45%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217 32% 17%;
    --input: 217 32% 17%;
    --ring: 212 100% 45%;
    --radius: 0.5rem;
  }
}

@theme {
  --color-brand-glow: #0070F3;
  --font-display: "Teko", sans-serif;
  --font-serif: "Playfair Display", serif;
  --font-sans: "Rubik", sans-serif;
}

@utility cta-jclee {
  @apply bg-gradient-to-b from-slate-900 to-primary
         hover:from-slate-800 hover:to-primary/90
         text-white font-bold rounded-full
         border border-primary
         px-10 py-5;
}

@utility divider-glow {
  background: linear-gradient(to right, transparent, hsl(var(--primary)), transparent);
  box-shadow: 0 0 20px rgba(0, 112, 243, 0.8);
  filter: drop-shadow(0 0 10px rgba(0, 112, 243, 0.6));
}
```

### `<head>` mínimo

```html
<html lang="es" class="dark">
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Teko:wght@300..700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
</head>
```
