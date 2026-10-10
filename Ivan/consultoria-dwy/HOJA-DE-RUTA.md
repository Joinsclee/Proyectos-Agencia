# La Huerta · Consultoría DWY · Hoja de ruta de Camilo

Fuentes: la propuesta «La Huerta · Propuesta consultoría DWY 6 meses (final)» (Google Docs) y el
Loom de Cristhian del 8/10/2026 «Preparación contrato agencia hotel y sistemas».
Contrato: 6 meses (octubre 2026 a marzo 2027), 1.500 USD/mes o 7.500 USD por adelantado, más el
15 % del beneficio del lanzamiento de diciembre. Equipo del cliente: Iván, Gina y Alejandro.

## Lo que me toca (según el Loom)

1. **Los sistemas.** Dejarlos listos para instalar en los computadores del equipo, que Alejandro los
   aprenda a manejar y que funcionen con **sus** cuentas y **sus** tokens.
2. **La visita al hotel** (Yotoco), para instalar. Si el contrato cierra el viernes 9, ir el
   **sábado 10** y dejar instalados **al menos los sistemas de edición**, antes de viajar el domingo 11.
3. **Prioridad: edición.** Es lo que más tiempo les quita. Después, el sistema de carruseles e
   infografías, **adaptado a su marca** (que ya está trabajada).
4. **Entregables pendientes:** el Universo de La Huerta LAB (y «lo de la vuelta», por confirmar con
   Cristhian): terminar de ajustarlos con ellos, entregarlos y enseñar a Alejandro a operarlos.
   Cristhian cree que no los usan precisamente porque nadie les enseñó.
5. **Más adelante:** subir de nivel con código y marca el embudo B2B que monte Cristhian; los
   simuladores HTML y la clase 1 a 1 con Alejandro; los skills de Meta Ads.

Decisión de fondo del Loom: esto se empaqueta como **producto vendible** (la agencia de Perú también
lo quiere). Todo lo que se prepare para La Huerta debe quedar **separado en dos capas**: el sistema
genérico (reutilizable) y la capa de marca del cliente.

## Datos y bloqueos

| Qué | Estado | Qué hace falta |
|---|---|---|
| Skill `editar-video-clee-portable` | **Paquete 0.7.0 del 9/10** (edición 0.6.0 + carruseles 0.1.2 + edicion-humana, Codex y Claude Code): reels, anuncios (9:16, 4:5, 1:1) y YouTube con la marca de La Huerta LAB, motion graphics y carruseles; instalador de doble clic y detector de caras en Windows. Probado en Windows real (CI privado `Joinsclee/paquete-sistemas-clee-ci`). Código en `~/paquete-edicion-clee` (git); kit en `instalacion/kit-windows/` | Probar con un bruto real de Iván |
| `sistema-contenido-pack` | Ya no hace falta para editar | Opcional: miniaturas, títulos, carruseles en Claude Code |
| Sistema operativo de los computadores del hotel | **Windows** (confirmado el 9/10). NVIDIA: desconocido | Sin detector de caras: encuadre manual y hoja a ojo. Pedir foto de Administrador de tareas → GPU. |
| Cuentas del cliente | Cristhian les exigió ChatGPT de pago. | Confirmar qué plan tienen, si usarán Claude además, y que la app de escritorio esté descargada. |
| «Lo de la vuelta» | No existe ningún entregable con ese nombre en disco ni en el vault (la palabra puede venir mal transcrita del audio). | Preguntárselo a Cristhian. |

## Fases y tareas

### Fase A · Antes del sábado 10 (jueves 8 y viernes 9)

