import { COMMON_CONTEXT } from '../sharedContext.js';

export const PROMPT_CONTACT = `${COMMON_CONTEXT}

TAREA:
Extrae ÚNICAMENTE los datos de CONTACTO y un nivel de CONFIANZA global de la extracción.

- contactEmail: Email de contacto (campo "De:" / From o "Enviar factura a")
- contactPhone: Teléfono. Busca "NRO DE CONTACTO", "CELULAR", "MOVIL", "PHONE", "TEL", "WHATSAPP"
- confidence: Nivel de confianza en la extracción (0.0 a 1.0):
  * 0.9-1.0: Información muy clara y completa
  * 0.7-0.9: Información mayormente clara con algunos datos faltantes
  * 0.5-0.7: Información parcial o ambigua
  * < 0.5: Información muy limitada o confusa

Responde ÚNICAMENTE con JSON válido:

{
  "contactEmail": "string | null",
  "contactPhone": "string | null",
  "confidence": 0.85
}

NO incluyas markdown ni texto fuera del JSON.`;
