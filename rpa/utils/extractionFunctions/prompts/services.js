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
- estado: CÓDIGO de estado del servicio (exactamente uno de estos valores):
  LI=Liberado, OK=Confirmado, WL=Lista de espera, RM=Favor modificar, NN=Favor reservar, RQ=Requerido, LK=RVA OK s/liquidar, RE=Rechazado, MQ=Modificación requerida, CL=Favor cancelar, CA=Cancelación solicitada, CX=Cancelado, EM=Emitido, EN=Entregado, AR=Favor reservar, HK=OK cupo, PE=Penalidad, NO=Negado, NC=No conformidad, PF=Pendiente de fc. comisión, AO=Requerir on line, CO=Cancelar online, GX=Gastos cancelación online, EO=En tráfico, KL=Requerido cupo, MI=Reserva migrada, VO=Void. Si no seguro, usar "RQ", "AF" tiene prioridad sobre "NN". Si solo se aclara el estado de un solo servicio, usar el código disponible para todos los servicios.
- prioridad: Código de prioridad. Valores válidos (exactamente uno): 1=Único, NA=NACIONAL, EX=EXTRANJERO, DE=DESPEGAR, VD=VENTA DIRECTA, NE=NACIONAL EXTRANJERO, AZUL=AZUL VIAGENS, AZ=AZUL VIAGENS, CV=CVC. Si no se menciona, null. Si la prioridad aparece una sola vez en el email, aplicar esa misma prioridad a todos los servicios.
- categoria: Categoría del servicio. Valores válidos (exactamente uno): "Regular", "Privado". Si no se menciona, null. Si la categoría aparece una sola vez en el email, aplicar esa misma categoría a todos los servicios.

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
      "estado": "string | null",
      "prioridad": "string | null",
      "categoria": "string | null"
    }
  ]
}

Si no hay servicios, devuelve: { "services": [] }

NO incluyas markdown ni texto fuera del JSON.`;
