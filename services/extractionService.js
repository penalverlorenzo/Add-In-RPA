/**
 * Extraction Service - Email Reservation Data Extraction
 * Extracts structured reservation information from email chains using Azure OpenAI
 */

import { AzureOpenAI } from 'openai';
import config from '../config/index.js';
import { searchServices } from './servicesExtractionService.js';
import { servicesList } from '../rpa/helpers/servicesList.js';

let openaiClient = null;

function getOpenAIClient() {
    if (!openaiClient && config.openai.apiKey && config.openai.endpoint) {
        openaiClient = new AzureOpenAI({
            apiKey: config.openai.apiKey,
            endpoint: config.openai.endpoint,
            apiVersion: config.openai.apiVersion
        });
    }
    return openaiClient;
}

/**
 * Find matching services in email content using regex
 * @param {string} emailContent - Email content to search
 * @returns {Array} Array of matched service names
 */
function findMatchingServices(emailContent) {
    if (!emailContent || typeof emailContent !== 'string') {
        return [];
    }

    const matches = [];
    const normalizedContent = emailContent.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Normalize to uppercase and remove accents
    
    for (const service of servicesList) {
        // Normalize service name for comparison
        const normalizedService = service.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Create regex pattern - escape special characters and make it flexible
        const escapedService = normalizedService.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Try exact match first
        if (normalizedContent.includes(normalizedService)) {
            matches.push(service);
            continue;
        }
        
        // Try flexible match - split by spaces and check if all words are present
        const serviceWords = normalizedService.split(/\s+/).filter(w => w.length > 2); // Filter out short words
        if (serviceWords.length > 0) {
            const allWordsPresent = serviceWords.every(word => {
                // Check if word exists in content (with word boundaries for better matching)
                const wordPattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return wordPattern.test(emailContent);
            });
            
            if (allWordsPresent && serviceWords.length >= 2) { // At least 2 words must match
                matches.push(service);
            }
        }
    }
    
    // Remove duplicates and return
    return [...new Set(matches)];
}

/**
 * System prompt for reservation data extraction
 */
