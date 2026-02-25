# Common Patterns

## API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
```

## Custom Hooks Pattern

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
```

## Repository Pattern

```typescript
interface Repository<T> {
  findAll(filters?: Filters): Promise<T[]>
  findById(id: string): Promise<T | null>
  create(data: CreateDto): Promise<T>
  update(id: string, data: UpdateDto): Promise<T>
  delete(id: string): Promise<void>
}## Patrones de Tailwind CSS v4 Que Debes Usar

### 1. Configuracion CSS-First
```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-500: #570df8;
  --spacing-custom: 2.5rem;
  --animate-bounce-slow: bounce 2s infinite;
}
```

### 2. Utilidades Personalizadas
```css
@utility btn-gradient {
  background: linear-gradient(45deg, #570df8, #a855f7);
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
}
```

### 3. No Mas tailwind.config.js
- Toda la configuracion va en CSS usando `@theme`
- Usar plugin `@tailwindcss/postcss` en config de PostCSS
- Los temas de DaisyUI se configuran en CSS, no en JS

## Patrones de Supabase Que Debes Seguir

### 1. Componentes de Servidor (Mas Comun)
```typescript
import { createClient } from "@/libs/supabase/server";
import { redirect } from "next/navigation";

export default async function PrivatePage() {
  const supabase = await createClient(); // Siempre await!

  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  return <div>Contenido protegido</div>;
}
```

### 2. Componentes de Cliente
```typescript
"use client";
import { createClient } from "@/libs/supabase/client";
import { useEffect, useState } from "react";

export default function ClientComponent() {
  const supabase = createClient(); // No se necesita await para cliente
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);
}
```

### 3. Rutas de API
```typescript
import { createClient } from "@/libs/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient(); // Siempre await!

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Tu logica aqui
}
```

## Patrones de Componentes

### 1. Componente de Servidor (Por Defecto)
```typescript
// Sin directiva "use client"
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Titulo de Pagina",
};

export default async function Page() {
  // Puede usar await, obtener datos, etc.
  return <div>Componente de servidor</div>;
}
```

### 2. Componente de Cliente (Cuando Sea Necesario)
```typescript
"use client";
import { useState, useEffect } from "react";

export default function InteractiveComponent() {
  const [state, setState] = useState(false);

  return (
    <button onClick={() => setState(!state)}>
      {state ? "Encendido" : "Apagado"}
    </button>
  );
}
```

## Patrones de Rutas de API

### 1. Manejador de Webhook (Stripe)
```typescript
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers(); // Debe usar await!
  const signature = headersList.get("stripe-signature");

  // Verificar firma del webhook
  // Manejar evento del webhook
}
```

### 2. Ruta de API Protegida
```typescript
import { createClient } from "@/libs/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient(); // Debe usar await!

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Logica protegida aqui
}
```

## Patrones de Estilos

### 1. Usar Componentes de DaisyUI
```jsx
<div className="card bg-base-100 shadow-xl">
  <div className="card-body">
    <h2 className="card-title">Titulo de Card</h2>
    <p>Contenido de la card</p>
    <div className="card-actions justify-end">
      <button className="btn btn-primary">Accion</button>
    </div>
  </div>
</div>
```

### 2. Diseno Responsive
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="p-4 bg-base-200 rounded-lg">Contenido</div>
</div>
```

### 3. Estilos Personalizados con Variables CSS
```jsx
<div
  className="p-4 rounded-lg"
  style={{ backgroundColor: "var(--color-brand-500)" }}
>
  Contenido con color personalizado
</div>
```

## Patrones de Manejo de Errores

### 1. Rutas de API
```typescript
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.email) {
      return NextResponse.json(
        { error: "Email es requerido" },
        { status: 400 }
      );
    }

    // Tu logica
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error de API:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
```

### 2. Componentes de Cliente
```typescript
"use client";
import { toast } from "react-hot-toast";

export default function Component() {
  const handleAction = async () => {
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "ejemplo" }),
      });

      if (!response.ok) {
        throw new Error("Accion fallida");
      }

      toast.success("Accion completada exitosamente!");

    } catch (error) {
      toast.error("Algo salio mal");
      console.error(error);
    }
  };
}
```

## Errores Comunes a Evitar

### ❌ No Hacer Esto
```typescript
// Usar patrones viejos de Next.js 14
const params = { id: "123" }; // params deberia usar await
const headers = headers(); // deberia ser await headers()
const supabase = createClient(); // deberia ser await createClient() para servidor

// Usar configuracion vieja de Tailwind
module.exports = { theme: { ... } }; // Deberia ser CSS @theme

// Hardcodear valores
const apiUrl = "https://api.example.com"; // Deberia usar variables de entorno
```

### ✅ Hacer Esto en su Lugar
```typescript
// Patrones de Next.js 15
const { id } = await params;
const headersList = await headers();
const supabase = await createClient();

// Configuracion CSS de Tailwind v4
@theme {
  --color-primary: #570df8;
}

// Variables de entorno
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

## Estructura de Archivos Que Debes Seguir
```
app/
├── api/
│   ├── auth/callback/route.ts
│   ├── stripe/
│   │   ├── create-checkout/route.ts
│   │   └── create-portal/route.ts
│   └── webhook/stripe/route.ts
├── blog/[articleId]/page.tsx
├── dashboard/
│   ├── layout.tsx
│   └── page.tsx
├── globals.css
└── layout.tsx

components/
├── ButtonCheckout.tsx
├── ButtonSignin.tsx
└── LayoutClient.tsx

libs/
├── supabase/
│   ├── client.ts
│   └── server.ts
├── stripe.ts
└── resend.ts
```

## Cuando Usar Cada Patron

### Usar Componentes de Servidor Cuando:
- Obtengas datos de base de datos/API
- Manejes verificaciones de autenticacion
- Generes metadata
- Renderices contenido estatico

### Usar Componentes de Cliente Cuando:
- Manejes interacciones de usuario (clics, inputs de formulario)
- Gestiones estado local
- Uses APIs del navegador
- Funcionalidades en tiempo real

### Usar Rutas de API Cuando:
- Manejes envios de formularios
- Endpoints de webhook
- Operaciones del lado del servidor
- Mutaciones de base de datos

## Consideraciones de Testing

### Comando de Test de Build
Siempre testea que el proyecto construya exitosamente:
```bash
npm run build
```

### Errores Comunes de Build a Vigilar:
1. Falta de `await` en APIs asincronas de Next.js 15
2. Tipado incorrecto de `params` en rutas dinamicas
3. Problemas de limites entre componentes Cliente/Servidor
4. Variables de entorno faltantes
5. Errores de configuracion de Tailwind CSS

```

## Skeleton Projects

When implementing new functionality:
1. Search for battle-tested skeleton projects
2. Use parallel agents to evaluate options:
   - Security assessment
   - Extensibility analysis
   - Relevance scoring
   - Implementation planning
3. Clone best match as foundation
4. Iterate within proven structure
