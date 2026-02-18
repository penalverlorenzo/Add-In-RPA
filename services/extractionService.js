/**
 * Extraction Service - Email Reservation Data Extraction
 * Extracts structured reservation information from email chains using Azure OpenAI
 */

import { AzureOpenAI } from 'openai';
import config from '../config/index.js';
import { searchServices } from './servicesExtractionService.js';

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
 * Extract text from an image using Azure Computer Vision OCR
 * @param {Object} image - Image file object with buffer and mimetype
 * @returns {Promise<string>} Extracted text from the image
 */
async function extractTextFromImage(image) {
    console.log('apiVersion', config.imageExtractor.apiVersion, 'endpoint', config.imageExtractor.endpoint, 'apiKey', config.imageExtractor.apiKey, 'imageExtractor: ', config.imageExtractor);
    if (!config.imageExtractor.endpoint) {
        throw new Error('Azure Image Extractor endpoint not configured. Please check your .env file (AZURE_OPENAI_IMAGE_EXTRACTOR_ENDPOINT).');
    }

    if (!config.openai.apiKey) {
        throw new Error('Azure OpenAI API key not configured. Please check your .env file (AZURE_OPENAI_API_KEY).');
    }

    try {
        const endpoint = config.imageExtractor.endpoint; // Remove trailing slash
        const apiVersion = config.imageExtractor.apiVersion || '2023-02-01-preview'; // Standard Computer Vision API version
        
        const apiKey = config.imageExtractor.apiKey; // Use the same API key as OpenAI

        // Step 1: Submit image for OCR analysis (Microsoft Foundry OCR endpoint)
        const analyzeUrl = `${endpoint}/vision/v3.2/read/analyze?api-version=${apiVersion}`;
        
        const analyzeResponse = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': apiKey,
                'Content-Type': image.mimetype || 'application/octet-stream'
            },
            body: image.buffer
        });

        if (!analyzeResponse.ok) {
            const errorText = await analyzeResponse.text();
            throw new Error(`Computer Vision API error: ${analyzeResponse.status} - ${errorText}`);
        }

        // Get operation location from response headers
        const operationLocation = analyzeResponse.headers.get('Operation-Location');
        if (!operationLocation) {
            throw new Error('No Operation-Location header in response');
        }

        // Step 2: Poll for results (Azure Computer Vision is async)
        let resultResponse;
        let attempts = 0;
        const maxAttempts = 30; // Max 30 seconds wait
        const pollInterval = 1000; // 1 second

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            attempts++;

            resultResponse = await fetch(operationLocation, {
                method: 'GET',
                headers: {
                    'Ocp-Apim-Subscription-Key': apiKey
                }
            });

            if (!resultResponse.ok) {
                const errorText = await resultResponse.text();
                throw new Error(`Computer Vision result API error: ${resultResponse.status} - ${errorText}`);
            }

            const result = await resultResponse.json();
            
            if (result.status === 'succeeded') {
                // Extract text from all lines
                const extractedLines = [];
                if (result.analyzeResult && result.analyzeResult.readResults) {
                    for (const readResult of result.analyzeResult.readResults) {
                        if (readResult.lines) {
                            for (const line of readResult.lines) {
                                if (line.text) {
                                    extractedLines.push(line.text);
                                }
                            }
                        }
                    }
                }
                
                const extractedText = extractedLines.join('\n');
                console.log(`   📊 OCR completed: ${extractedText.length} characters extracted`);
                
                return extractedText || 'No se encontró texto en la imagen';
            } else if (result.status === 'failed') {
                throw new Error(`OCR analysis failed: ${result.error?.message || 'Unknown error'}`);
            }
            // If status is 'running' or 'notStarted', continue polling
        }

        throw new Error('OCR analysis timeout: operation did not complete in time');
    } catch (error) {
        console.error(`   ⚠️ Error extrayendo texto de imagen ${image.originalname}:`, error.message);
        throw error;
    }
}

/**
 * System prompt for reservation data extraction
 */
