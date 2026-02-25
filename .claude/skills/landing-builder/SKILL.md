---
name: landing-builder
description: Genera landing pages completas usando componentes del boilerplate. Usa cuando el usuario quiera crear una landing page, pagina de inicio, home page, o necesite paginas legales (TOS, privacy). Incluye seleccion inteligente de componentes, configuracion de config.ts, y generacion de paginas legales.
---

# Landing Page Builder

Skill para generar landing pages completas y paginas legales usando los componentes disponibles del boilerplate.

## Flujo de Trabajo

### Fase 1: Descubrimiento

**Paso 1:** Lee `config.ts` para obtener informacion existente del producto:
- `appName` - Nombre de la aplicacion
- `appDescription` - Descripcion corta
- `domainName` - Dominio del sitio
- `stripe.plans[]` - Planes de precios
- `resend.supportEmail` - Email de soporte

**Paso 2:** Si falta informacion, pregunta al usuario usando AskUserQuestion:

```
Necesito informacion sobre tu producto para crear la landing page:

1. Nombre del producto: [Si no esta en config.ts]
2. Descripcion en 1 linea: Que hace tu producto?
3. Propuesta de valor: Por que alguien deberia usarlo? (menos de 10 palabras)
4. Problema que resuelve: Que dolor alivia?
5. Caracteristicas principales: Lista 3-5 features clave
6. Publico objetivo: B2B, B2C, desarrolladores, etc.
7. Precios: Planes y precios (si aplica)
8. FAQs: 3-5 preguntas frecuentes
9. Testimonios: Tienes testimonios reales? (opcional)
```

### Fase 2: Seleccion de Componentes

Segun el tipo de producto, recomienda una combinacion de componentes:

**SaaS B2B** (software para empresas):
```
Header -> Hero -> Problem -> FeaturesAccordion -> Pricing -> FAQ -> CTA -> Footer
```

**SaaS B2C** (software para consumidores):
```
Header -> Hero -> WithWithout -> FeaturesGrid -> Testimonials11 -> Pricing -> CTA -> Footer
```

**Producto Digital** (cursos, ebooks, templates):
```
Header -> Hero -> FeaturesListicle -> Testimonials3 -> Pricing -> FAQ -> CTA -> Footer
```

**Landing Simple** (waitlist, coming soon):
```
Header -> Hero -> FAQ -> CTA -> Footer
```

**Pregunta al usuario** cual combinacion prefiere o si quiere personalizar.

### Fase 3: Generacion

**3.1 Actualizar config.ts**

Actualiza los valores necesarios:
```typescript
const config = {
  appName: "[NOMBRE_PRODUCTO]",
  appDescription: "[DESCRIPCION]",
  domainName: "[DOMINIO]",
  stripe: {
    plans: [
      {
        priceId: process.env.NODE_ENV === "development"
          ? "price_dev_xxx"
          : "price_prod_xxx",
        name: "[NOMBRE_PLAN]",
        description: "[DESCRIPCION_PLAN]",
        price: [PRECIO],
        priceAnchor: [PRECIO_TACHADO], // opcional
        isFeatured: true/false,
        features: [
          { name: "[FEATURE_1]" },
          { name: "[FEATURE_2]" },
        ],
      },
    ],
  },
  resend: {
    supportEmail: "[EMAIL_SOPORTE]",
  },
};
```

**3.2 Generar app/page.tsx**

Estructura base:
```tsx
import Header from "@/components/Header";
import Hero from "@/components/Hero";
// ... otros imports segun seleccion
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        {/* Componentes seleccionados */}
      </main>
      <Footer />
    </>
  );
}
```

**3.3 Personalizar Componentes**

Para cada componente, actualiza el contenido segun la informacion del producto:

- **Hero.tsx**: Headline (<10 palabras), subheadline, CTA text
- **Problem.tsx**: Puntos de dolor del usuario
- **Features*.tsx**: Lista de caracteristicas con iconos
- **FAQ.tsx**: Preguntas y respuestas
- **CTA.tsx**: Mensaje final de conversion
- **Pricing.tsx**: Lee automaticamente de config.ts

**3.4 Generar Paginas Legales**

