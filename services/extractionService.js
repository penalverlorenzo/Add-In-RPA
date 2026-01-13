/**
 * Extraction Service - Email Reservation Data Extraction
 * Extracts structured reservation information from email chains using Azure OpenAI
 */

import { AzureOpenAI } from 'openai';
import config from '../config/index.js';

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
     * Si no estás seguro, usa dejalo vacio
   - birthDate: Fecha de nacimiento (formato DD/MM/YYYY)
   - sex: Sexo del pasajero. DEBE ser un CÓDIGO:
     * "M" para: masculino, hombre, male, macho, M
     * "F" para: femenino, mujer, female, F
     * Si no estás seguro, dejalo vacio
   - cuilCuit: CUIT/CUIL del pasajero (si está disponible)
   - direccion: Dirección del pasajero (si está disponible)
   - telefono: Teléfono del pasajero (si está disponible)
   - paxType: Tipo de pasajero. DEBE ser un CÓDIGO:
     * "ADU" para: adulto, adult, mayor
     * "CHD" para: niño, child, menor, kid
     * "INF" para: infante, infant, bebé, baby
     * Si no se especifica, usa "ADU"

2. DATOS DE RESERVA (ITRAFFIC):
   - reservationType: Tipo de reserva. Ejemplos:
     * "AGENCIAS" para agencias
     * "MAYORISTA" para mayoristas
     * "DIRECTO" para directo
     Si no estás seguro, dejalo vacio
   - status: Estado de la reserva. Analiza el contenido del email para determinar:
     * "CONFIRMACION [FI]" si el email menciona: "confirmada", "confirmado", "confirmed", "confirmar", "confirmação", "reserva confirmada", "booking confirmed"
     * "CANCELADO [CX]" si el email menciona: "cancelada", "cancelado", "cancelled", "cancelar", "cancelamento", "reserva cancelada"
     * "PENDIENTE DE CONFIRMACION [PC]" si el email menciona: "pendiente", "pending", "aguardando", "a confirmar", "por confirmar", "solicitud", "cotización", "presupuesto"
     * Si el email solicita confirmación o es una consulta inicial, usa "PENDIENTE DE CONFIRMACION [PC]"
     * Si el email confirma la reserva o dice que está todo OK, usa "CONFIRMACION [FI]"
     * Si no encuentras indicadores claros, usa "PENDIENTE DE CONFIRMACION [PC]"
   - travelDate: Fecha de inicio del viaje (formato DD/MM/YYYY, ej: "15/01/2026")
   - seller: Vendedor o agente responsable. Busca en la firma del email (ej: "Atentamente, Nombre" o "Equipe...").
   - client: Cliente a facturar. DEBE ser el nombre de la Agencia/Operador que envía el email, NO el pasajero.
     Busca nombres como "DESPEGAR", "ALMUNDO", "GRAYLINE", nombre de la agencia remitente, etc.
     Si no encuentras el nombre de la agencia, dejalo vacio

REGLAS IMPORTANTES:
- Si un dato no está presente, usa null en lugar de inventar información
- Extrae TODOS los pasajeros mencionados en el email
- Las fechas DEBEN estar en formato DD/MM/YYYY
- Busca información en todo el hilo de emails (incluyendo forwards)
- Presta atención a tablas, listas y formatos estructurados
- Ignora firmas de email, disclaimers y contenido no relacionado con la reserva

DETECCIÓN INTELIGENTE DEL ESTADO DE LA RESERVA:
Analiza el CONTEXTO COMPLETO, TONO e INTENCIÓN del email para determinar el estado correcto.

IMPORTANTE: Lee TODO el email y determina la INTENCIÓN PRINCIPAL del remitente.

