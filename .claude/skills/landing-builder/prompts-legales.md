# Prompts para Contenido Legal

Usa estos prompts con ChatGPT para generar contenido legal personalizado para tu landing page.

## Prompt para Terminos de Servicio (TOS)

Copia este prompt y reemplaza los valores entre corchetes:

```
Eres un excelente abogado.

Necesito tu ayuda para redactar unos Terminos de Servicio sencillos para mi sitio web. Aqui tienes el contexto:

- Sitio web: https://[TU_DOMINIO]
- Nombre: [NOMBRE_APP]
- Informacion de contacto: [EMAIL_CONTACTO]
- Descripcion: [DESCRIPCION_DEL_PRODUCTO_O_SERVICIO]
- Propiedad: [DERECHOS_DEL_USUARIO - ej: "cuando compra un plan, el usuario obtiene acceso al software pero no puede revenderlo. Ofrecemos reembolso completo en 7 dias."]
- Datos de usuario recopilados: nombre, correo electronico e informacion de pago
- Recopilacion de datos no personales: cookies web
- Enlace a politica de privacidad: https://[TU_DOMINIO]/privacy-policy
- Legislacion aplicable: Espana
- Actualizaciones de los terminos: los usuarios seran notificados por correo electronico

Por favor, redacta unos Terminos de Servicio sencillos para mi sitio. Anade la fecha actual. No agregues ni expliques tu razonamiento. Respuesta:
```

### Ubicacion del archivo
`app/tos/page.tsx`

### Estructura del archivo

```tsx
import Link from "next/link";
import { getSEOTags } from "@/libs/seo";
import config from "@/config";

// PROMPT PARA CHATGPT - reemplaza los datos con los tuyos:
// [Pega el prompt de arriba como comentario para referencia futura]

export const metadata = getSEOTags({
  title: `Terminos de Servicio | ${config.appName}`,
  canonicalUrlRelative: "/tos",
});

const TOS = () => {
  return (
    <main className="max-w-xl mx-auto">
      <div className="p-5">
        <Link href="/" className="btn btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M15 10a.75.75 0 01-.75.75H7.612l2.158 1.96a.75.75 0 11-1.04 1.08l-3.5-3.25a.75.75 0 010-1.08l3.5-3.25a.75.75 0 111.04 1.08L7.612 9.25h6.638A.75.75 0 0115 10z"
              clipRule="evenodd"
            />
          </svg>
          Volver
        </Link>
        <h1 className="text-3xl font-extrabold pb-6">
          Terminos de Servicio de {config.appName}
        </h1>

        <pre
          className="leading-relaxed whitespace-pre-wrap"
          style={{ fontFamily: "sans-serif" }}
        >
          {`[PEGA AQUI LA RESPUESTA DE CHATGPT]`}
        </pre>
      </div>
    </main>
  );
};

export default TOS;
```

---

## Prompt para Politica de Privacidad

Copia este prompt y reemplaza los valores entre corchetes:

```
Eres un excelente abogado.

Necesito tu ayuda para redactar una politica de privacidad sencilla para mi sitio web. Aqui tienes el contexto:

- Sitio web: https://[TU_DOMINIO]
- Nombre: [NOMBRE_APP]
- Descripcion: [DESCRIPCION_DEL_PRODUCTO_O_SERVICIO]
- Datos de usuario recopilados: nombre, correo electronico e informacion de pago
- Recopilacion de datos no personales: cookies web
- Finalidad de la recopilacion de datos: procesamiento de pedidos y prestacion del servicio
- Comparticion de datos: no compartimos los datos con terceros
- Privacidad de los ninos: no recopilamos datos de menores de edad
- Actualizaciones de la politica de privacidad: los usuarios seran notificados por correo electronico
- Informacion de contacto: [EMAIL_CONTACTO]

Por favor, redacta una politica de privacidad sencilla para mi sitio. Anade la fecha actual. No agregues ni expliques tu razonamiento. Respuesta:
```

### Ubicacion del archivo
`app/privacy-policy/page.tsx`

### Estructura del archivo

```tsx
import Link from "next/link";
import { getSEOTags } from "@/libs/seo";
import config from "@/config";

// PROMPT PARA CHATGPT - reemplaza los datos con los tuyos:
// [Pega el prompt de arriba como comentario para referencia futura]

export const metadata = getSEOTags({
  title: `Politica de Privacidad | ${config.appName}`,
  canonicalUrlRelative: "/privacy-policy",
});

const PrivacyPolicy = () => {
  return (
    <main className="max-w-xl mx-auto">
      <div className="p-5">
        <Link href="/" className="btn btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M15 10a.75.75 0 01-.75.75H7.612l2.158 1.96a.75.75 0 11-1.04 1.08l-3.5-3.25a.75.75 0 010-1.08l3.5-3.25a.75.75 0 111.04 1.08L7.612 9.25h6.638A.75.75 0 0115 10z"
              clipRule="evenodd"
            />
          </svg>{" "}
          Volver
        </Link>
        <h1 className="text-3xl font-extrabold pb-6">
          Politica de Privacidad de {config.appName}
        </h1>

        <pre
          className="leading-relaxed whitespace-pre-wrap"
          style={{ fontFamily: "sans-serif" }}
        >
          {`[PEGA AQUI LA RESPUESTA DE CHATGPT]`}
        </pre>
      </div>
    </main>
  );
};

export default PrivacyPolicy;
```

---

## Notas Importantes

1. **Revisa siempre el contenido generado** - ChatGPT genera buen contenido base pero debes revisarlo con un abogado real si tienes dudas.

2. **Actualiza las fechas** - Asegurate de que la fecha del documento sea actual.

3. **Personaliza segun tu caso** - Si tu producto tiene caracteristicas especiales (suscripciones, reembolsos, etc.), asegurate de incluirlas en el prompt.

4. **Legislacion** - Los prompts estan configurados para legislacion espanola. Si operas en otro pais, cambia "Espana" por tu pais.

5. **Footer** - Asegurate de que el Footer tenga enlaces a estas paginas:
   - `/tos` - Terminos de Servicio
   - `/privacy-policy` - Politica de Privacidad