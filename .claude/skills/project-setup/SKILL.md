---
name: project-setup
description: Guia interactiva para configurar un nuevo proyecto SaaS. Usa cuando el usuario quiera iniciar un proyecto nuevo, configurar variables de entorno, setup inicial, primeros pasos con la plantilla, o configurar Supabase, Stripe, Resend, Google OAuth o Crisp.
---

# Project Setup - Configuracion de Proyecto SaaS

Esta skill guia al usuario paso a paso en la configuracion inicial de un proyecto basado en esta plantilla (Next.js 15 + Supabase + Stripe + Resend).

## Requisitos Previos

Antes de comenzar, el usuario debe tener:
- Node.js 18+ instalado
- npm o pnpm instalado
- Cuenta de Supabase (para auth y base de datos)
- Cuenta de Stripe (para pagos, opcional)
- Cuenta de Resend (para emails, opcional)

## Flujo de Ejecucion

### Paso 1: Seleccion de Modo

Al iniciar, pregunta al usuario que quiere configurar usando AskUserQuestion:

**Opciones:**
1. **Setup completo** - Configura todos los servicios de una vez
2. **Solo informacion basica** - Nombre, descripcion, dominio (config.ts)
3. **Solo Supabase** - Configurar autenticacion y base de datos
4. **Solo Stripe** - Configurar pagos y planes
5. **Solo Resend/Email** - Configurar envio de correos
6. **Solo Google OAuth** - Configurar login con Google
7. **Solo Crisp** - Configurar chat de soporte

Segun la seleccion, ejecuta el flujo correspondiente.

---

## Flujo: Informacion Basica

### Preguntas a realizar:

1. **Nombre de la app**
   - Ejemplo: "MiSaaS", "Zaly"
   - Se usara en: config.ts (appName), SEO, emails

2. **Descripcion corta**
   - Ejemplo: "Plataforma de automatizacion con IA"
   - Se usara en: config.ts (appDescription), meta tags SEO

3. **Dominio**
   - Formato: sin https://, sin barra final
   - Ejemplo: "miapp.com"
   - Se usara en: config.ts (domainName), sitemap, SEO

4. **Tema de colores**
   - Opciones: light, dark, cupcake, bumblebee, emerald, corporate, synthwave, retro, cyberpunk, valentine, halloween, garden, forest, aqua, lofi, pastel, fantasy, wireframe, black, luxury, dracula, cmyk, autumn, business, acid, lemonade, night, coffee, winter
   - Default: light

5. **Color principal (HEX)**
   - Ejemplo: #3b82f6 (blue-500)
   - Se usara para: barra de carga, tabs del navegador

### Acciones:
- Editar `config.ts` con los valores proporcionados
- Mostrar preview de los cambios antes de aplicar

---

## Flujo: Supabase

### Prerequisitos:
1. Crear proyecto en https://supabase.com/dashboard
2. Obtener credenciales de Settings > API

### Preguntas a realizar:

1. **URL del proyecto**
   - Formato: https://xxxx.supabase.co
   - Se obtiene de: Supabase Dashboard > Settings > API > Project URL

2. **Anon Key (publica)**
   - Se obtiene de: Supabase Dashboard > Settings > API > anon public key

3. **Service Role Key (secreta)**
   - Se obtiene de: Supabase Dashboard > Settings > API > service_role key
   - IMPORTANTE: Esta key es secreta, no compartir