const EXTRACTION_SYSTEM_PROMPT = `Eres un asistente especializado en extraer información estructurada de emails relacionados con reservas turísticas.

CONTEXTO:
- Empresa receptora: AYMARA (empresa proveedora de servicios turísticos en Mendoza, Argentina)
- Los emails provienen de agencias/operadoras que derivan pasajeros
- Los emails pueden contener hilos de conversación (múltiples forwards)
- Los datos pueden estar en español, portugués o inglés
- Formato de salida: JSON estrictamente estructurado

TAREA:
Extrae la siguiente información de los emails, prestando especial atención a los campos requeridos por el sistema "iTraffic":

1. PASAJEROS (Array de objetos):
   - firstName: Primer nombre
   - lastName: Apellido(s)
   - documentType: Tipo de documento. DEBE ser un CÓDIGO válido. Analiza el texto y selecciona el que más coincida:
     * "DNI" para: DNI, Documento Nacional de Identidad, documento, doc
     * "PAS" para: Pasaporte, Passport, Passaporte
     * "CI" para: Cédula de Identidad, CI, cedula
     * "LE" para: Libreta de Enrolamiento, LE
     * "LC" para: Libreta Cívica, LC
     * Si no estás seguro o no se menciona, usa "DNI"
   - documentNumber: Número de documento
   - nationality: Nacionalidad. DEBE ser el NOMBRE COMPLETO del país en MAYÚSCULAS. Analiza el texto y selecciona:
     * "ARGENTINA" para: Argentina, argentino/a, ARG, AR
     * "BRASIL" para: Brasil, brasileño/a, brasilero/a, BRA, BR
     * "CHILE" para: Chile, chileno/a, CHL, CL
     * "URUGUAY" para: Uruguay, uruguayo/a, URY, UY
     * "PARAGUAY" para: Paraguay, paraguayo/a, PRY, PY
     * "BOLIVIA" para: Bolivia, boliviano/a, BOL, BO
     * "PERU" para: Perú, peruano/a, PER, PE
     * "COLOMBIA" para: Colombia, colombiano/a, COL, CO
     * "VENEZUELA" para: Venezuela, venezolano/a, VEN, VE
     * "ECUADOR" para: Ecuador, ecuatoriano/a, ECU, EC
     * "MEXICO" para: México, mexicano/a, MEX, MX
     * "ESPAÑA" para: España, español/a, ESP, ES
     * "ESTADOS UNIDOS" para: Estados Unidos, estadounidense, USA, US
     * Si no estás seguro, dejalo vacio
   - dateOfBirth: Fecha de nacimiento (formato YYYY-MM-DD)
   - sex: Sexo del pasajero. DEBE ser un CÓDIGO:
     * "M" para: masculino, hombre, male, macho, M
     * "F" para: femenino, mujer, female, F
     * Si no estás seguro, dejalo vacio
   - cuilCuit: CUIT/CUIL del pasajero (si está disponible)
   - direccion: Dirección del pasajero (si está disponible)
   - phoneNumber: Teléfono del pasajero (si está disponible). Busca formatos como "NRO DE CONTACTO", "CEL", "TEL", "WHATSAPP", etc.
   - passengerType: Tipo de pasajero. DEBE ser un CÓDIGO:
     * "ADU" para: adulto, adult, mayor, ADT
     * "CHD" para: niño, child, menor, kid
     * "INF" para: infante, infant, bebé, baby
     * Si no se especifica, usa "ADU"

2. DATOS DE RESERVA (ITRAFFIC):
   - codigo: Código interno o número de expediente (si aparece)
   - reservationType: Tipo de reserva. Ejemplos:
     * "AGENCIAS [COAG]" para agencias
     * "MAYORISTA [COMA]" para mayoristas
     * "DIRECTO [CODI]" para directo
     * "CORPORATIVA [COCO]" para corporativa
     * Si no estás seguro, dejalo vacio
   - status: Estado de la reserva. Analiza el CONTEXTO COMPLETO, TONO e INTENCIÓN del email para determinar el estado correcto:
     * "CONFIRMACION [FI]" si el email AFIRMA o CONFIRMA algo: "confirmamos la reserva", "reserva confirmada", "confirmo la reserva", "todo listo", "reserva aprobada", "confirmado", incluye vouchers/códigos/números de reserva
     * "CANCELADO [CX]" si el email CANCELA algo: "cancelar la reserva", "necesito cancelar", "cancelo la reserva", "reserva cancelada", "se canceló"
     * "PENDIENTE DE CONFIRMACION [PC]" si el email PREGUNTA o SOLICITA algo: "¿puedes confirmar?", "necesito confirmación", "confirmar disponibilidad", "solicito cotización", "consulta de disponibilidad", "cotización", "presupuesto", "solicitud de reserva", "quiero reservar"
     * Si no encuentras indicadores claros, usa "PENDIENTE DE CONFIRMACION [PC]"
   - estadoDeuda: Estado de deuda (ej: "Pagada", "Pendiente", "Parcial")
   - reservationDate: Fecha de alta de la reserva (YYYY-MM-DD)
   - travelDate: Fecha de inicio del viaje (YYYY-MM-DD)
   - tourEndDate: Fecha de fin del viaje (YYYY-MM-DD)
   - dueDate: Fecha de vencimiento de la reserva (YYYY-MM-DD)
   - seller: Vendedor o agente responsable. Busca en la firma del email (ej: "Atentamente, Nombre" o "Equipe...").
   - client: Cliente a facturar. DEBE ser el nombre de la Agencia/Operador que envía el email, NO el pasajero.
     Busca nombres como "DESPEGAR", "ALMUNDO", "GRAYLINE", nombre de la agencia remitente, etc.
     Si no encuentras el nombre de la agencia, dejalo vacio
   - contact: Nombre de la persona de contacto en la agencia/cliente
   - currency: Moneda de la transacción (ej: "USD", "ARS", "EUR", "BRL"). Si no está explícita, intenta deducirla por el país de la agencia (ej: CVC Brasil -> BRL).
   - exchangeRate: Tipo de cambio (si se menciona explícitamente)
   - commission: Porcentaje de comisión (si se menciona)
   - netAmount: Monto neto (si se menciona)
   - grossAmount: Monto bruto (si se menciona)
   - tripName: Nombre del viaje o referencia. Usa el ASUNTO del correo si no hay un nombre de grupo específico.
   - productCode: Código de producto (si aparece)
   - adults: Cantidad de adultos
   - children: Cantidad de menores
   - infants: Cantidad de infantes

3. TIPO DE DETALLE Y INFORMACIÓN RESPECTIVA:
   DEBES identificar el tipo de detalle que se está solicitando o confirmando en el email. Analiza el contenido para determinar si es:
   
   - "hotel": Cuando el email menciona alojamiento, hotel, hospedaje, check-in, check-out, habitación, room, accommodation
   
   - "servicio": Cuando el email menciona servicios adicionales como transfers, excursiones, comidas, tours, actividades, servicios turísticos
   
   - "eventual": Cuando el email menciona eventos, actividades especiales, fiestas, celebraciones, eventos corporativos
   
   - "programa": Cuando el email menciona programas de viaje, paquetes turísticos, itinerarios completos, circuitos
   
   IMPORTANTE: Todos los tipos de detalle (hotel, servicio, eventual, programa) utilizan la MISMA estructura de datos:
   
   Para cada detalle, extrae la siguiente información:
   - destino: Destino o ubicación (Texto). DEBES INFERIR el destino analizando inteligentemente la información disponible:
     * CRÍTICO: Este campo se usará para buscar en Azure Search, donde la ciudad puede ser un código (ej: "MDZ" para Mendoza) o nombre completo
     * Analiza la DESCRIPCIÓN del detalle para encontrar referencias a ciudades, regiones o destinos
     * Busca nombres de ciudades mencionadas explícitamente (ej: "Mendoza", "Buenos Aires", "Bariloche", "MDZ", "BA")
     * Si encuentras códigos de ciudad (ej: "MDZ", "BA", "COR"), úsalos directamente
     * Si la descripción menciona "ciudad de [X]", "en [X]", "a [X]", usa esa ciudad como destino
     * Si el nombre del servicio/hotel/programa contiene referencias geográficas (ej: "Mendocino" → "Mendoza"), infiere el destino
     * Busca en todo el contexto del email, no solo en el campo específico
     * Ejemplos:
       - Descripción: "Mendocino Sunset: Horseback Riding..." → destino: "Mendoza" o "MDZ"
       - Descripción: "Traslados a hoteles en el centro de la ciudad de Mendoza" → destino: "Mendoza" o "MDZ"
       - Descripción: "Tour por Buenos Aires" → destino: "Buenos Aires" o "BA"
       - Nombre del hotel: "Hotel Mendoza Plaza" → destino: "Mendoza" o "MDZ"
       - Si el email menciona "MDZ" → destino: "MDZ"
     * Si no encuentras referencias claras, deja null
     * Para hotel: prioriza el nombre de la ciudad sobre el nombre del hotel si ambos están disponibles
     * Para servicio/eventual/programa: extrae la ciudad o región principal mencionada
     * PRIORIZA códigos de ciudad si están disponibles en el email
   - in: Fecha de inicio/entrada (YYYY-MM-DD). CRÍTICO: Esta fecha se usará para filtrar en Azure Search. 
     * Para hotel: fecha de check-in
     * Para servicio: fecha del servicio (fecha exacta cuando se realiza el servicio)
     * Para eventual: fecha del evento
     * Para programa: fecha de inicio
     * DEBE ser una fecha válida en formato YYYY-MM-DD. Si no está clara, deja null
   - out: Fecha de fin/salida (YYYY-MM-DD). CRÍTICO: Esta fecha se usará para filtrar en Azure Search.
     * Para hotel: fecha de check-out
     * Para servicio: fecha de fin del servicio (si aplica, de lo contrario usa la misma que "in")
     * Para eventual: fecha de fin del evento (si aplica)
     * Para programa: fecha de fin
     * DEBE ser una fecha válida en formato YYYY-MM-DD. Si no está clara, deja null
   - nts: Cantidad de noches (número). Calcula la diferencia entre "out" e "in" en días. Si no se puede calcular, deja 0.
   - basePax: Pasajeros base o cantidad de pasajeros (número). Extrae la cantidad de pasajeros mencionados para este detalle específico.
   - servicio: Nombre COMPLETO y EXACTO del servicio (Texto). CRÍTICO: Este nombre se usará para buscar en Azure Search, por lo que DEBE ser el nombre completo tal como aparece en el catálogo de servicios. 
     * Para servicios: Extrae el nombre completo del servicio mencionado (ej: "WINE & RIDE LUJAN OPCION 1", "Mendocino Sunset: Horseback Riding", "Traslado Aeropuerto-Hotel")
     * NO uses abreviaciones ni descripciones genéricas. Si el email dice "Wine & Ride", usa "WINE & RIDE LUJAN" o el nombre completo que aparezca
     * Si el email menciona un código de servicio, inclúyelo en el nombre
     * Para hotel: tipo de habitación o categoría
     * Para eventual: tipo de evento completo
     * Para programa: nombre completo del programa
   - descripcion: Descripción detallada del detalle (Texto). Incluye información adicional relevante.
   - estado: Estado del detalle. DEBE ser un CÓDIGO válido de la siguiente lista:
     * "LI" - LIBERADO [LI]
     * "OK" - CONFIRMADO [OK]
     * "WL" - LISTA DE ESPERA [WL]
     * "RM" - FAVOR MODIFICAR [RM]
     * "NN" - FAVOR RESERVAR [NN]
     * "RQ" - REQUERIDO [RQ]
     * "LK" - RVA OK S/LIQUIDAR [LK]
     * "RE" - RECHAZADO [RE]
     * "MQ" - MODIFICACION REQUERIDA [MQ]
     * "CL" - FAVOR CANCELAR [CL]
     * "CA" - CANCELACION SOLICITADA [CA]
     * "CX" - CANCELADO [CX]
     * "EM" - EMITIDO [EM]
     * "EN" - ENTREGADO [EN]
     * "AR" - FAVOR RESERVAR [AR]
     * "HK" - OK CUPO [HK]
     * "PE" - PENALIDAD [PE]
     * "NO" - NEGADO [NO]
     * "NC" - NO CONFORMIDAD [NC]
     * "PF" - PENDIENTE DE FC. COMISION [PF]
     * "AO" - REQUERIR ON LINE [AO]
     * "CO" - CANCELAR ONLINE [CO]
     * "GX" - GASTOS CANCELACION ONLINE [GX]
     * "EO" - EN TRAFICO [EO]
     * "KL" - REQUERIDO CUPO [KL]
     * "MI" - RESERVA MIGRADA [MI]
     * "VO" - VOID [VO]
     
     Analiza el contexto del email para determinar el estado más apropiado:
     - Si el email confirma algo → "OK"
     - Si el email solicita reservar → "NN" o "AR"
     - Si el email solicita modificar → "RM" o "MQ"
     - Si el email cancela → "CX" o "CA"
     - Si el email está pendiente → "RQ"
     - Si no estás seguro, usa "RQ" (REQUERIDO)
   
   REGLAS ESPECÍFICAS PARA INFERIR DESTINO:
   - Busca patrones como: "ciudad de [X]", "en [X]", "a [X]", "desde [X]", "hacia [X]", "en el centro de [X]"
   - Identifica adjetivos geográficos: "Mendocino" → "Mendoza", "Porteño" → "Buenos Aires", "Cordobés" → "Córdoba"
   - Si se menciona un hotel con nombre de ciudad, usa esa ciudad (ej: "Hotel Mendoza Plaza" → "Mendoza")
   - Si la descripción menciona traslados "a/desde [X]", usa esa ciudad
   - Si hay referencias a regiones conocidas, infiere la ciudad principal (ej: "Cuyo" → "Mendoza")
   - Prioriza ciudades sobre regiones o países
   - Si encuentras múltiples ciudades, usa la más relevante al contexto del detalle
   - Ejemplos de inferencia:
     * "Mendocino Sunset: Horseback Riding..." → destino: "Mendoza" (por el adjetivo "Mendocino")
     * "Traslados a hoteles en el centro de la ciudad de Mendoza" → destino: "Mendoza" (mencionado explícitamente)
     * "Tour por Buenos Aires" → destino: "Buenos Aires"
     * "Hotel Mendoza Plaza" → destino: "Mendoza" (nombre del hotel contiene la ciudad)

4. VUELOS (Array de objetos):
   - flightNumber: Número de vuelo (ej: "G3 7486")
   - airline: Aerolínea. Si no está explícita, intenta deducirla por el código de vuelo (ej: G3->GOL, AR->Aerolíneas Argentinas, LA->LATAM, JA->JetSmart).
   - origin: Origen (código IATA de 3 letras, ej: "GRU")
   - destination: Destino (código IATA)
   - departureDate: Fecha de salida (YYYY-MM-DD)
   - departureTime: Hora de salida (HH:MM)
   - arrivalDate: Fecha de llegada (YYYY-MM-DD)
   - arrivalTime: Hora de llegada (HH:MM)

5. CONTACTO:
   - contactEmail: Email de contacto. Busca en el campo "De:" (From) o en instrucciones como "Enviar factura a".
   - contactPhone: Teléfono de contacto. Busca etiquetas como "NRO DE CONTACTO", "CELULAR", "MOVIL", "PHONE", "TEL", etc. Ejemplo: "NRO DE CONTACTO :5491161534201"

REGLAS IMPORTANTES:
- Si un dato no está presente, usa null en lugar de inventar información
- Extrae TODOS los pasajeros mencionados en el email
- Las fechas DEBEN estar en formato ISO 8601 (YYYY-MM-DD)
- Los códigos de aeropuerto DEBEN ser códigos IATA de 3 letras en MAYÚSCULAS
- Busca información en todo el hilo de emails (incluyendo forwards)
- Presta atención a tablas, listas y formatos estructurados
- Ignora firmas de email, disclaimers y contenido no relacionado con la reserva
- reservationType y status SIEMPRE deben incluir el código entre corchetes [XX] cuando corresponda
- sex debe ser CÓDIGO: "M" o "F"
- passengerType debe ser CÓDIGO: "ADU", "CHD" o "INF"
- documentType debe ser CÓDIGO: "DNI", "PAS", "CI", "LE", "LC"
- nationality debe ser NOMBRE COMPLETO en MAYÚSCULAS: "ARGENTINA", "BRASIL", "CHILE", etc.

DETECCIÓN INTELIGENTE DEL ESTADO DE LA RESERVA:
Analiza el CONTEXTO COMPLETO, TONO e INTENCIÓN del email para determinar el estado correcto.

IMPORTANTE: Lee TODO el email y determina la INTENCIÓN PRINCIPAL del remitente.

CONFIRMACION [FI] - Usa cuando la INTENCIÓN es:
- Confirmar una reserva: "confirmamos la reserva", "reserva confirmada", "confirmo la reserva"
- Notificar que algo está aprobado/listo: "todo listo", "reserva aprobada", "confirmado"
- Enviar información definitiva con vouchers, códigos, números de reserva
- El tono es afirmativo y definitivo (no pregunta, no solicita)
- Responde afirmativamente a una solicitud previa
- Ejemplos de frases: "te confirmo", "está confirmado", "confirmamos"

PENDIENTE DE CONFIRMACION [PC] - Usa cuando la INTENCIÓN es:
- Solicitar confirmación: "¿puedes confirmar?", "necesito confirmación", "confirmar disponibilidad"
- Hacer una consulta inicial: "solicito cotización", "consulta de disponibilidad", "¿tienen disponible?"
- Pedir presupuesto: "cotización", "presupuesto", "cuánto cuesta"
- Enviar una solicitud que espera respuesta: "solicitud de reserva", "quiero reservar"
- El tono es interrogativo o de solicitud (pregunta, pide, consulta)
- Ejemplos de frases: "¿me confirmas?", "necesito que confirmes", "por favor confirmar", "confirmame esta reserva"

CANCELADO [CX] - Usa cuando la INTENCIÓN es:
- Cancelar una reserva existente: "cancelar la reserva", "necesito cancelar", "cancelo la reserva"
- Notificar que algo fue cancelado: "reserva cancelada", "se canceló"

REGLAS DE INTERPRETACIÓN:
1. Si el email AFIRMA o CONFIRMA algo → CONFIRMACION [FI]
2. Si el email PREGUNTA o SOLICITA algo → PENDIENTE DE CONFIRMACION [PC]
3. Si el email CANCELA algo → CANCELADO [CX]
4. Contexto sobre gramática:
   - "Confirmar reserva" (infinitivo en título/asunto) → Analiza el cuerpo del email
   - "Confirmamos la reserva" (verbo conjugado afirmativo) → CONFIRMACION [FI]
   - "¿Puedes confirmar?" (pregunta) → PENDIENTE DE CONFIRMACION [PC]
   - "Por favor confirmar" (solicitud) → PENDIENTE DE CONFIRMACION [PC]

EJEMPLOS DE DETECCIÓN DE ESTADO (Analiza el CONTEXTO COMPLETO):
- Email dice: "Confirmar reserva" (título) + "Les confirmamos..." (cuerpo) → CONFIRMACION [FI]
- Email dice: "Confirmar reserva" (título) + "¿Pueden confirmar?" (cuerpo) → PENDIENTE DE CONFIRMACION [PC]
- Email dice: "Confirmame esta reserva por favor" → PENDIENTE DE CONFIRMACION [PC]
- Email dice: "Te confirmo la reserva" → CONFIRMACION [FI]
- Email dice: "Reserva confirmada" → CONFIRMACION [FI]
- Email dice: "Solicito cotización para 2 pasajeros" → PENDIENTE DE CONFIRMACION [PC]
- Email dice: "Necesito cancelar la reserva del día 10" → CANCELADO [CX]

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con JSON válido en este formato exacto:

{
  "passengers": [
    {
      "firstName": "string",
      "lastName": "string",
      "documentType": "DNI | PAS | CI | LE | LC | null",
      "documentNumber": "string | null",
      "nationality": "ARGENTINA | BRASIL | CHILE | ... | null",
      "dateOfBirth": "YYYY-MM-DD | null",
      "sex": "M | F | null",
      "cuilCuit": "string | null",
      "direccion": "string | null",
      "phoneNumber": "string | null",
      "passengerType": "ADU | CHD | INF"
    }
  ],
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
  "detailType": "hotel | servicio | eventual | programa | null",
  "hotel": {
    "destino": "string | null",
    "in": "YYYY-MM-DD | null",
    "out": "YYYY-MM-DD | null",
    "nts": 0,
    "basePax": 0,
    "servicio": "string | null",
    "descripcion": "string | null",
    "estado": "LI | OK | WL | RM | NN | RQ | LK | RE | MQ | CL | CA | CX | EM | EN | AR | HK | PE | NO | NC | PF | AO | CO | GX | EO | KL | MI | VO | null"
  },
  "services": [
    {
      "destino": "string | null",
      "in": "YYYY-MM-DD | null",
      "out": "YYYY-MM-DD | null",
      "nts": 0,
      "basePax": 0,
      "servicio": "string | null",
      "descripcion": "string | null",
      "estado": "LI | OK | WL | RM | NN | RQ | LK | RE | MQ | CL | CA | CX | EM | EN | AR | HK | PE | NO | NC | PF | AO | CO | GX | EO | KL | MI | VO | null"
    }
  ],
  "flights": [
    {
      "flightNumber": "string",
      "airline": "string",
      "origin": "XXX",
      "destination": "XXX",
      "departureDate": "YYYY-MM-DD",
      "departureTime": "HH:MM",
      "arrivalDate": "YYYY-MM-DD | null",
      "arrivalTime": "HH:MM | null"
    }
  ],
  "contactEmail": "string | null",
  "contactPhone": "string | null",
  "confidence": 0.85
}

El campo "confidence" debe reflejar tu nivel de confianza en la extracción (0.0 a 1.0):
- 0.9-1.0: Información muy clara y completa
- 0.7-0.9: Información mayormente clara con algunos datos faltantes
- 0.5-0.7: Información parcial o ambigua
- < 0.5: Información muy limitada o confusa

IMPORTANTE: 
- El campo "detailType" debe identificar el tipo principal de detalle solicitado o confirmado en el email
- Si el detalle es "hotel", completa el objeto "hotel" con la estructura unificada
- Si el detalle es "servicio", "eventual" o "programa", agrégalo al array "services" con la estructura unificada
- Todos los tipos de detalle usan la misma estructura: destino, in, out, nts, basePax, servicio, descripcion, estado
- El campo "estado" DEBE ser uno de los códigos válidos listados arriba
- Calcula "nts" (noches) como la diferencia en días entre "out" e "in" si ambas fechas están disponibles
- Si el email menciona múltiples servicios/eventuales/programas, agrégalos todos al array "services"
- Si el email menciona un hotel, usa el objeto "hotel" (solo uno)
- Si no se puede identificar un tipo de detalle claro, deja detailType como null y completa solo los campos que encuentres

EXTRACCIÓN OPTIMIZADA PARA BÚSQUEDA EN AZURE SEARCH:
- Los servicios extraídos se usarán para buscar en Azure Search, por lo que es CRÍTICO que:
  * El campo "servicio" contenga el NOMBRE COMPLETO del servicio tal como aparece en el catálogo
  * El campo "destino" contenga la ciudad (preferiblemente código como "MDZ", "BA", "COR" si está disponible, o nombre completo)
  * Las fechas "in" y "out" estén en formato YYYY-MM-DD y sean válidas para filtrar por rango de fechas (En caso de solo recibir una fecha, usa esta fecha para ambas fechas)
  * Si el email menciona un código de servicio o referencia específica, inclúyela en el nombre del servicio
  * Si el email menciona variantes u opciones (ej: "OPCION 1", "OPCIÓN 2"), inclúyelas en el nombre del servicio

NO incluyas ningún texto adicional fuera del JSON. NO incluyas markdown code blocks.`  

