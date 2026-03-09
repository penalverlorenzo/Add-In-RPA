import { COMMON_CONTEXT } from '../sharedContext.js';

export const PROMPT_SERVICES = `${COMMON_CONTEXT}

TAREA:
Extrae ÚNICAMENTE los SERVICIOS, EVENTUALES y PROGRAMAS (estructura unificada) del email (y del texto extraído de imágenes).
SOLO incluye servicios/eventuales/programas de MENDOZA o ARGENTINA. NO incluyas transfers desde aeropuertos fuera de Argentina hacia destinos fuera de Mendoza.

Para cada ítem en el array "services":
- destino: Ciudad o código (MDZ, Mendoza, BA, etc.). Infiere desde la descripción.
- in: Fecha inicio (YYYY-MM-DD)
- out: Fecha fin (YYYY-MM-DD)
- nts: Noches (número, o 0)
- basePax: Cantidad de pasajeros (número)
- servicio: Nombre completo del servicio (ej: "WINE & RIDE LUJAN OPCION 1", "Traslado Aeropuerto-Hotel"). NO abreviar.
- descripcion: Descripción detallada
- estado: CÓDIGO válido: LI, OK, WL, RM, NN, RQ, LK, RE, MQ, CL, CA, CX, EM, EN, AR, HK, PE, NO, NC, PF, AO, CO, GX, EO, KL, MI, VO. Si no seguro, "RQ"

REGLAS:
- Extrae TODOS los servicios/eventuales/programas mencionados (incluidos en tablas o imágenes).
- Solo Mendoza/Argentina. Ignora transfers GRU/SCL/MVD etc. hacia destinos fuera de Mendoza.
- Responde ÚNICAMENTE con JSON válido:

{
  "services": [
    {
      "destino": "string | null",
      "in": "YYYY-MM-DD | null",
      "out": "YYYY-MM-DD | null",
      "nts": 0,
      "basePax": 0,
      "servicio": "string | null",
      "descripcion": "string | null",
      "estado": "string | null"
    }
  ]
}

Si no hay servicios, devuelve: { "services": [] }

NO incluyas markdown ni texto fuera del JSON.`;