const services = []
const EXTRACTION_SYSTEM_PROMPT = `Eres un asistente especializado en extraer información estructurada de emails relacionados con reservas turísticas.

CONTEXTO:
- Empresa receptora: AYMARA (empresa proveedora de servicios turísticos en Mendoza, Argentina)
- Los emails provienen de agencias/operadoras que derivan pasajeros
- Los emails pueden contener hilos de conversación (múltiples forwards)
- Los datos pueden estar en español, portugués o inglés
- Formato de salida: JSON estrictamente estructurado
- ⚠️ IMPORTANTE SOBRE TEXTO DE IMÁGENES:
  * El contenido del email puede incluir texto extraído de imágenes adjuntas (si las hay)
  * Este texto aparece en una sección marcada como "=== TEXTO EXTRAÍDO DE IMÁGENES ADJUNTAS ==="
  * El texto de imágenes puede contener: tablas, formularios, vouchers, confirmaciones, facturas, itinerarios, capturas de pantalla
  * Puede incluir información de: pasajeros (nombres, documentos, fechas de nacimiento), hoteles (nombres, fechas check-in/out, tipos de habitación), servicios (nombres, fechas, precios, descripciones), clientes (nombres de agencias), vendedores, fechas de viaje, códigos de reserva, montos, etc.
  * DEBES analizar cuidadosamente TODO el texto extraído de imágenes y extraer TODA la información relevante
  * La información del texto de imágenes tiene la MISMA PRIORIDAD que el texto del email
  * Si hay discrepancias entre texto del email y texto de imágenes, prioriza la información más completa y detallada
  * NO omitas información que solo aparezca en el texto extraído de imágenes
  * Si el texto de imágenes contiene una tabla o lista de servicios/hoteles/pasajeros, extrae TODOS los elementos mencionados

TAREA:
Extrae la siguiente información del email y del texto extraído de imágenes (si está presente), prestando especial atención a los campos requeridos por el sistema "iTraffic":

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
   - reservationType: Tipo de reserva. DEBE ser EXACTAMENTE uno de los siguientes valores disponibles:
     * "ADMINISTRATIVAS"
     * "AGENCIAS"
     * "CVC"
     * "DESPEGAR"
     * "DIRECTOS O PARTICULARES"
     * "ESPECIALES"
     * "EXTERIOR"
     * "INFOTERA"
     * "MAYORISTA"
     * "OPORTUNMUNDO"
     * "RESERVAS SUCURSAL CALAFATE"
     * Si no estás seguro o no encuentras una coincidencia clara, dejalo vacio
     * ⚠️ CRÍTICO: Debes hacer DOBLE VERIFICACIÓN de este campo. Revisa el email completo (texto del email y texto de imágenes si está presente) y asegúrate de seleccionar el tipo correcto de la lista de opciones disponibles. Este campo NO puede tener errores.
   - status: Estado de la reserva. Analiza el CONTEXTO COMPLETO, TONO e INTENCIÓN del email para determinar el estado correcto:
     * "CONFIRMACION [FI]" si el email AFIRMA o CONFIRMA algo: "confirmamos la reserva", "reserva confirmada", "confirmo la reserva", "todo listo", "reserva aprobada", "confirmado", incluye vouchers/códigos/números de reserva
     * "CANCELADO [CX]" si el email CANCELA algo: "cancelar la reserva", "necesito cancelar", "cancelo la reserva", "reserva cancelada", "se canceló"
     * "PENDIENTE DE CONFIRMACION [PC]" si el email PREGUNTA o SOLICITA algo: "¿puedes confirmar?", "necesito confirmación", "confirmar disponibilidad", "solicito cotización", "consulta de disponibilidad", "cotización", "presupuesto", "solicitud de reserva", "quiero reservar"
     * Si no encuentras indicadores claros, usa "PENDIENTE DE CONFIRMACION [PC]"
     * ⚠️ CRÍTICO: Debes hacer DOBLE VERIFICACIÓN de este campo. Revisa el email completo (texto del email y texto de imágenes si está presente) y asegúrate de seleccionar el estado correcto de la lista de opciones disponibles. Este campo NO puede tener errores.
   - estadoDeuda: Estado de deuda (ej: "Pagada", "Pendiente", "Parcial")
   - reservationDate: Fecha de alta de la reserva (YYYY-MM-DD)
   - travelDate: Fecha de inicio del viaje (YYYY-MM-DD)
   - tourEndDate: Fecha de fin del viaje (YYYY-MM-DD)
   - dueDate: Fecha de vencimiento de la reserva (YYYY-MM-DD)
   - seller: Vendedor o agente responsable. Busca en la firma del email (ej: "Atentamente, Nombre" o "Equipe...").
     * ⚠️ OBLIGATORIO: Este campo SIEMPRE debe tener un valor. El vendedor SIEMPRE está presente en el email (texto o imágenes). Busca cuidadosamente en firmas, encabezados, o cualquier mención del remitente.
     * ⚠️ CRÍTICO: Debes hacer DOBLE VERIFICACIÓN de este campo. Revisa el email completo (texto del email y texto de imágenes si está presente) y asegúrate de seleccionar el vendedor correcto de la lista de opciones disponibles. Este campo NO puede tener errores y NO puede estar vacío.
   - client: Cliente a facturar. DEBE ser el nombre de la Agencia/Operador que envía el email, NO el pasajero.
     Busca nombres como "DESPEGAR", "ALMUNDO", "GRAYLINE", nombre de la agencia remitente, etc.
     * ⚠️ OBLIGATORIO: Este campo SIEMPRE debe tener un valor. El cliente SIEMPRE está presente en el email (texto o imágenes). Busca en el remitente del email, en el dominio del correo, o en cualquier mención de la agencia/operador.
     * ⚠️ CRÍTICO: Debes hacer DOBLE VERIFICACIÓN de este campo. Revisa el email completo (texto del email y texto de imágenes si está presente) y asegúrate de seleccionar el cliente correcto de la lista de opciones disponibles. Este campo NO puede tener errores y NO puede estar vacío.
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
   ⚠️ CRÍTICO: Debes hacer DOBLE VERIFICACIÓN para asegurarte de que NO se está saltando ningún servicio ni hotel mencionado en el email (texto del email y texto de imágenes si está presente). Revisa cuidadosamente:
   - Si el email menciona servicios, deben estar TODOS en el array "services" (SOLO los de Mendoza/Argentina)
   - Si el email menciona un hotel, debe estar en el objeto "hotel"
   - NO omitas ningún servicio u hotel mencionado, incluso si están en imágenes o tablas
   - ⚠️ IMPORTANTE: Solo incluye servicios, eventuales y programas de Mendoza/Argentina. Ignora servicios fuera de Mendoza/Argentina (especialmente transfers desde aeropuertos internacionales fuera de Argentina hacia destinos fuera de Mendoza)
   
   DEBES identificar el tipo de detalle que se está solicitando o confirmando en el email. Analiza el contenido para determinar si es:
   
   - "hotel": Cuando el email menciona alojamiento, hotel, hospedaje, check-in, check-out, habitación, room, accommodation
   
   - "servicio": Cuando el email menciona servicios adicionales como transfers, excursiones, comidas, tours, actividades, servicios turísticos
   
   - "eventual": Cuando el email menciona eventos, actividades especiales, fiestas, celebraciones, eventos corporativos
   
   - "programa": Cuando el email menciona programas de viaje, paquetes turísticos, itinerarios completos, circuitos
   
   ⚠️ REGLA CRÍTICA PARA SERVICIOS, EVENTUALES Y PROGRAMAS:
   - SOLO extrae servicios, eventuales y programas que sean de MENDOZA o ARGENTINA
   - NO extraigas servicios que estén fuera de Mendoza/Argentina, ya que el sistema RPA solo opera para servicios de Mendoza
   - Específicamente, IGNORA los siguientes servicios si NO son de Mendoza/Argentina:
     * Transfer in/transfer out desde/hacia aeropuertos fuera de Mendoza/Argentina
     * Traslados desde/hacia aeropuertos internacionales fuera de Argentina (ej: GRU, SCL, MVD, etc.) hacia destinos fuera de Mendoza
     * Servicios, excursiones, tours o actividades en ciudades fuera de Mendoza/Argentina
     * Eventuales o programas fuera de Mendoza/Argentina
   - Si un servicio menciona un aeropuerto internacional fuera de Argentina (ej: GRU, SCL, MVD, LIM, etc.) y el destino no es Mendoza/Argentina, NO lo incluyas
   - Si un transfer menciona "aeropuerto [código fuera de Argentina]" hacia un hotel fuera de Mendoza, NO lo incluyas
   - Ejemplos de servicios a IGNORAR:
     * "Transfer desde aeropuerto GRU (São Paulo) hasta hotel en São Paulo" → NO incluir
     * "Transfer desde aeropuerto SCL (Santiago) hasta hotel en Santiago" → NO incluir
     * "Tour por Buenos Aires" → Solo incluir si el destino inferido es Mendoza o si es claramente un servicio de Mendoza
     * "Traslado desde EZE hasta hotel en Buenos Aires" → Solo incluir si el destino final es Mendoza
   - Ejemplos de servicios a INCLUIR:
     * "Transfer desde aeropuerto MDZ (Mendoza) hasta hotel en Mendoza" → SÍ incluir
     * "Transfer desde EZE (Buenos Aires) hasta hotel en Mendoza" → SÍ incluir (destino final es Mendoza)
     * "Excursión por bodegas de Mendoza" → SÍ incluir
     * "Tour por viñedos mendocinos" → SÍ incluir
   
   IMPORTANTE: El tipo "hotel" tiene una estructura ESPECIAL diferente a los otros tipos:
   
   Para HOTEL, extrae ÚNICAMENTE la siguiente información:
   - nombre_hotel: Nombre del hotel SIN la palabra "Hotel" al inicio. CRÍTICO: Este campo es OBLIGATORIO. Si no puedes identificar el nombre del hotel, NO devuelvas el objeto "hotel" (deja "hotel": null en el JSON).
     * ⚠️ REGLA CRÍTICA: Solo devuelve el objeto "hotel" si puedes extraer el nombre_hotel. Si no hay nombre de hotel claro, NO devuelvas un objeto hotel con solo fechas u otros campos. Deja "hotel": null.
     * Ejemplos:
       - "Hotel Juanes de Sol Mendoza" → "Juanes de Sol"
       - "Hotel Sheraton Mendoza" → "Sheraton"
       - "Hilton Buenos Aires" → "Hilton Buenos Aires" (si no tiene "Hotel" al inicio, déjalo tal cual)
       - "Hotel Mendoza Plaza" → "Mendoza Plaza"
     * Si el nombre completo es "Hotel [Nombre] [Ciudad]", extrae solo "[Nombre]"
     * Si el nombre completo es "Hotel [Nombre]", extrae solo "[Nombre]"
     * Si NO encuentras un nombre de hotel claro, NO devuelvas el objeto hotel
   - tipo_habitacion: Tipo de habitación. DEBE ser uno de estos CÓDIGOS:
     * "SGL" para: Single, sencilla, individual, 1 persona, single room
     * "DWL" para: Double, doble, 2 personas, matrimonial, double room, twin
     * "TPL" para: Triple, 3 personas, triple room
     * "CPL" para: Cuádruple, 4 personas, cuádruple, quadruple room, family
     * Si no encuentras información clara, usa "DWL" como predeterminado
   - Ciudad: Ciudad donde está ubicado el hotel (ej: "Mendoza", "Buenos Aires", "MDZ"). 
     * Puede ser código de ciudad (MDZ, BA) o nombre completo
     * Prioriza códigos si están disponibles en el email
   - Categoria: Categoría o tipo de habitación. DEBE ser un string que describa la categoría de la habitación.
     * Ejemplos válidos: "Habitacion Clasica", "Habitacion Deluxe", "Habitacion Premier", "Suite", "Family Plan", "Standard Room", "Superior Room"
     * Si el email menciona "clásica", "deluxe", "premier", "suite", "family", etc., inclúyelo en este campo
     * Si no encuentras información, deja null
   - in: Fecha de check-in (YYYY-MM-DD). CRÍTICO: Esta fecha es OBLIGATORIA para hoteles.
     * DEBE ser una fecha válida en formato YYYY-MM-DD. Si no está clara, deja null
   - out: Fecha de check-out (YYYY-MM-DD). CRÍTICO: Esta fecha es OBLIGATORIA para hoteles.
     * DEBE ser una fecha válida en formato YYYY-MM-DD. Si no está clara, deja null
   
   Para servicio, eventual y programa, extrae la siguiente información (estructura unificada):
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
   - servicio: Nombre del servicio (Texto), máximo 3 palabras. CRÍTICO: Este nombre se usará para buscar en Azure Search, por lo que si no se encuentra un nombre correcto, se debe buscar el nombre de la bodega o marca. 
     * Para servicios: Extrae el nombre completo del servicio mencionado (ej: "WINE & RIDE LUJAN OPCION 1", "Mendocino Sunset: Horseback Riding", "Traslado Aeropuerto-Hotel")
     * NO uses abreviaciones ni descripciones genéricas. Si el email dice "Wine & Ride", usa "WINE & RIDE LUJAN" o el nombre que aparezca
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
   - origin: Origen (código IATA de 3 letras entre corchetes, ej: "[GRU]"). ⚠️ CRÍTICO: El código IATA DEBE estar entre corchetes [XXX]. Si el email dice "GRU" o "Aeropuerto de São Paulo (GRU)", devuelve "[GRU]".
   - destination: Destino (código IATA de 3 letras entre corchetes, ej: "[EZE]"). ⚠️ CRÍTICO: El código IATA DEBE estar entre corchetes [XXX]. Si el email dice "EZE" o "Aeropuerto de Buenos Aires (EZE)", devuelve "[EZE]".
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
- Los códigos de aeropuerto (origin y destination) DEBEN ser códigos IATA de 3 letras en MAYÚSCULAS entre corchetes [XXX] (ej: "[GRU]", "[EZE]", "[MDZ]")
- ⚠️ CRÍTICO: SOLO extrae servicios, eventuales y programas de MENDOZA/ARGENTINA. NO incluyas servicios fuera de Mendoza/Argentina (especialmente transfers desde aeropuertos internacionales fuera de Argentina hacia destinos fuera de Mendoza). El sistema RPA solo opera para servicios de Mendoza.
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
    "nombre_hotel": "string | null",
    "tipo_habitacion": "SGL | DWL | TPL | CPL | null",
    "Ciudad": "string | null",
    "Categoria": "string | null",
    "in": "YYYY-MM-DD | null",
    "out": "YYYY-MM-DD | null"
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
      "origin": "[XXX]",
      "destination": "[XXX]",
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
- Si el detalle es "hotel", completa el objeto "hotel" con la estructura ESPECIAL: nombre_hotel, tipo_habitacion, Ciudad, Categoria, in, out
  * ⚠️ CRÍTICO: Solo devuelve el objeto "hotel" si puedes extraer el nombre_hotel. Si no hay nombre de hotel identificable, deja "hotel": null. NO devuelvas un objeto hotel con solo fechas u otros campos sin el nombre.
  * NO uses la estructura unificada (destino, nts, basePax, servicio, descripcion, estado) para hoteles
  * El objeto hotel debe contener: nombre_hotel (SIN la palabra "Hotel" al inicio, OBLIGATORIO), tipo_habitacion, Ciudad, Categoria, in (fecha check-in), out (fecha check-out)
  * Las fechas "in" y "out" son OBLIGATORIAS para hoteles - siempre intenta extraerlas del email
- Si el detalle es "servicio", "eventual" o "programa", agrégalo al array "services" con la estructura unificada
- Los servicios/eventuales/programas usan la estructura: destino, in, out, nts, basePax, servicio, descripcion, estado
- El campo "estado" DEBE ser uno de los códigos válidos listados arriba (solo para servicios/eventuales/programas)
- Calcula "nts" (noches) como la diferencia en días entre "out" e "in" si ambas fechas están disponibles (solo para servicios/eventuales/programas)
- Si el email menciona múltiples servicios/eventuales/programas, agrégalos todos al array "services"
- Si el email menciona un hotel, usa el objeto "hotel" (solo uno) con la estructura especial
- Si no se puede identificar un tipo de detalle claro, deja detailType como null y completa solo los campos que encuentres

EXTRACCIÓN ESPECIAL PARA HOTELES:
- El objeto "hotel" tiene una estructura especial:
  * nombre_hotel: Extrae el nombre del hotel mencionado en el email, pero ELIMINA la palabra "Hotel" si aparece al inicio.
    Ejemplos: "Hotel Sheraton Mendoza" → "Sheraton", "Hotel Juanes de Sol Mendoza" → "Juanes de Sol"
  * tipo_habitacion: Identifica el tipo de habitación y usa el código correspondiente (SGL, DWL, TPL, CPL)
  * Ciudad: Extrae la ciudad donde está el hotel (preferiblemente código como "MDZ", "BA" si está disponible)
  * Categoria: Extrae la categoría o tipo de habitación mencionada (ej: "Habitacion Clasica", "Deluxe", "Suite")
  * in: Fecha de check-in (YYYY-MM-DD). OBLIGATORIA - siempre intenta extraerla del email
  * out: Fecha de check-out (YYYY-MM-DD). OBLIGATORIA - siempre intenta extraerla del email

EXTRACCIÓN OPTIMIZADA PARA BÚSQUEDA EN AZURE SEARCH (SERVICIOS):
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
 * @param {string} conversationId - Conversation ID for tracking
 * @param {Array} images - Array of image files from FormData (optional)
 * @returns {Promise<Object>} Extracted reservation data
 */
async function extractReservationData(emailContent, userId = 'unknown', masterData = null, conversationId = null, images = []) {
    if (!conversationId) {
        throw new Error('Conversation ID is required');
    }

    // Validate input
    if (!emailContent || emailContent.trim().length < 50) {
        throw new Error('Email content is too short or empty');
    }
    console.log('emailContent', emailContent);
    // Truncate very long emails (keep within token limits)
    const maxLength = 12000; // ~3000 tokens
    const truncatedContent = emailContent.length > maxLength 
        ? emailContent.substring(0, maxLength) + '\n\n[...contenido truncado por límite de tokens...]'
        : emailContent;

    console.log(`🔍 Extracting reservation data for user ${userId} and conversation ${conversationId}`);
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

    // Extract text from images if available
    let extractedImageText = '';
    if (images && images.length > 0) {
        console.log(`🖼️ Extrayendo texto de ${images.length} imagen(es)...`);
        const imageTexts = [];
        
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            try {
                console.log(`   📄 Extrayendo texto de imagen ${i + 1}/${images.length}: ${image.originalname}`);
                const imageText = await extractTextFromImage(image);
                
                if (imageText && imageText !== 'No se encontró texto en la imagen') {
                    imageTexts.push(`\n\n--- TEXTO EXTRAÍDO DE IMAGEN ${i + 1} (${image.originalname}) ---\n${imageText}`);
                    console.log(`   ✅ Texto extraído de ${image.originalname} (${imageText.length} caracteres)`);
                } else {
                    console.log(`   ⚠️ No se encontró texto en ${image.originalname}`);
                }
            } catch (imgError) {
                console.error(`   ❌ Error extrayendo texto de ${image.originalname}:`, imgError.message);
                // Continue with other images even if one fails
            }
        }
        
        if (imageTexts.length > 0) {
            extractedImageText = imageTexts.join('\n');
            console.log(`✅ Texto extraído de ${imageTexts.length} imagen(es) (total: ${extractedImageText.length} caracteres)`);
            console.log('extractedImageText', extractedImageText);
        }
    }
    
    // Combine email content with extracted image text
    const combinedContent = extractedImageText 
        ? `${truncatedContent}\n\n=== TEXTO EXTRAÍDO DE IMÁGENES ADJUNTAS ===${extractedImageText}`
        : truncatedContent;
    console.log('combinedContent', combinedContent);
    // Build user message content (text only, no images)
    const userContent = [
        { type: 'text', text: `Extrae la información de reserva del siguiente email:\n\n${combinedContent}` }
    ];
    
    if (extractedImageText) {
        console.log(`📤 Enviando texto del email + texto extraído de ${images.length} imagen(es) a OpenAI`);
    }

    // Retry logic with exponential backoff for rate limits
    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
        try {
            // Always use regular client for text extraction (images are already processed as text)
            const extractionClient = getOpenAIClient();
            if (!extractionClient) {
                throw new Error('OpenAI client not configured. Please check your .env file.');
            }
            
            // Always use regular model (text extraction)
            const model = config.openai.deployment || 'gpt-4o-mini';
            
            const response = await extractionClient.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                temperature: 0.2, // Low temperature for more deterministic extraction
                max_tokens: 2000,
                top_p: 0.95,
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content.trim();
            console.log(`✅ OpenAI response received (${content.length} chars)`);
            
            // Log token usage for text extraction
            const hasImages = images && images.length > 0;
            if (response.usage) {
                const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`📊 TOKEN USAGE REPORT (Text Extraction${hasImages ? ' - includes extracted image text' : ''})`);
                console.log(`   📥 Prompt tokens: ${prompt_tokens.toLocaleString()}`);
                console.log(`   📤 Completion tokens: ${completion_tokens.toLocaleString()}`);
                console.log(`   📊 Total tokens: ${total_tokens.toLocaleString()}`);
                if (hasImages) {
                    console.log(`   📝 Text extraction (includes text from ${images.length} image(s))`);
                } else {
                    console.log(`   📝 Text-only extraction`);
                }
                console.log(`   🤖 Model: ${model}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            } else {
                console.log('⚠️ Token usage information not available in response');
            }

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

            // Enrich services with Azure Search data
            if (validatedData.services && validatedData.services.length > 0) {
                try {
                    console.log(`🔍 Enriching ${validatedData.services.length} service(s) with Azure Search data...`);
                    const enrichedServices = await searchServices(validatedData, emailContent);
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
            validatedData.modelUsed = model;
            validatedData.emailContentLength = emailContent.length;
            validatedData.conversationId = conversationId;
            console.log(`✅ Extraction completed successfully`);
            console.log(`   Passengers: ${validatedData.passengers?.length || 0}`);
            console.log(`   Client: ${validatedData.client || 'N/A'}`);
            console.log(`   Travel Date: ${validatedData.travelDate || 'N/A'}`);
            console.log(`   Services: ${validatedData.services?.length || 0}`);

            return validatedData;
            
        } catch (error) {
            lastError = error;
            
            // Check if it's a rate limit error
            const isRateLimit = error.status === 429 || 
                               error.code === 'RateLimitReached' ||
                               (error.message && error.message.includes('rate limit'));
            
            if (isRateLimit && retryCount < maxRetries) {
                // Extract retry-after from headers if available
                const retryAfter = error.headers?.['retry-after'] || 
                                 error.headers?.['Retry-After'] ||
                                 (error.message.match(/retry after (\d+)/i)?.[1]);
                
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 1000;
                const waitSeconds = Math.ceil(waitTime / 1000);
                
                retryCount++;
                console.log(`⚠️ Rate limit alcanzado. Reintentando en ${waitSeconds} segundos (intento ${retryCount}/${maxRetries})...`);
                console.log(`   Error: ${error.message}`);
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // If it's not a rate limit error, or we've exhausted retries, throw the error
            throw error;
        }
    }
    
    // If we get here, all retries failed
    if (lastError) {
        console.error('❌ Error extracting reservation data:', lastError);
        
        if (lastError.message.includes('timeout')) {
            throw new Error('Extraction timeout: OpenAI service is taking too long');
        } else if (lastError.message.includes('rate limit')) {
            throw new Error('Rate limit exceeded: Please try again in a few moments');
        } else if (lastError.message.includes('invalid')) {
            throw new Error('Invalid email content: Unable to extract reservation data');
        }
        
        throw new Error(`Extraction failed: ${lastError.message}`);
    }
}


function validateTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    
    const timeRegex = /^\d{2}:\d{2}$/;
    return timeRegex.test(timeStr) ? timeStr : null;
}

function sanitizeIATACode(code) {
    if (!code || typeof code !== 'string') return null;
    
    let cleaned = code.trim().toUpperCase();
    
    // Si el código viene entre corchetes, extraer el contenido
    const bracketMatch = cleaned.match(/^\[([A-Z]{3})\]$/);
    if (bracketMatch) {
        cleaned = bracketMatch[1];
    }
    
    // Validar que sea un código IATA de 3 letras
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
    
    // Validate hotel (special structure: nombre_hotel, tipo_habitacion, Ciudad, Categoria, in, out)
    if (data.hotel && typeof data.hotel === 'object') {
        // Validar tipo de habitación
        const validRoomTypes = ['SGL', 'DWL', 'TPL', 'CPL'];
        const tipoHabitacion = data.hotel.tipo_habitacion;
        const validatedTipoHabitacion = validRoomTypes.includes(tipoHabitacion) ? tipoHabitacion : null;
        
        // Sanitize nombre_hotel and remove "Hotel" prefix if present
        let nombreHotel = sanitizeString(data.hotel.nombre_hotel);
        if (nombreHotel) {
            // Remove "Hotel" prefix (case insensitive)
            nombreHotel = nombreHotel.replace(/^Hotel\s+/i, '').trim();
        }
        
        validated.hotel = {
            nombre_hotel: nombreHotel,
            tipo_habitacion: validatedTipoHabitacion,
            Ciudad: sanitizeString(data.hotel.Ciudad),
            Categoria: sanitizeString(data.hotel.Categoria),
            in: validateDate(data.hotel.in),
            out: validateDate(data.hotel.out)
        };
        
        // Si no hay nombre_hotel, establecer hotel como null (no devolver hotel sin nombre)
        if (!validated.hotel.nombre_hotel) {
            validated.hotel = null;
        }
    } else {
        validated.hotel = null;
    }
    
    // Legacy support: populate legacy fields from checkIn/checkOut if available
    validated.checkIn = validateDate(data.checkIn);
    validated.checkOut = validateDate(data.checkOut);
    
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