Usa los prompts en [prompts-legales.md](prompts-legales.md) para generar contenido con ChatGPT.

Estructura de paginas legales:
```tsx
import Link from "next/link";
import { getSEOTags } from "@/libs/seo";
import config from "@/config";

export const metadata = getSEOTags({
  title: `[TITULO] | ${config.appName}`,
  canonicalUrlRelative: "/[ruta]",
});

const [NombrePagina] = () => {
  return (
    <main className="max-w-xl mx-auto">
      <div className="p-5">
        <Link href="/" className="btn btn-ghost">
          {/* Icono flecha */}
          Volver
        </Link>
        <h1 className="text-3xl font-extrabold pb-6">
          [Titulo] para {config.appName}
        </h1>
        <pre
          className="leading-relaxed whitespace-pre-wrap"
          style={{ fontFamily: "sans-serif" }}
        >
          {`[CONTENIDO GENERADO CON CHATGPT]`}
        </pre>
      </div>
    </main>
  );
};

export default [NombrePagina];
```

### Fase 4: Verificacion

1. Ejecuta `npm run build` para verificar que compila
2. Lista los archivos generados/modificados
3. Verifica que las rutas funcionan:
   - `/` - Landing page
   - `/tos` - Terminos de servicio
   - `/privacy-policy` - Politica de privacidad

## Componentes Disponibles

### Layout
| Componente | Descripcion |
|------------|-------------|
| Header | Navegacion responsive con logo, enlaces, CTA |
| Footer | Pie de pagina con links legales |

### Hero/Principal
| Componente | Descripcion |
|------------|-------------|
| Hero | Seccion principal con titulo, imagen, social proof |

### Problema/Solucion
| Componente | Descripcion |
|------------|-------------|
| Problem | Consecuencias del problema (va despues de Hero) |
| WithWithout | Comparacion con/sin producto |

### Features
| Componente | Descripcion |
|------------|-------------|
| FeaturesListicle | Lista con rotacion automatica cada 5s |
| FeaturesAccordion | Acordeon interactivo con media |
| FeaturesGrid | Grid con demos interactivos |

### Conversion
| Componente | Descripcion |
|------------|-------------|
| CTA | Call-to-action pantalla completa |
| Pricing | Tabla de precios con Stripe |

### Social Proof
| Componente | Descripcion |
|------------|-------------|
| TestimonialsAvatars | 5 avatares con rating |
| Testimonial1Small | Testimonio pequeno |
| Testimonials1 | Testimonio unico detallado |
| Testimonials3 | 3 testimonios simples |
| Testimonials11 | 11 testimonios con video |

### Soporte
| Componente | Descripcion |
|------------|-------------|
| FAQ | Preguntas frecuentes en acordeon |

### Botones
| Componente | Descripcion |
|------------|-------------|
| ButtonLead | Captura emails (requiere DB) |
| ButtonCheckout | Pago con Stripe |
| ButtonSignin | Inicio de sesion |
| ButtonAccount | Menu de cuenta |
| ButtonGradient | Boton decorativo |
| ButtonPopover | Menu desplegable |

### Utilidades
| Componente | Descripcion |
|------------|-------------|
| Modal | Ventana emergente |
| Tabs | Contenido en pestanas |
| TestimonialRating | Rating visual |
| BetterIcon | Iconos SVG |

## Tips de Copywriting

- **Hero h1**: Responde "Por que quedarse?" en <10 palabras
- **Problem**: Describe el dolor, no la solucion
- **Features**: Beneficios > Caracteristicas tecnicas
- **Pricing**: "Bueno, Mejor, El Mejor" funciona bien
- **FAQ**: Cubre objeciones comunes
- **Testimonios**: Pregunta "como cambio tu vida" no "te gusta?"

## Ejemplo de Uso

```
Usuario: Quiero crear una landing page para mi SaaS de gestion de proyectos

Claude: [Lee config.ts, pregunta informacion faltante]

Usuario: [Responde preguntas]

Claude: [Recomienda: SaaS B2B template]
        [Genera app/page.tsx con componentes]
        [Actualiza config.ts]
        [Personaliza Hero, Problem, Features, FAQ]
        [Ofrece generar paginas legales]
```