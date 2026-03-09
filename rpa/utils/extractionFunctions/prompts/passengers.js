import { COMMON_CONTEXT } from '../sharedContext.js';

export const PROMPT_PASSENGERS = `${COMMON_CONTEXT}

TAREA:
Extrae ÚNICAMENTE la lista de PASAJEROS del email (y del texto extraído de imágenes si está presente).

PASAJEROS (Array de objetos):
- firstName: Primer nombre
- lastName: Apellido(s)
- documentType: CÓDIGO: "DNI" | "PAS" | "CI" | "LE" | "LC". Si no se menciona, usa "DNI"
- documentNumber: Número de documento
- nationality: NOMBRE COMPLETO del país en MAYÚSCULAS (ARGENTINA, BRASIL, CHILE, URUGUAY, etc.). Si no estás seguro, null
- dateOfBirth: Fecha de nacimiento (YYYY-MM-DD)
- sex: CÓDIGO "M" o "F". Si no estás seguro, null
- cuilCuit: CUIT/CUIL (si está disponible)
- direccion: Dirección (si está disponible)
- phoneNumber: Teléfono. Busca "NRO DE CONTACTO", "CEL", "TEL", "WHATSAPP", etc.
- passengerType: CÓDIGO "ADU" | "CHD" | "INF". Si no se especifica, "ADU"

REGLAS:
- Extrae TODOS los pasajeros mencionados (en email e imágenes)
- Si un dato no está presente, usa null
- Responde ÚNICAMENTE con JSON válido en este formato:

{
  "passengers": [
    {
      "firstName": "string",
      "lastName": "string",
      "documentType": "DNI | PAS | CI | LE | LC | null",
      "documentNumber": "string | null",
      "nationality": "string | null",
      "dateOfBirth": "YYYY-MM-DD | null",
      "sex": "M | F | null",
      "cuilCuit": "string | null",
      "direccion": "string | null",
      "phoneNumber": "string | null",
      "passengerType": "ADU | CHD | INF"
    }
  ]
}

NO incluyas ningún otro campo. NO incluyas markdown ni texto fuera del JSON.`;
