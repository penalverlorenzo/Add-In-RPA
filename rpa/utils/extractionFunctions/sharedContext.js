/**
 * Shared context included in every extraction prompt.
 * Tells the model about AYMARA, email threads, languages, and image-extracted text.
 */
export const COMMON_CONTEXT = `CONTEXTO:
- Empresa receptora: AYMARA (empresa proveedora de servicios turísticos en Mendoza, Argentina)
- Los emails provienen de agencias/operadoras que derivan pasajeros
- Los emails pueden contener hilos de conversación (múltiples forwards)
- Los datos pueden estar en español, portugués o inglés
- Formato de salida: JSON estrictamente estructurado
- IMPORTANTE SOBRE TEXTO DE IMÁGENES:
  * El contenido puede incluir texto extraído de imágenes adjuntas en una sección marcada como "=== TEXTO EXTRAÍDO DE IMÁGENES ADJUNTAS ==="
  * Ese texto puede contener tablas, vouchers, confirmaciones, facturas, itinerarios, etc.
  * DEBES analizar TODO el texto (email + texto de imágenes) y extraer TODA la información relevante
  * La información del texto de imágenes tiene la MISMA PRIORIDAD que el texto del email
  * NO omitas información que solo aparezca en el texto extraído de imágenes`;