CONFIRMACION [FI] - Usa cuando la INTENCIÓN es:
- Confirmar una reserva: "confirmamos la reserva", "reserva confirmada", "confirmo la reserva"
- Notificar que algo está aprobado/listo: "todo listo", "reserva aprobada", "confirmado"
- Enviar información definitiva con vouchers, códigos, números de reserva
- El tono es afirmativo y definitivo (no pregunta, no solicita)
- Responde afirmativamente a una solicitud previa
- Ejemplos de frases: "confirmar reserva", "confirmame esta reserva", "te confirmo", "está confirmado"

PENDIENTE DE CONFIRMACION [PC] - Usa cuando la INTENCIÓN es:
- Solicitar confirmación: "¿puedes confirmar?", "necesito confirmación", "confirmar disponibilidad"
- Hacer una consulta inicial: "solicito cotización", "consulta de disponibilidad", "¿tienen disponible?"
- Pedir presupuesto: "cotización", "presupuesto", "cuánto cuesta"
- Enviar una solicitud que espera respuesta: "solicitud de reserva", "quiero reservar"
- El tono es interrogativo o de solicitud (pregunta, pide, consulta)
- Ejemplos de frases: "¿me confirmas?", "necesito que confirmes", "por favor confirmar"

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

EJEMPLOS REALES:
- Email dice: "Confirmar reserva" (título) + "Les confirmamos..." (cuerpo) → CONFIRMACION [FI]
- Email dice: "Confirmar reserva" (título) + "¿Pueden confirmar?" (cuerpo) → PENDIENTE DE CONFIRMACION [PC]
- Email dice: "Confirmame esta reserva por favor" → PENDIENTE DE CONFIRMACION [PC]
- Email dice: "Te confirmo la reserva" → CONFIRMACION [FI]
- Email dice: "Reserva confirmada" → CONFIRMACION [FI]

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con JSON válido en este formato exacto:

{
    "reservationType": "AGENCIAS [COAG]",
    "status": "PENDIENTE DE CONFIRMACION [PC]",
    "client": "DESPEGAR - TEST - 1",
    "travelDate": "2026-01-15",
    "seller": "TEST TEST",
    "passengers": [{
        "firstName": "Maria",
        "lastName": "Gonzalez",
        "paxType": "ADU",
        "birthDate": "1990-01-15",
        "nationality": "ARGENTINA",
        "sex": "F",
        "documentNumber": "12345678",
        "documentType": "DNI",
        "cuilCuit": "27123456789",
        "direccion": "Calle Falsa 123",
        "telefono": "1234567890"
    }]
}

IMPORTANTE: 
- reservationType y status SIEMPRE deben incluir el código entre corchetes [XX]
- travelDate y birthDate DEBEN estar en formato DD/MM/YYYY
- client debe ser el nombre de la AGENCIA, no del pasajero
- sex debe ser CÓDIGO: "M" o "F"
- paxType debe ser CÓDIGO: "ADU", "CHD" o "INF"
- documentType debe ser CÓDIGO: "DNI", "PAS", "CI", "LE", "LC"
- nationality debe ser NOMBRE COMPLETO en MAYÚSCULAS: "ARGENTINA", "BRASIL", "CHILE", etc.

EJEMPLOS DE MAPEO DE NACIONALIDAD:
- Email dice "argentino" → nationality: "ARGENTINA"
- Email dice "brasileño" → nationality: "BRASIL"
- Email dice "chilena" → nationality: "CHILE"
- Email dice "ARG" → nationality: "ARGENTINA"

EJEMPLOS DE MAPEO DE TIPO DE DOCUMENTO:
- Email dice "DNI: 12345678" → documentType: "DNI"
- Email dice "Pasaporte: AB123456" → documentType: "PAS"
- Email dice "Documento: 12345678" → documentType: "DNI"

EJEMPLOS DE DETECCIÓN DE ESTADO (Analiza el CONTEXTO COMPLETO):

Ejemplo 1:
Email: "Asunto: Confirmar reserva | Cuerpo: Les confirmamos la reserva para 2 pasajeros..."
Análisis: El verbo "confirmamos" es afirmativo → INTENCIÓN: Confirmar
→ status: "CONFIRMADA [CO]"

