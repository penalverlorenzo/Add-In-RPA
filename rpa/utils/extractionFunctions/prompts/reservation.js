import { COMMON_CONTEXT } from '../sharedContext.js';

/**
 * Build reservation prompt with optional masterData (reservationTypes, statuses, sellers, clients).
 */
export function getReservationPrompt(masterData) {
    let prompt = `${COMMON_CONTEXT}

TAREA:
Extrae ÚNICAMENTE los DATOS DE RESERVA (iTraffic) del email (y del texto extraído de imágenes si está presente).`;

    if (masterData) {
        prompt += `

OPCIONES DISPONIBLES EN EL SISTEMA (debes seleccionar EXACTAMENTE uno de estos valores cuando aplique):`;
        if (masterData.reservationTypes?.length) {
            prompt += `\n\nTIPOS DE RESERVA: ${masterData.reservationTypes.map(t => `"${t}"`).join(', ')}`;
        }
        if (masterData.statuses?.length) {
            prompt += `\nESTADOS: ${masterData.statuses.map(s => `"${s}"`).join(', ')}`;
        }
        if (masterData.sellers?.length) {
            prompt += `\nVENDEDORES (primeros 20): ${masterData.sellers.slice(0, 20).map(s => `"${s}"`).join(', ')}${masterData.sellers.length > 20 ? ` ... y ${masterData.sellers.length - 20} más` : ''}`;
        }
        if (masterData.clients?.length) {
            prompt += `\nCLIENTES (primeros 20): ${masterData.clients.slice(0, 20).map(c => `"${c}"`).join(', ')}${masterData.clients.length > 20 ? ` ... y ${masterData.clients.length - 20} más` : ''}`;
        }
        prompt += `\n\nREGLA: Selecciona el valor MÁS CERCANO de las listas anteriores. Si el email dice algo similar, elige la opción que mejor coincida.`;
    }

    prompt += `

CAMPOS A EXTRAER:
- codigo: Código interno o número de expediente
- reservationType: Tipo de reserva. Si hay lista de opciones, elige una. Si no, null.
- status: Estado de la reserva según INTENCIÓN del email:
  * "CONFIRMACION [FI]" si AFIRMA/CONFIRMA: "confirmamos la reserva", "reserva confirmada", vouchers/códigos
  * "CANCELADO [CX]" si CANCELA: "cancelar la reserva", "reserva cancelada"
  * "PENDIENTE DE CONFIRMACION [PC]" si PREGUNTA/SOLICITA: "¿puedes confirmar?", "solicito cotización", "confirmar disponibilidad"
- estadoDeuda: Estado de deuda (Pagada, Pendiente, Parcial)
- reservationDate, travelDate, tourEndDate, dueDate: Fechas en YYYY-MM-DD
- seller: Vendedor o agente. Busca en firma del email. OBLIGATORIO si hay lista de opciones.
- client: Cliente a facturar (Agencia/Operador que envía el email). OBLIGATORIO si hay lista de opciones.
- contact: Nombre de la persona de contacto en la agencia
- currency: Moneda (USD, ARS, EUR, BRL, etc.)
- exchangeRate, commission: Números
- netAmount, grossAmount: Montos (números)
- tripName: Nombre del viaje o referencia (puedes usar el asunto del correo)
- productCode: Código de producto
- adults, children, infants: Cantidades (números, 0 si no se menciona)
- provider: Proveedor
- reservationCode: Código de reserva
- detailType: "hotel" | "servicio" | "eventual" | "programa" | null según el tipo principal de detalle del email

REGLAS:
- reservationType y status deben incluir el código entre corchetes cuando corresponda.
- Responde ÚNICAMENTE con JSON válido. Todos los campos deben estar presentes (usa null o 0 cuando no aplique).

{
  "codigo": "string | null",
  "reservationType": "string | null",
  "status": "string | null",
  "estadoDeuda": "string | null",
  "reservationDate": "YYYY-MM-DD | null",
  "travelDate": "YYYY-MM-DD | null",
  "tourEndDate": "YYYY-MM-DD | null",
  "dueDate": "YYYY-MM-DD | null",
  "seller": "string | null",
  "client": "string | null",
  "contact": "string | null",
  "currency": "string | null",
  "exchangeRate": 0.0,
  "commission": 0.0,
  "netAmount": 0.0,
  "grossAmount": 0.0,
  "tripName": "string | null",
  "productCode": "string | null",
  "adults": 0,
  "children": 0,
  "infants": 0,
  "provider": "string | null",
  "reservationCode": "string | null",
  "detailType": "hotel | servicio | eventual | programa | null"
}

NO incluyas markdown ni texto fuera del JSON.`;

    return prompt;
}