### Acciones:
1. Crear o actualizar `.env.local` con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
   ```

2. Mostrar SQL para crear tabla `profiles`:
   - Leer archivo: `.claude/skills/project-setup/sql/profiles.sql`
   - Instruir al usuario a ejecutarlo en Supabase SQL Editor

3. Mostrar SQL para politicas RLS:
   - Leer archivo: `.claude/skills/project-setup/sql/rls-policies.sql`
   - Recomendar encarecidamente aplicar RLS

4. Preguntar si quiere tabla `leads` para captura de emails:
   - Si: mostrar `.claude/skills/project-setup/sql/leads.sql`

### Configuracion adicional:
Instruir al usuario:
- Authentication > URL Configuration > Site URL: su dominio de produccion
- Authentication > URL Configuration > Redirect URLs: agregar dominios permitidos

---

## Flujo: Stripe

### Prerequisitos:
1. Crear cuenta en https://stripe.com
2. Activar modo Test para desarrollo

### Preguntas a realizar:

1. **Modo de desarrollo o produccion?**
   - Desarrollo: usar keys de Test Mode
   - Produccion: usar keys de Live Mode

2. **Public Key**
   - Se obtiene de: Stripe Dashboard > Developers > API Keys > Publishable key

3. **Secret Key**
   - Se obtiene de: Stripe Dashboard > Developers > API Keys > Secret key

4. **Cuantos planes de precio?** (1-3)

5. **Por cada plan:**
   - Nombre (ej. "Starter", "Pro", "Enterprise")
   - Precio en USD (numero entero)
   - Price ID (ej. "price_1abc...")
     - Crear producto en Stripe Dashboard > Products > Add Product
     - Copiar el Price ID del precio creado
   - Precio ancla opcional (precio tachado para mostrar descuento)
   - Es el plan destacado? (solo uno puede ser featured)
   - Lista de features (separadas por coma)

### Acciones:
1. Actualizar `.env.local`:
   ```
   STRIPE_PUBLIC_KEY=<public_key>
   STRIPE_SECRET_KEY=<secret_key>
   ```

2. Actualizar `config.ts` con los planes:
   ```typescript
   stripe: {
     plans: [
       {
         priceId: "price_xxx",
         name: "Plan Name",
         price: 99,
         priceAnchor: 149, // opcional
         isFeatured: false,
         features: [
           { name: "Feature 1" },
           { name: "Feature 2" }
         ]
       }
     ]
   }
   ```

### Configuracion de Webhook (desarrollo):
Instruir al usuario:
1. Instalar Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Ejecutar: `stripe listen --forward-to localhost:3000/api/webhook/stripe`
4. Copiar el webhook secret que aparece

5. **Preguntar Webhook Secret**
   - Actualizar `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=<webhook_secret>
   ```

### Configuracion de Webhook (produccion):
Instruir al usuario:
1. Stripe Dashboard > Developers > Webhooks > Add endpoint
2. URL: https://tudominio.com/api/webhook/stripe
3. Eventos: checkout.session.completed (minimo)
4. Copiar signing secret para STRIPE_WEBHOOK_SECRET

---

## Flujo: Resend/Email

### Prerequisitos:
1. Crear cuenta en https://resend.com
2. Agregar y verificar dominio

### Preguntas a realizar:

1. **API Key**
   - Se obtiene de: Resend Dashboard > API Keys > Create API Key

2. **Email de noreply**
   - Formato: "NombreApp <noreply@resend.tudominio.com>"
   - Se usa para: magic links de login

3. **Email de admin**
   - Formato: "Tu Nombre <tu@resend.tudominio.com>"
   - Se usa para: emails transaccionales, notificaciones

4. **Email de soporte**
   - Email donde recibir respuestas de clientes
   - Ejemplo: soporte@tudominio.com

### Acciones:
1. Actualizar `.env.local`:
   ```
   RESEND_API_KEY=<api_key>
   ```

2. Actualizar `config.ts`:
   ```typescript
   resend: {
     fromNoReply: "App <noreply@resend.tudominio.com>",
     fromAdmin: "Tu Nombre <tu@resend.tudominio.com>",
     supportEmail: "soporte@tudominio.com"
   }
   ```

### Instrucciones de configuracion de dominio:
1. Resend Dashboard > Domains > Add Domain
2. Recomendado: usar subdominio (ej. resend.tudominio.com)
3. Agregar registros DNS que Resend indica
4. Verificar dominio (puede tardar unos minutos)

---

## Flujo: Google OAuth

### Prerequisitos:
1. Cuenta de Google Cloud Platform

### Instrucciones paso a paso:

1. **Crear proyecto en Google Cloud**
   - Ir a: https://console.cloud.google.com
   - Crear nuevo proyecto o seleccionar existente

2. **Configurar OAuth Consent Screen**
   - APIs & Services > OAuth consent screen
   - User Type: External
   - Llenar informacion de la app (nombre, email, logo)
   - Scopes: agregar userinfo.email y userinfo.profile
   - Test users: agregar tu email

3. **Crear credenciales OAuth**
   - APIs & Services > Credentials > Create Credentials > OAuth client ID
   - Application type: Web application
   - Authorized JavaScript origins:
     - http://localhost:3000
     - https://tu-proyecto.supabase.co
   - Authorized redirect URIs:
     - https://tu-proyecto.supabase.co/auth/v1/callback

### Preguntas a realizar:
1. **Client ID** - Copiar de las credenciales creadas
2. **Client Secret** - Copiar de las credenciales creadas

### Acciones:
Instruir al usuario:
1. Ir a Supabase Dashboard > Authentication > Providers > Google
2. Habilitar Google provider
3. Pegar Client ID y Client Secret
4. Guardar cambios

### Publicacion:
- Para produccion: OAuth consent screen > Publish App
- Google puede requerir verificacion (tarda dias)
- Mientras tanto, mostrara advertencia pero funcionara

---

## Flujo: Crisp (Chat de Soporte)

### Prerequisitos:
1. Cuenta en https://crisp.chat

### Preguntas a realizar:

1. **Tienes cuenta de Crisp?**
   - Si: continuar
   - No: instruir a crear cuenta en https://crisp.chat

2. **Website ID**
   - Se obtiene de: Crisp Dashboard > Settings > Website Settings > Integrations > HTML
   - Buscar CRISP_WEBSITE_ID en el codigo

### Acciones:
Actualizar `config.ts`:
```typescript
crisp: {
  id: "<website_id>",
  onlyShowOnRoutes: ["/"]  // mostrar solo en landing, o [] para todas las rutas
}
```

### Nota:
Si no se configura Crisp, el boton de soporte abrira el cliente de email del usuario con el email de soporte configurado en resend.supportEmail.

---

## Checklist Final

Despues de completar la configuracion, mostrar este checklist al usuario:

### Verificacion:
- [ ] Ejecutar `npm install` (si no lo ha hecho)
- [ ] Ejecutar `npm run dev` para iniciar servidor de desarrollo
- [ ] Verificar que la app carga en http://localhost:3000
- [ ] Probar autenticacion (magic link o Google)
- [ ] Verificar que el webhook de Stripe recibe eventos (si aplica)
- [ ] Ejecutar `npm run build` para verificar que no hay errores

### Siguientes pasos:
1. Personalizar la landing page (components/)
2. Agregar contenido al dashboard (app/dashboard/)
3. Configurar dominio de produccion
4. Deploy a Vercel (recomendado)

---

## Troubleshooting Comun

### Error: "Invalid API key" en Supabase
- Verificar que las keys estan correctas en .env.local
- Reiniciar servidor de desarrollo despues de cambiar .env.local

### Error: "Webhook signature verification failed"
- Verificar STRIPE_WEBHOOK_SECRET
- En desarrollo: asegurar que stripe CLI esta corriendo

### Magic links no llegan
- Verificar configuracion de Resend
- Verificar que el dominio esta verificado
- Revisar spam/junk folder

### Google OAuth no funciona
- Verificar redirect URIs en Google Cloud
- Verificar que el provider esta habilitado en Supabase
- En desarrollo: usar usuario de prueba agregado

---

## Archivos de Referencia

- SQL profiles: `.claude/skills/project-setup/sql/profiles.sql`
- SQL leads: `.claude/skills/project-setup/sql/leads.sql`
- SQL RLS: `.claude/skills/project-setup/sql/rls-policies.sql`
- Template .env: `.claude/skills/project-setup/templates/env.template`