Ejemplo 2:
Email: "Asunto: Confirmar reserva | Cuerpo: ¿Pueden confirmarme la disponibilidad?"
Análisis: Es una pregunta "¿Pueden...?" → INTENCIÓN: Solicitar confirmación
→ status: "PENDIENTE DE CONFIRMACION [PC]"

Ejemplo 3:
Email: "Confirmame esta reserva por favor"
Análisis: "Confirmame" es imperativo solicitando acción → INTENCIÓN: Solicitar
→ status: "PENDIENTE DE CONFIRMACION [PC]"

Ejemplo 4:
Email: "Te confirmo la reserva para el día 5 de junio"
Análisis: "Te confirmo" es afirmativo → INTENCIÓN: Confirmar
→ status: "CONFIRMADA [CO]"

Ejemplo 5:
Email: "Solicito cotización para 2 pasajeros"
Análisis: "Solicito" indica consulta inicial → INTENCIÓN: Solicitar
→ status: "PENDIENTE DE CONFIRMACION [PC]"

Ejemplo 6:
Email: "Reserva confirmada. Adjunto voucher."
Análisis: "Reserva confirmada" es afirmativo + incluye voucher → INTENCIÓN: Confirmar
→ status: "CONFIRMADA [CO]"

Ejemplo 7:
Email: "Necesito cancelar la reserva del día 10"
Análisis: "cancelar" → INTENCIÓN: Cancelar
→ status: "CANCELADA [CA]"

NO incluyas ningún texto adicional fuera del JSON. NO incluyas markdown code blocks.`;

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

    // Build enhanced prompt with master data context
    let systemPrompt = EXTRACTION_SYSTEM_PROMPT;
    
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

        // Add metadata
        validatedData.extractedAt = new Date().toISOString();
        validatedData.userId = userId;
        validatedData.modelUsed = config.openai.deployment || 'gpt-4o-mini';
        validatedData.emailContentLength = emailContent.length;

        console.log(`✅ Extraction completed successfully`);
        console.log(`   Passengers: ${validatedData.passengers?.length || 0}`);
        console.log(`   Client: ${validatedData.client || 'N/A'}`);
        console.log(`   Travel Date: ${validatedData.travelDate || 'N/A'}`);

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
        hotel: null,
        checkIn: null,
        checkOut: null,
        flights: [],
        services: [],
        contactEmail: null,
        contactPhone: null,
        confidence: 0.5
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
                passengerType: validatePassengerType(p.passengerType),
                phoneNumber: sanitizeString(p.phoneNumber)
            }));
    }

    // Validate basic fields (Legacy/Standard)
    validated.provider = sanitizeString(data.provider);
    validated.reservationCode = sanitizeString(data.reservationCode);
    validated.hotel = sanitizeString(data.hotel);
    validated.checkIn = validateDate(data.checkIn);
    validated.checkOut = validateDate(data.checkOut);

    // Validate iTraffic fields
    validated.codigo = sanitizeString(data.codigo);
    validated.reservationType = sanitizeString(data.reservationType);
    validated.status = sanitizeString(data.status);
    validated.estadoDeuda = sanitizeString(data.estadoDeuda);

    // Date logic: Default reservationDate to today, travelDate to checkIn, tourEndDate to checkOut
    const today = new Date().toISOString().split('T')[0];
    validated.reservationDate = validateDate(data.reservationDate) || today;
    validated.travelDate = validateDate(data.travelDate) || validated.checkIn;
    validated.tourEndDate = validateDate(data.tourEndDate) || validated.checkOut;

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

    // Validate services
    if (Array.isArray(data.services) && data.services.length > 0) {
        validated.services = data.services
            .filter(s => s.description)
            .map(s => ({
                type: validateServiceType(s.type),
                description: sanitizeString(s.description),
                date: validateDate(s.date),
                location: sanitizeString(s.location)
            }));
    }

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
