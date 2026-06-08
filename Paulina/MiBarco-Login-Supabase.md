# Mi Barco (Paulina Valencia) — Login + Registro + Backend en Supabase

> Documento de trabajo y handoff. Resume todo lo implementado en la app **Mi Barco** durante esta
> iteración y los **pasos siguientes** (configuración manual que queda por hacer).
> Fecha: 2026-06-08.

---

## 1. Objetivo

La mini-app **Mi Barco** (embebida en GoHighLevel) guardaba el progreso de la usuaria
(Rueda de la Vida, Neuropliegues/Plan y Tracker de hábitos) en **localStorage**, sin login.

Se pidió:
1. Agregar una **zona de Login / Registro** estilo el dashboard de Lina, pero con el **branding de Paulina**.
2. Hacer el **login obligatorio** para entrar a la app.
3. Que **nada se guarde en localStorage**: todo el conocimiento vive en una **base de datos Supabase**.
4. Un **video** para el hero del login (estilo el de Lina) enfocado en lo que hace la app de Paulina.

---

## 2. Qué se construyó

### A) Zona de Login / Registro (branding Paulina)
- Vista `#view-auth` con **navy `#08315C` + gold `#F4C94A` + tipografía Asap + logo de Paulina**.
- Cuatro tarjetas: **Iniciar sesión, Crear cuenta, Olvidé contraseña, Nueva contraseña**
  (mostrar/ocultar contraseña, spinners, alertas en español).
- Hero a la izquierda con **video** (con *fallback* a un fondo gradiente navy/gold si aún no hay video).
- La app queda envuelta en `#view-app` y **solo aparece tras iniciar sesión**.
- Barra de cuenta con chip de usuaria + **Cerrar sesión**.

### B) Todo en Supabase — nada en localStorage
- `MisPliegues` (en `app.js`) dejó de usar localStorage. Ahora es un **store en memoria** que:
  - se **hidrata desde Supabase** al iniciar sesión (tabla `mi_barco_state`),
  - hace **upsert con *debounce* (~600 ms)** en Supabase en cada cambio.
- Nuevo módulo **`MiBarcoCloud`**: cliente Supabase + flujos de autenticación + sincronización + gate de vistas.
- Lo único que persiste en el navegador es el **token de sesión** de Supabase (es autenticación, no datos de
  la app — necesario para mantener el login entre recargas).

### C) Backend Supabase
- Migración SQL con tablas **`profiles`** y **`mi_barco_state`** (columnas `rueda`/`tracker`/`plan` en JSONB),
  **RLS** (cada usuaria solo accede a su fila) y un **trigger** que crea el perfil al registrarse.

### D) Video del login (Remotion)
- Nueva composición **`MiBarcoVideo`** (1080×1350, 10 s en loop): navy/gold + Asap + logo de Paulina.
  Escenas: *Mi Barco* → *"Construye tu identidad, un pliegue a la vez"* →
  *Diagnostica / Comprende / Sostén* (Rueda · Neuropliegues · Tracker) → cierre.
- Renderizado a `remotion-visitas/out/mi-barco-login.mp4` (~2.4 MB).

---

## 3. Archivos modificados / creados

| Archivo | Cambio |
|---|---|
| `Paulina/app/index.html` | CDN de Supabase; overlay de carga; `#view-auth` (4 tarjetas + hero/video); `#view-app` envolviendo la app; barra de cuenta; `init()` hidrata desde la nube + `logout()` |
| `Paulina/app/assets/app.js` | Se quitó la capa de localStorage; store en memoria; módulo `MiBarcoCloud` (auth + sincronización); objeto de configuración `window.MI_BARCO_CONFIG` |
| `Paulina/app/assets/styles.css` | CSS de auth con branding Paulina (navy/gold/Asap), overlay de carga, *full-bleed*, chip de cuenta, responsive |
| `Paulina/app/dist/mi-barco-ghl.html` | Build autocontenido regenerado (lo que se pega en GHL) |
| `Paulina/supabase/migrations/20260604000001_mi_barco_init.sql` | Esquema + RLS + trigger |
| `Paulina/supabase/README.md` | Pasos de configuración del backend |
| `remotion-visitas/src/MiBarcoVideo.tsx` | Composición del video del login |
| `remotion-visitas/src/Root.tsx` | Registro de la composición `MiBarcoVideo` |

---

## 4. Cómo funciona (flujo)

1. Carga la página → overlay de carga + se revisa la sesión de Supabase.
2. **Sin sesión** → se muestra el login. **Con sesión** → entra directo a la app.
3. Al iniciar sesión / registrarse → se **hidrata** el estado desde `mi_barco_state` y se muestra `#view-app`.
4. Cada edición (Rueda / Tracker / Plan) actualiza el estado en memoria y hace **upsert** a Supabase.
5. **Cerrar sesión** limpia el estado y recarga.

El nombre de la usuaria proviene de `auth.users.user_metadata.full_name` (definido en el registro).

---

## 5. Cómo regenerar el build

```bash
bash Paulina/app/build-ghl.sh
```
Inyecta `styles.css` + `app.js` dentro de `dist/mi-barco-ghl.html`.

> ⚠️ En este equipo el comando `python3` apunta al *stub* de la Microsoft Store y falla. El build se
> generó con el Python real (`C:\Python313\python`). Opciones: instalar Python desde la Store, o
> actualizar `build-ghl.sh` para que use `python` con *fallback* a `python3`.

---

## 6. Pasos siguientes (configuración manual pendiente)

> Estos pasos NO se pueden automatizar desde aquí (requieren cuenta Supabase y subir el video a GHL).
> Detalle completo en `Paulina/supabase/README.md`.

1. **Crear el proyecto Supabase** en https://supabase.com.
2. **Correr la migración** `20260604000001_mi_barco_init.sql` (SQL Editor o `supabase db push`).
3. **Desactivar "Confirm email"** en Authentication → Providers → Email (registro directo).
4. **Pegar credenciales** (Project URL + anon key) en `window.MI_BARCO_CONFIG` (arriba de `app.js`).
5. **Renderizar/usar el video**: subir `remotion-visitas/out/mi-barco-login.mp4` a la biblioteca de GHL
   y pegar su URL en `VIDEO_URL` de `MI_BARCO_CONFIG`.
6. **Rebuild** (`bash Paulina/app/build-ghl.sh`) y **pegar** `dist/mi-barco-ghl.html` en el bloque
   Custom HTML de GHL.

### Verificación recomendada
- Registrar una cuenta → entrar a la app → editar Rueda/Tracker/Plan.
- Ver la fila en `mi_barco_state` (Supabase Table Editor) y, al **recargar**, que el estado vuelva igual.
- Confirmar en DevTools que **no** hay datos de la app en localStorage (solo el token `sb-...-auth-token`).
- Probar con dos cuentas que cada una ve solo su estado (RLS).

---

## 7. Decisiones de diseño

- **Login obligatorio** (gate completo, como el dashboard de Lina).
- **Empezar limpio en la nube**: no se migran datos anónimos previos de localStorage; la nube es la
  única fuente de verdad.
- **La anon key es pública** por diseño; la seguridad la da el RLS. Nunca usar la `service_role` en el cliente.
