# Mi Barco · Backend Supabase (Paulina Valencia)

Todo el progreso de la app (Rueda, Neuropliegues/Plan y Tracker) vive en Supabase.
**No se guarda nada en localStorage** (solo el token de sesión que mantiene el login).

## 1. Crear el proyecto
1. Entra a https://supabase.com → **New project** (región más cercana, p. ej. East US).
2. Guarda la contraseña de la base de datos.

## 2. Correr la migración
- **Opción A (rápida):** Dashboard → **SQL Editor** → pega el contenido de
  `migrations/20260604000001_mi_barco_init.sql` → **Run**.
- **Opción B (CLI):** `supabase link --project-ref <ref>` y luego `supabase db push`.

Crea las tablas `profiles` y `mi_barco_state` con RLS (cada usuaria solo ve su fila) y el
trigger que crea el perfil al registrarse.

## 3. Desactivar verificación por email (signup directo)
Dashboard → **Authentication → Providers → Email** → **desactiva "Confirm email"**.
Así el registro entra directo a la app, igual que en el dashboard de Lina.

> Opcional: en **Authentication → URL Configuration** agrega la URL pública donde se embebe
> la app (GHL) como *Site URL* / *Redirect URL* para que el enlace de "olvidé contraseña" vuelva ahí.

## 4. Pegar las credenciales en la app
Dashboard → **Project Settings → API**. Copia **Project URL** y **anon public key** y
pégalas en `Paulina/app/assets/app.js` (objeto `window.MI_BARCO_CONFIG` arriba del archivo):

```js
window.MI_BARCO_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',   // anon public (NO la service_role)
  VIDEO_URL: ''  // se pega después de subir el .mp4 del login a GHL
};
```

> La **anon key** es pública por diseño; la seguridad la da el RLS. Nunca pongas la `service_role` aquí.

## 5. Rebuild + publicar
```bash
bash Paulina/app/build-ghl.sh
```
Sube/pega el `Paulina/app/dist/mi-barco-ghl.html` resultante en el bloque Custom HTML de GHL.

## 6. Video del login (opcional pero recomendado)
1. Renderiza `remotion-visitas` → `out/mi-barco-login.mp4` (composición `MiBarcoVideo`).
2. Súbelo a la biblioteca de medios de GHL y copia su URL.
3. Pega esa URL en `VIDEO_URL` (paso 4) y vuelve a hacer el build.
Sin video, el hero del login usa un fondo gradiente navy/gold.

## Modelo de datos
`mi_barco_state` (una fila por usuaria):

| columna     | tipo        | contenido                                   |
|-------------|-------------|---------------------------------------------|
| user_id     | uuid (PK)   | = `auth.users.id`                           |
| rueda       | jsonb       | Rueda de la Vida (pilares, historial)       |
| tracker     | jsonb       | hábitos + registros por mes                 |
| plan        | jsonb       | herramientas (Neuropliegues) guardadas      |
| updated_at  | timestamptz | última sincronización                       |

El nombre de la usuaria se toma de `auth.users.user_metadata.full_name` (definido en el registro).