/**
 * Extract reservation data from email content
 * @param {string} emailContent - Full email content (can be a chain)
 * @param {string} userId - User ID for tracking
 * @param {Object} masterData - Available options from master data (optional)
 * @returns {Promise<Object>} Extracted reservation data
 */
async function extractReservationData(emailContent, userId = 'unknown', masterData = null) {
    const client = getOpenAIClient();
    if (!client) {
        throw new Error('OpenAI client not configured. Please check your .env file.');
    }

    // Validate input
    if (!emailContent || emailContent.trim().length < 50) {
        throw new Error('Email content is too short or empty');
    }

    // Truncate very long emails (keep within token limits)
    const maxLength = 12000; // ~3000 tokens
    const truncatedContent = emailContent.length > maxLength 
        ? emailContent.substring(0, maxLength) + '\n\n[...contenido truncado por límite de tokens...]'
        : emailContent;

    console.log(`🔍 Extracting reservation data for user ${userId}`);
    console.log(`📧 Email content length: ${emailContent.length} chars (truncated: ${truncatedContent.length})`);

    // Find matching services in email content using regex
    const matchedServices = findMatchingServices(emailContent);
    console.log(`🔍 Found ${matchedServices.length} matching service(s) in email:`, matchedServices);

    // Build enhanced prompt with master data context
    let systemPrompt = EXTRACTION_SYSTEM_PROMPT;
    
    // Add services list to prompt for AI reference
    if (servicesList && servicesList.length > 0) {
        systemPrompt += `\n\n=== LISTA DE SERVICIOS DISPONIBLES ===\n`;
        systemPrompt += `IMPORTANTE: Busca en el email si se menciona alguno de estos servicios. Si encuentras un servicio mencionado, usa el NOMBRE EXACTO de esta lista:\n\n`;
        
        // Show first 50 services to avoid token limit
        const servicesToShow = servicesList.slice(0, 50);
        servicesToShow.forEach((service, index) => {
            systemPrompt += `${index + 1}. "${service}"\n`;
        });
        if (servicesList.length > 50) {
            systemPrompt += `... y ${servicesList.length - 50} servicios más\n`;
        }
        systemPrompt += `\n`;
    }
    
    // If we found matching services, tell AI to use them
    if (matchedServices.length > 0) {
        systemPrompt += `\n=== SERVICIOS DETECTADOS EN EL EMAIL ===\n`;
        systemPrompt += `Se detectaron los siguientes servicios en el email usando búsqueda automática:\n`;
        matchedServices.forEach((service, index) => {
            systemPrompt += `${index + 1}. "${service}"\n`;
        });
        systemPrompt += `\nIMPORTANTE: Para estos servicios detectados, NO necesitas extraer el nombre del servicio (ya lo tenemos). `;
        systemPrompt += `Solo extrae: destino, in, out, nts, basePax, descripcion, estado. `;
        systemPrompt += `Usa el nombre del servicio EXACTO de la lista de arriba.\n\n`;
    }
    
    if (masterData) {
        systemPrompt += `\n\n=== OPCIONES DISPONIBLES EN EL SISTEMA ===\n`;
        systemPrompt += `IMPORTANTE: Debes seleccionar EXACTAMENTE uno de estos valores disponibles:\n\n`;
        
        if (masterData.reservationTypes && masterData.reservationTypes.length > 0) {
            systemPrompt += `TIPOS DE RESERVA DISPONIBLES:\n`;
            masterData.reservationTypes.forEach(type => {
                systemPrompt += `- "${type}"\n`;
            });
            systemPrompt += `\n`;
        }
        
        if (masterData.statuses && masterData.statuses.length > 0) {
            systemPrompt += `ESTADOS DISPONIBLES:\n`;
            masterData.statuses.forEach(status => {
                systemPrompt += `- "${status}"\n`;
            });
            systemPrompt += `\n`;
        }
        
        if (masterData.sellers && masterData.sellers.length > 0) {
            systemPrompt += `VENDEDORES DISPONIBLES:\n`;
            masterData.sellers.slice(0, 20).forEach(seller => {
                systemPrompt += `- "${seller}"\n`;
            });
            if (masterData.sellers.length > 20) {
                systemPrompt += `... y ${masterData.sellers.length - 20} más\n`;
            }
            systemPrompt += `\n`;
        }
        
        if (masterData.clients && masterData.clients.length > 0) {
            systemPrompt += `CLIENTES DISPONIBLES:\n`;
            masterData.clients.slice(0, 20).forEach(client => {
                systemPrompt += `- "${client}"\n`;
            });
            if (masterData.clients.length > 20) {
                systemPrompt += `... y ${masterData.clients.length - 20} más\n`;
            }
            systemPrompt += `\n`;
        }
        
        systemPrompt += `REGLA CRÍTICA: Debes seleccionar el valor MÁS CERCANO de las listas anteriores.\n`;
        systemPrompt += `Si el email menciona algo similar pero no exacto, elige la opción que mejor coincida semánticamente.\n`;
        systemPrompt += `Por ejemplo:\n`;
        systemPrompt += `- Si el email dice "agencia" y tienes "AGENCIAS [COAG]", usa "AGENCIAS [COAG]"\n`;
        systemPrompt += `- Si el email dice "confirmado" y tienes "CONFIRMADA [CO]", usa "CONFIRMADA [CO]"\n`;
        systemPrompt += `- Si el email menciona un cliente similar a uno de la lista, usa el de la lista\n`;
        
        console.log('📋 Prompt enriquecido con datos maestros del sistema');
    }

    try {
        const response = await client.chat.completions.create({
            model: config.openai.deployment || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Extrae la información de reserva del siguiente email:\n\n${truncatedContent}` }
            ],
            temperature: 0.2, // Low temperature for more deterministic extraction
            max_tokens: 2000,
            top_p: 0.95,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content.trim();
        console.log(`✅ OpenAI response received (${content.length} chars)`);

        // Parse JSON response
        let extractedData;
        try {
            extractedData = JSON.parse(content);
        } catch (parseError) {
            console.error('❌ Failed to parse OpenAI response as JSON:', content);
            throw new Error('OpenAI returned invalid JSON format');
        }

        // Validate and normalize extracted data
        const validatedData = validateExtractionResult(extractedData);

        // If we found services via regex, merge them with extracted services
        if (matchedServices.length > 0) {
            console.log(`🔗 Merging ${matchedServices.length} regex-matched service(s) with extracted services...`);
            
            // For each matched service, check if it's already in extracted services
            for (const matchedService of matchedServices) {
                const normalizedMatched = matchedService.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                
                // Check if this service is already in the extracted services
                const alreadyExists = validatedData.services.some(extractedService => {
                    if (!extractedService.servicio) return false;
                    const normalizedExtracted = extractedService.servicio.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return normalizedExtracted === normalizedMatched || 
                           normalizedExtracted.includes(normalizedMatched) || 
                           normalizedMatched.includes(normalizedExtracted);
                });
                
                // If not found, add it with the matched name
                if (!alreadyExists) {
                    validatedData.services.push({
                        servicio: matchedService,
                        destino: null,
                        in: null,
                        out: null,
                        nts: 0,
                        basePax: 0,
                        descripcion: null,
                        estado: 'RQ'
                    });
                    console.log(`  ➕ Added matched service: ${matchedService}`);
                } else {
                    // Update existing service with matched name if it's more complete
                    const existingService = validatedData.services.find(extractedService => {
                        if (!extractedService.servicio) return false;
                        const normalizedExtracted = extractedService.servicio.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        return normalizedExtracted === normalizedMatched || 
                               normalizedExtracted.includes(normalizedMatched) || 
                               normalizedMatched.includes(normalizedExtracted);
                    });
                    
                    if (existingService && matchedService.length > existingService.servicio.length) {
                        existingService.servicio = matchedService;
                        console.log(`  ✏️ Updated service name to: ${matchedService}`);
                    }
                }
            }
        }

        // Enrich services with Azure Search data
        if (validatedData.services && validatedData.services.length > 0) {
            try {
                console.log(`🔍 Enriching ${validatedData.services.length} service(s) with Azure Search data...`);
                const enrichedServices = await searchServices(validatedData, emailContent, matchedServices);
                validatedData.services = enrichedServices;
                console.log(`✅ Services enriched: ${enrichedServices.length} service(s)`);
            } catch (error) {
                console.error('⚠️ Error enriching services with Azure Search, using original services:', error.message);
                // Continue with original services if enrichment fails
            }
        }

        // Add metadata
        validatedData.extractedAt = new Date().toISOString();
        validatedData.userId = userId;
        validatedData.modelUsed = config.openai.deployment || 'gpt-4o-mini';
        validatedData.emailContentLength = emailContent.length;

        console.log(`✅ Extraction completed successfully`);
        console.log(`   Passengers: ${validatedData.passengers?.length || 0}`);
        console.log(`   Client: ${validatedData.client || 'N/A'}`);
        console.log(`   Travel Date: ${validatedData.travelDate || 'N/A'}`);
        console.log(`   Services: ${validatedData.services?.length || 0}`);

        return validatedData;

    } catch (error) {
        console.error('❌ Error extracting reservation data:', error);
        
        if (error.message.includes('timeout')) {
            throw new Error('Extraction timeout: OpenAI service is taking too long');
        } else if (error.message.includes('rate limit')) {
            throw new Error('Rate limit exceeded: Please try again in a few moments');
        } else if (error.message.includes('invalid')) {
            throw new Error('Invalid email content: Unable to extract reservation data');
        }
        
        throw new Error(`Extraction failed: ${error.message}`);
    }
}


function validateTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    
    const timeRegex = /^\d{2}:\d{2}$/;
    return timeRegex.test(timeStr) ? timeStr : null;
}

function sanitizeIATACode(code) {
    if (!code || typeof code !== 'string') return null;
    
    const cleaned = code.trim().toUpperCase();
    const iataRegex = /^[A-Z]{3}$/;
    
    return iataRegex.test(cleaned) ? cleaned : null;
}

function validateEmail(email) {
    if (!email || typeof email !== 'string') return null;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmed = email.trim().toLowerCase();
    
    return emailRegex.test(trimmed) ? trimmed : null;
}
/**
 * Validate and normalize extracted reservation data
 * @param {Object} data - Raw extraction result from OpenAI
 * @returns {Object} Validated and normalized data
 */
function validateExtractionResult(data) {
    const validated = {
        passengers: [],
        // iTraffic Fields
        codigo: null,
        reservationType: null,
        status: null,
        estadoDeuda: null,
        reservationDate: null,
        travelDate: null,
        tourEndDate: null,
        dueDate: null,
        seller: null,
        client: null,
        contact: null,
        currency: null,
        exchangeRate: 0,
        commission: 0,
        netAmount: 0,
        grossAmount: 0,
        tripName: null,
        productCode: null,
        adults: 0,
        children: 0,
        infants: 0,
        
        // Legacy/Standard Fields
        provider: null,
        reservationCode: null,
        hotel: null, // Unified structure for hotel detail (object) or null
        checkIn: null, // Legacy: separate field for backward compatibility (extracted from hotel.in)
        checkOut: null, // Legacy: separate field for backward compatibility (extracted from hotel.out)
        flights: [],
        services: [], // Array of unified detail objects (servicio, eventual, programa)
        contactEmail: null,
        contactPhone: null,
        confidence: 0.5,
        
        // Detail Type Field
        detailType: null
    };

    // Validate passengers
    if (Array.isArray(data.passengers) && data.passengers.length > 0) {
        validated.passengers = data.passengers
            .filter(p => p.firstName || p.lastName) // Must have at least a name
            .map(p => ({
                firstName: sanitizeString(p.firstName),
                lastName: sanitizeString(p.lastName),
                documentType: sanitizeString(p.documentType),
                documentNumber: sanitizeString(p.documentNumber),
                nationality: sanitizeString(p.nationality),
                dateOfBirth: validateDate(p.dateOfBirth),
                sex: sanitizeString(p.sex),
                cuilCuit: sanitizeString(p.cuilCuit),
                direccion: sanitizeString(p.direccion),
                passengerType: validatePassengerType(p.passengerType),
                phoneNumber: sanitizeString(p.phoneNumber)
            }));
    }

    // Validate basic fields (Legacy/Standard)
    validated.provider = sanitizeString(data.provider);
    validated.reservationCode = sanitizeString(data.reservationCode);

    // Validate iTraffic fields
    validated.codigo = sanitizeString(data.codigo);
    validated.reservationType = sanitizeString(data.reservationType);
    validated.status = sanitizeString(data.status);
    validated.estadoDeuda = sanitizeString(data.estadoDeuda);

    validated.dueDate = validateDate(data.dueDate);
    validated.seller = sanitizeString(data.seller);
    validated.client = sanitizeString(data.client);
    validated.contact = sanitizeString(data.contact);
    validated.currency = sanitizeString(data.currency);
    validated.exchangeRate = typeof data.exchangeRate === 'number' ? data.exchangeRate : 0;
    validated.commission = typeof data.commission === 'number' ? data.commission : 0;
    validated.netAmount = typeof data.netAmount === 'number' ? data.netAmount : 0;
    validated.grossAmount = typeof data.grossAmount === 'number' ? data.grossAmount : 0;
    validated.tripName = sanitizeString(data.tripName);
    validated.productCode = sanitizeString(data.productCode);
    validated.adults = typeof data.adults === 'number' ? data.adults : 0;
    validated.children = typeof data.children === 'number' ? data.children : 0;
    validated.infants = typeof data.infants === 'number' ? data.infants : 0;

    // Validate flights
    if (Array.isArray(data.flights) && data.flights.length > 0) {
        validated.flights = data.flights
            .filter(f => f.flightNumber && f.origin && f.destination)
            .map(f => ({
                flightNumber: sanitizeString(f.flightNumber),
                airline: sanitizeString(f.airline),
                origin: sanitizeIATACode(f.origin),
                destination: sanitizeIATACode(f.destination),
                departureDate: validateDate(f.departureDate),
                departureTime: validateTime(f.departureTime),
                arrivalDate: validateDate(f.arrivalDate),
                arrivalTime: validateTime(f.arrivalTime)
            }));
    }

    // Validate detail type and related fields (unified structure)
    validated.detailType = validateDetailType(data.detailType);
    
    // Helper function to validate unified detail structure
    const validateUnifiedDetail = (detailData) => {
        if (!detailData || typeof detailData !== 'object') return null;
        
        const inDate = validateDate(detailData.in);
        const outDate = validateDate(detailData.out);
        
        // Calculate nights if both dates are available
        let nights = 0;
        if (inDate && outDate) {
            const inDateObj = new Date(inDate);
            const outDateObj = new Date(outDate);
            const diffTime = outDateObj - inDateObj;
            nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (nights < 0) nights = 0;
        } else if (typeof detailData.nts === 'number') {
            nights = detailData.nts;
        }
        
        return {
            destino: sanitizeString(detailData.destino),
            in: inDate,
            out: outDate,
            nts: nights,
            basePax: typeof detailData.basePax === 'number' ? detailData.basePax : 0,
            servicio: sanitizeString(detailData.servicio),
            descripcion: sanitizeString(detailData.descripcion),
            estado: validateDetailEstado(detailData.estado)
        };
    };
    
    // Validate hotel (unified structure as object)
    validated.hotel = validateUnifiedDetail(data.hotel);
    
    // Legacy support: populate legacy fields from hotel if available
    if (validated.hotel) {
        validated.checkIn = validated.hotel.in;
        validated.checkOut = validated.hotel.out;
    } else {
        // Legacy support: if checkIn/checkOut are separate fields
        validated.checkIn = validateDate(data.checkIn);
        validated.checkOut = validateDate(data.checkOut);
    }
    
    // Validate services (array of unified detail objects)
    // Combine servicio, eventual, programa from old format, or use services array from new format
    const servicesArray = [];
    
    // New format: services is already an array
    if (Array.isArray(data.services) && data.services.length > 0) {
        data.services.forEach(service => {
            const validatedService = validateUnifiedDetail(service);
            if (validatedService) servicesArray.push(validatedService);
        });
    }
    
    // Old format: check for servicio, eventual, programa as separate objects
    if (data.servicio && typeof data.servicio === 'object') {
        const validatedService = validateUnifiedDetail(data.servicio);
        if (validatedService) servicesArray.push(validatedService);
    }
    if (data.eventual && typeof data.eventual === 'object') {
        const validatedService = validateUnifiedDetail(data.eventual);
        if (validatedService) servicesArray.push(validatedService);
    }
    if (data.programa && typeof data.programa === 'object') {
        const validatedService = validateUnifiedDetail(data.programa);
        if (validatedService) servicesArray.push(validatedService);
    }
    
    validated.services = servicesArray;
    console.log('validated.services', validated.services);
    // Date logic: Default reservationDate to today, travelDate to checkIn, tourEndDate to checkOut
    // This must be after hotel validation so checkIn/checkOut are available
    const today = new Date().toISOString().split('T')[0];
    validated.reservationDate = validateDate(data.reservationDate) || today;
    validated.travelDate = validateDate(data.travelDate) || validated.checkIn;
    validated.tourEndDate = validateDate(data.tourEndDate) || validated.checkOut;

    // Validate contact info
    validated.contactEmail = validateEmail(data.contactEmail);
    validated.contactPhone = sanitizeString(data.contactPhone);

    // Validate confidence score
    validated.confidence = validateConfidence(data.confidence);

    // Validate RPA fields
    validated.reservationType = sanitizeString(data.reservationType) || 'AGENCIAS [COAG]';
    validated.status = sanitizeString(data.status) || 'PENDIENTE DE CONFIRMACION [PC]';
    validated.client = sanitizeString(data.client) || 'DESPEGAR - TEST - 1';
    validated.travelDate = validateDate(data.travelDate);
    validated.seller = sanitizeString(data.seller) || 'TEST TEST';

    return validated;
}

function validateConfidence(score) {
    if (typeof score !== 'number') return 0.5;
    if (score < 0) return 0;
    if (score > 1) return 1;
    return score;
}
/**
 * Helper: Sanitize string values
 */
function sanitizeString(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Helper: Validate and normalize date format to YYYY-MM-DD
 * Accepts multiple input formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
 */
function validateDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    const trimmed = dateStr.trim();
    
    // Format 1: YYYY-MM-DD (ISO format - preferred)
    const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isoMatch = trimmed.match(isoRegex);
    if (isoMatch) {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
            return trimmed;
        }
    }
    
    // Format 2: DD/MM/YYYY (European format)
    const euroRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const euroMatch = trimmed.match(euroRegex);
    if (euroMatch) {
        const [, day, month, year] = euroMatch;
        const date = new Date(year, parseInt(month) - 1, day);
        if (!isNaN(date.getTime())) {
            // Convert to YYYY-MM-DD
            const yyyy = year;
            const mm = month.padStart(2, '0');
            const dd = day.padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
    }
    
    // Format 3: MM/DD/YYYY (US format)
    const usRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const usMatch = trimmed.match(usRegex);
    if (usMatch) {
        const [, month, day, year] = usMatch;
        const date = new Date(year, parseInt(month) - 1, day);
        if (!isNaN(date.getTime())) {
            // Convert to YYYY-MM-DD
            const yyyy = year;
            const mm = month.padStart(2, '0');
            const dd = day.padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
    }
    
    // Format 4: Try to parse as generic date string
    try {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
    } catch (e) {
        // Ignore parsing errors
    }
    
    return null;
}

/**
 * Helper: Validate passenger type
 */
function validatePassengerType(type) {
    const validTypes = ['ADU', 'CHD', 'INF'];
    // Mapear ADT a ADU para compatibilidad
    if (type === 'ADT') return 'ADU';
    return validTypes.includes(type) ? type : 'ADU'; // Default to adult
}

/**
 * Helper: Validate sex
 */
function validateSex(sex) {
    if (!sex || typeof sex !== 'string') return 'M';
    const normalized = sex.trim().toUpperCase();
    return ['M', 'F'].includes(normalized) ? normalized : 'M';
}

/**
 * Helper: Normalize nationality to match master data format
 * Converts various nationality formats to uppercase country names
 */
function normalizeNationality(nationality) {
    if (!nationality || typeof nationality !== 'string') return 'ARGENTINA';
    
    const normalized = nationality.trim().toUpperCase();
    
    // Mapeo de nacionalidades comunes
    const nationalityMap = {
        // Argentina
        'ARGENTINA': 'ARGENTINA',
        'ARGENTINO': 'ARGENTINA',
        'ARGENTINA': 'ARGENTINA',
        'ARG': 'ARGENTINA',
        'AR': 'ARGENTINA',
        
        // Brasil
        'BRASIL': 'BRASIL',
        'BRAZIL': 'BRASIL',
        'BRASILEÑO': 'BRASIL',
        'BRASILERA': 'BRASIL',
        'BRASILERO': 'BRASIL',
        'BRA': 'BRASIL',
        'BR': 'BRASIL',
        
        // Chile
        'CHILE': 'CHILE',
        'CHILENO': 'CHILE',
        'CHILENA': 'CHILE',
        'CHL': 'CHILE',
        'CL': 'CHILE',
        
        // Uruguay
        'URUGUAY': 'URUGUAY',
        'URUGUAYO': 'URUGUAY',
        'URUGUAYA': 'URUGUAY',
        'URY': 'URUGUAY',
        'UY': 'URUGUAY',
        
        // Paraguay
        'PARAGUAY': 'PARAGUAY',
        'PARAGUAYO': 'PARAGUAY',
        'PARAGUAYA': 'PARAGUAY',
        'PRY': 'PARAGUAY',
        'PY': 'PARAGUAY',
        
        // Bolivia
        'BOLIVIA': 'BOLIVIA',
        'BOLIVIANO': 'BOLIVIA',
        'BOLIVIANA': 'BOLIVIA',
        'BOL': 'BOLIVIA',
        'BO': 'BOLIVIA',
        
        // Perú
        'PERU': 'PERU',
        'PERÚ': 'PERU',
        'PERUANO': 'PERU',
        'PERUANA': 'PERU',
        'PER': 'PERU',
        'PE': 'PERU',
        
        // Colombia
        'COLOMBIA': 'COLOMBIA',
        'COLOMBIANO': 'COLOMBIA',
        'COLOMBIANA': 'COLOMBIA',
        'COL': 'COLOMBIA',
        'CO': 'COLOMBIA',
        
        // Venezuela
        'VENEZUELA': 'VENEZUELA',
        'VENEZOLANO': 'VENEZUELA',
        'VENEZOLANA': 'VENEZUELA',
        'VEN': 'VENEZUELA',
        'VE': 'VENEZUELA',
        
        // Ecuador
        'ECUADOR': 'ECUADOR',
        'ECUATORIANO': 'ECUADOR',
        'ECUATORIANA': 'ECUADOR',
        'ECU': 'ECUADOR',
        'EC': 'ECUADOR',
        
        // México
        'MEXICO': 'MEXICO',
        'MÉXICO': 'MEXICO',
        'MEXICANO': 'MEXICO',
        'MEXICANA': 'MEXICO',
        'MEX': 'MEXICO',
        'MX': 'MEXICO',
        
        // España
        'ESPAÑA': 'ESPAÑA',
        'ESPANA': 'ESPAÑA',
        'ESPAÑOL': 'ESPAÑA',
        'ESPAÑOLA': 'ESPAÑA',
        'ESP': 'ESPAÑA',
        'ES': 'ESPAÑA',
        
        // Estados Unidos
        'ESTADOS UNIDOS': 'ESTADOS UNIDOS',
        'EEUU': 'ESTADOS UNIDOS',
        'USA': 'ESTADOS UNIDOS',
        'US': 'ESTADOS UNIDOS',
        'ESTADOUNIDENSE': 'ESTADOS UNIDOS',
        'AMERICANO': 'ESTADOS UNIDOS',
        'AMERICANA': 'ESTADOS UNIDOS'
    };
    
    return nationalityMap[normalized] || 'ARGENTINA';
}

function validateServiceType(type) {
    const validTypes = ['transfer', 'excursion', 'meal', 'tour', 'activity', 'other'];
    return validTypes.includes(type) ? type : 'other';
}

/**
 * Helper: Validate detail type
 */
function validateDetailType(type) {
    const validTypes = ['hotel', 'servicio', 'eventual', 'programa'];
    if (!type || typeof type !== 'string') return null;
    const normalized = type.trim().toLowerCase();
    return validTypes.includes(normalized) ? normalized : null;
}

/**
 * Helper: Validate detail estado (status code)
 */
function validateDetailEstado(estado) {
    const validEstados = [
        'LI', 'OK', 'WL', 'RM', 'NN', 'RQ', 'LK', 'RE', 'MQ', 'CL', 'CA', 'CX',
        'EM', 'EN', 'AR', 'HK', 'PE', 'NO', 'NC', 'PF', 'AO', 'CO', 'GX', 'EO',
        'KL', 'MI', 'VO'
    ];
    if (!estado || typeof estado !== 'string') return null;
    const normalized = estado.trim().toUpperCase();
    return validEstados.includes(normalized) ? normalized : null;
}
/**
 * Helper: Normalize document type to match master data codes
 */
function normalizeDocumentType(docType) {
    if (!docType || typeof docType !== 'string') return 'DNI';
    
    const normalized = docType.trim().toUpperCase();
    
    // Mapeo de tipos de documento
    const docTypeMap = {
        // DNI
        'DNI': 'DNI',
        'DOCUMENTO NACIONAL DE IDENTIDAD': 'DNI',
        'DOCUMENTO': 'DNI',
        'DOC': 'DNI',
        
        // Pasaporte
        'PAS': 'PAS',
        'PASAPORTE': 'PAS',
        'PASSPORT': 'PAS',
        'PASSAPORTE': 'PAS',
        
        // Cédula
        'CI': 'CI',
        'CEDULA': 'CI',
        'CÉDULA': 'CI',
        'CEDULA DE IDENTIDAD': 'CI',
        'CÉDULA DE IDENTIDAD': 'CI',
        
        // Libreta de Enrolamiento
        'LE': 'LE',
        'LIBRETA DE ENROLAMIENTO': 'LE',
        'LIBRETA ENROLAMIENTO': 'LE',
        
        // Libreta Cívica
        'LC': 'LC',
        'LIBRETA CIVICA': 'LC',
        'LIBRETA CÍVICA': 'LC'
    };
    
    return docTypeMap[normalized] || 'DNI';
}
function calculateQualityScore(data) {
    let score = 0;
    let maxScore = 0;

    // Passengers (most important)
    maxScore += 30;
    if (data.passengers && data.passengers.length > 0) {
        score += 20; // Has passengers
        const completePassengers = data.passengers.filter(p => 
            p.firstName && p.lastName && p.documentNumber
        ).length;
        score += (completePassengers / data.passengers.length) * 10;
    }

    // Provider
    maxScore += 15;
    if (data.provider) score += 15;

    // Hotel
    maxScore += 10;
    if (data.hotel) score += 10;

    // Dates
    maxScore += 15;
    if (data.checkIn) score += 7.5;
    if (data.checkOut) score += 7.5;

    // Flights
    maxScore += 15;
    if (data.flights && data.flights.length > 0) {
        score += 15;
    }

    // Services
    maxScore += 10;
    if (data.services && data.services.length > 0) {
        score += 10;
    }

    // Contact
    maxScore += 5;
    if (data.contactEmail) score += 5;

    return Math.round((score / maxScore) * 100) / 100; // Normalize to 0-1
}

export {
    extractReservationData,
    validateExtractionResult,
    calculateQualityScore,
    EXTRACTION_SYSTEM_PROMPT
};
