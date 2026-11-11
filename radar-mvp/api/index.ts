/**
 * Punto de entrada en Vercel.
 *
 * Vercel no arranca un proceso que escuche un puerto: cada peticion entra en una
 * funcion, y el fichero de `api/` tiene que exportar el manejador por defecto.
 * Asi que aqui no hay logica: toda vive en `server/index.ts`, igual que cuando el
 * Radar corre como servidor propio en un contenedor. Los dos caminos usan la
 * MISMA funcion, para que no puedan separarse.
 *
 * `server/index.ts` detecta que esta en Vercel (la variable VERCEL) y entonces no
 * abre puerto ni precalienta: precalentar en cada instancia fria se cobraria en el
 * tiempo de la primera peticion, que es justo lo que no se quiere.
 *
 * Lo que eso cuesta, y conviene tener presente: las cachés de ciudad
 * (`engine/zone-comps.ts`) viven en memoria del proceso. En un contenedor son una
 * sola y se precalientan al arrancar; aqui son una por instancia, asi que la
 * PRIMERA ficha de cada ciudad en cada instancia nueva paga la carga del pool.
 */
import { manejarPeticion } from '../server/index.js';

export default manejarPeticion;