| # | Tarea | Estado |
|---|---|---|
| A1 | Hoja de ruta (este archivo) | Hecho |
| A2 | **Perfil de marca de La Huerta LAB para carruseles e infografías**, sacado de lo ya aprobado: paleta y tipografías de landings y anuncios, voz de Iván, cifras con fuente y reglas de claims. → `carruseles/.carrusel/perfil-sistema.md` | Hecho |
| A3 | **Sistema de carruseles e infografías para ChatGPT**: instrucciones de Proyecto (4.100 caracteres, caben en el límite) que convierten sus vídeos, libros y PDFs en carruseles e infografías. → `carruseles/chatgpt/instrucciones-proyecto.md` | Hecho, falta probarlo en ChatGPT |
| A4 | **Kit de instalación del sistema de edición**: plan B `sistema-contenido-pack` probado en seco el 8/10 (instalador y comprobación previa bien; solo falta el modelo de whisper, que va en el USB). | Hecho |
| A5 | **Guía de la visita** y mensaje para que Alejandro tenga todo listo. → `instalacion/GUIA-VISITA-SABADO.md` y `instalacion/mensaje-al-cliente.md` | Hecho, falta enviar el mensaje |
| A6 | Validar el skill portable con un vídeo en bruto real y medir tiempo y tokens. Paquete 0.1.0 recibido e instalado; piloto con el bruto del Loom (8:39, VFR): corte completo en 39 s, A/V exacto, 0 chasquidos, 0 subtítulos perdidos. **No edita solo de principio a fin**: hay que instalarlo junto al `video-editor` del pack. 3 defectos para Cristhian. → `piloto-edicion-2026-10-08/INFORME.md` | Hecho, falta repetirlo con una toma de Iván |
| A8 | **Skill de edición 0.2.0 profesional** para entregar a Iván: corrige los 3 defectos, añade transcripción, cortes por energía, hoja de revisión, subtítulos y rótulo con su marca, música, sonoridad, QA e instalador con actualización. Probada de punta a punta (9:16 y 16:9, también instalada desde cero). → `~/paquete-edicion-clee/CHANGELOG.md` | Hecho |
| A7 | Copiar al USB: el skill portable, `sistema-contenido-pack`, `ggml-medium.bin` (1,4 GB) y `consultoria-dwy/`. | Pendiente |

### Fase B · Visita al hotel (sábado 10, si cierra el viernes)

- Instalar el sistema de edición (shorts y YouTube) en los equipos y hacer una edición completa con
  Alejandro, con un vídeo suyo.
- Dejar montado el Proyecto de ChatGPT de carruseles e infografías y sacar un carrusel con él.
- Revisar el Universo de La Huerta LAB con ellos: qué usan, qué no y por qué.
- Apuntar lo que se pueda optimizar en el hotel (lo pidió Cristhian).

### Fase C · A la vuelta (Fase 1 de la propuesta: octubre y noviembre)

- Embudo B2B: Cristhian monta el embudo base; yo lo mejoro con código y marca (la del **hotel**,
  no la de LAB).
- Skills de Meta Ads para el evergreen hacia Skool (son de texto: `ad-angles-engine`,
  `meta-ads-copywriter`), adaptados a su oferta.
- Simuladores propios en HTML en lugar de Excel, y la clase 1 a 1 con Alejandro.
- Terminar y entregar el Universo de La Huerta LAB, con formación a Alejandro.
- Skills de YouTube: miniaturas, títulos e intros (`thumbnail-prompter`, `youtube-title-generator`).

### Fase D · Producto (en paralelo)

- Con lo que funcione en La Huerta, cerrar el paquete vendible: sistema genérico + capa de marca
  del cliente + guía de instalación + sesión de formación. Siguiente cliente: la agencia de Perú.

## Reglas que no se negocian en esta cuenta

- **Dos marcas:** La Huerta LAB (formación) y La Huerta Hotel (empresas, B2B). La paleta de una en
  una pieza de la otra es un error.
- Iván **nunca promete rentabilidades** y siempre advierte que no es asesoría. Decidir «con la
  cabeza y no con el corazón».
- La foto `c2-ivan.jpg` **no es Iván**.
- Todo vídeo pasa por `edicion-humana-clee` y su `revisar.py` sin bloqueantes.
- Los botones de inscripción van directo al pago (o a WhatsApp si no hay enlace).
