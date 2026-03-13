import { COMMON_CONTEXT } from '../sharedContext.js';

export const PROMPT_HOTEL = `${COMMON_CONTEXT}

TAREA:
Extrae ÚNICAMENTE la información de HOTEL (alojamiento) del email (y del texto extraído de imágenes si está presente).
Solo devuelve el objeto "hotel" si encuentras mención explícita a alojamiento/hotel/hospedaje/check-in/check-out/habitación.

Para HOTEL:
- nombre_hotel: Nombre del hotel SIN la palabra "Hotel" al inicio. OBLIGATORIO para devolver hotel. Si no hay nombre claro, devuelve "hotel": null.
  Ejemplos: "Hotel Sheraton Mendoza" → "Sheraton", "Hotel Juanes de Sol Mendoza" → "Juanes de Sol"
- tipo_habitacion: CÓDIGO "SGL" | "DWL" | "TPL" | "CPL" (single, doble, triple, cuádruple). Predeterminado "DWL"
- Ciudad: Ciudad del hotel (ej: "Mendoza", "MDZ", "Buenos Aires")
- Categoria: Categoría de habitación (ej: "Habitacion Clasica", "Suite", "Deluxe")
- in: Fecha check-in (YYYY-MM-DD)
- out: Fecha check-out (YYYY-MM-DD)
- prioridad: Código de prioridad. Valores válidos (exactamente uno): 1=Único, NA=NACIONAL, EX=EXTRANJERO, DE=DESPEGAR, VD=VENTA DIRECTA, NE=NACIONAL EXTRANJERO, AZUL=AZUL VIAGENS, AZ=AZUL VIAGENS, CV=CVC. Si no se menciona, null. Si la prioridad aparece una sola vez en el email (para hotel o servicios), usar esa misma prioridad para el hotel.

REGLA CRÍTICA: Solo devuelve el objeto "hotel" si puedes extraer nombre_hotel. Si no hay nombre de hotel identificable, devuelve "hotel": null.

Responde ÚNICAMENTE con JSON válido:

{
  "hotel": {
    "nombre_hotel": "string | null",
    "tipo_habitacion": "SGL | DWL | TPL | CPL | null",
    "Ciudad": "string | null",
    "Categoria": "string | null",
    "in": "YYYY-MM-DD | null",
    "out": "YYYY-MM-DD | null",
    "prioridad": "string | null"
  }
}

O si no hay hotel: { "hotel": null }

NO incluyas markdown ni texto fuera del JSON.`;
