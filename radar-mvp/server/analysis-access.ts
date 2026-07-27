/**
 * Quién puede forzar un re-análisis de IA.
 *
 * `refresh:true` no es un detalle de caché: descarta el análisis guardado, dispara
 * una llamada de pago a OpenAI y sobrescribe `features.ai_analysis` del inmueble
 * con la llave de servicio. Hasta 2026-07-27 el endpoint lo aceptaba de forma
 * anónima, así que cualquiera podía quemar cuota y mutar datos del producto sin
 * identidad detrás.
 *
 * Regla: solo un administrador autenticado fuerza el recálculo. Para el resto el
 * flag se ignora en silencio y se devuelve el análisis cacheado — que es
 * exactamente lo que la interfaz pide hoy (`app.js:1280` nunca manda `refresh`).
 *
 * Se aísla en su propio módulo, sin dependencias, para poder probar la decisión
 * sin levantar el servidor ni tocar Supabase.
 */

export interface SolicitanteAnalisis {
  id: string;
  role?: 'user' | 'admin';
}

/** ¿Se honra el `refresh` que viene en el cuerpo de la petición? */
export function puedeForzarAnalisis(
  pedido: unknown,
  solicitante: SolicitanteAnalisis | null,
): boolean {
  if (pedido !== true) return false;
  return solicitante?.role === 'admin';
}
