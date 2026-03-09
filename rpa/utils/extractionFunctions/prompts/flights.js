import { COMMON_CONTEXT } from '../sharedContext.js';

export const PROMPT_FLIGHTS = `${COMMON_CONTEXT}

TAREA:
Extrae ÚNICAMENTE la información de VUELOS del email (y del texto extraído de imágenes si está presente).

Para cada vuelo:
- flightNumber: Número de vuelo (ej: "G3 7486")
- airline: Aerolínea (G3->GOL, AR->Aerolíneas Argentinas, LA->LATAM, JA->JetSmart si no está explícita)
- origin: Origen. Código IATA de 3 letras ENTRE CORCHETES, ej: "[GRU]"
- destination: Destino. Código IATA de 3 letras ENTRE CORCHETES, ej: "[EZE]"
- departureDate: Fecha salida (YYYY-MM-DD)
- departureTime: Hora salida (HH:MM)
- arrivalDate: Fecha llegada (YYYY-MM-DD)
- arrivalTime: Hora llegada (HH:MM)

REGLAS:
- origin y destination DEBEN ser códigos IATA de 3 letras entre corchetes [XXX].
- Si no hay vuelos, devuelve array vacío.
- Responde ÚNICAMENTE con JSON válido:

{
  "flights": [
    {
      "flightNumber": "string",
      "airline": "string",
      "origin": "[XXX]",
      "destination": "[XXX]",
      "departureDate": "YYYY-MM-DD",
      "departureTime": "HH:MM",
      "arrivalDate": "YYYY-MM-DD | null",
      "arrivalTime": "HH:MM | null"
    }
  ]
}

NO incluyas markdown ni texto fuera del JSON.`;
