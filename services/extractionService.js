/**
 * Extraction Service - Email Reservation Data Extraction
 * Extracts structured reservation information from email chains using Azure OpenAI
 */

import { AzureOpenAI } from 'openai';
import config from '../config/index.js';
import { searchServices } from './servicesExtractionService.js';
import { filterSimilarImages } from './imageHashService.js';
import { runAllExtractions } from '../rpa/utils/extractionFunctions/index.js';

let openaiClient = null;
let imageExtractorClient = null;

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

function getImageExtractorClient() {
    if (!imageExtractorClient) {
        if (!config.imageExtractor.apiKey) {
            throw new Error('Azure OpenAI Image Extractor API key not configured');
        }
        if (!config.imageExtractor.endpoint) {
            throw new Error('Azure OpenAI Image Extractor endpoint not configured');
        }
        
        // Normalize endpoint (remove trailing slash if present)
        let normalizedEndpoint = config.imageExtractor.endpoint.replace(/\/$/, '');
        
        // Validate endpoint format (should be a valid Azure OpenAI endpoint)
        if (!normalizedEndpoint.startsWith('http://') && !normalizedEndpoint.startsWith('https://')) {
            throw new Error(`Invalid endpoint format: ${normalizedEndpoint}. Endpoint must start with http:// or https://`);
        }
        
        // Log configuration (mask API key for security)
        const maskedApiKey = config.imageExtractor.apiKey ? 
            `${config.imageExtractor.apiKey.substring(0, 8)}...${config.imageExtractor.apiKey.substring(config.imageExtractor.apiKey.length - 4)}` : 
            'not configured';
        
        console.log(`   🔧 Initializing Azure OpenAI Image Extractor client`);
        console.log(`      Endpoint: ${normalizedEndpoint}`);
        console.log(`      API Key: ${maskedApiKey}`);
        console.log(`      Deployment: ${config.imageExtractor.deployment || 'not configured'}`);
        console.log(`      API Version: ${config.imageExtractor.apiVersion || 'not configured'}`);
        
        try {
            imageExtractorClient = new AzureOpenAI({
                apiKey: config.imageExtractor.apiKey,
                endpoint: normalizedEndpoint,
                apiVersion: config.imageExtractor.apiVersion
            });
            console.log(`   ✅ Azure OpenAI Image Extractor client initialized successfully`);
        } catch (initError) {
            console.error(`   ❌ Failed to initialize Azure OpenAI Image Extractor client:`, initError.message);
            throw new Error(`Failed to initialize client: ${initError.message}`);
        }
    }
    return imageExtractorClient;
}

/**
 * Extract text from an image using Azure OpenAI Vision API
 * @param {Object} image - Image file object with buffer and mimetype
 * @returns {Promise<string>} Extracted text from the image
 */
async function extractTextFromImage(image) {
    if (!config.imageExtractor.apiKey) {
        throw new Error('Azure OpenAI Image Extractor API key not configured. Please check your .env file (AZURE_OPENAI_IMAGE_EXTRACTOR_API_KEY).');
    }

    if (!config.imageExtractor.endpoint) {
        throw new Error('Azure OpenAI Image Extractor endpoint not configured. Please check your .env file (AZURE_OPENAI_IMAGE_EXTRACTOR_API_ENDPOINT).');
    }

    if (!config.imageExtractor.deployment) {
        throw new Error('Azure OpenAI Image Extractor deployment not configured. Please check your .env file (AZURE_OPENAI_IMAGE_EXTRACTOR_API_DEPLOYMENT).');
    }

    try {
        const imageExtractorClient = getImageExtractorClient();
        if (!imageExtractorClient) {
            throw new Error('Failed to initialize Azure OpenAI Image Extractor client');
        }

        // Validate image size (Azure OpenAI has limits)
        const imageSizeMB = image.buffer.length / (1024 * 1024);
        const maxSizeMB = 20; // Azure OpenAI typically supports up to 20MB
        if (imageSizeMB > maxSizeMB) {
            throw new Error(`Image size (${imageSizeMB.toFixed(2)}MB) exceeds maximum allowed size (${maxSizeMB}MB)`);
        }

        // Convert image buffer to base64
        const base64Image = image.buffer.toString('base64');
        
        // Azure OpenAI Vision API requires the data URL format
        const mimeType = image.mimetype || 'image/jpeg';
        const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

        // Use OpenAI Vision API to extract text from image
        const model = config.imageExtractor.deployment;
        const systemPrompt = `You are an OCR (Optical Character Recognition) assistant. Extract ALL text from the image, preserving the structure, layout, and formatting as much as possible. Include:
- All visible text, numbers, and symbols
- Tables and structured data (preserve columns and rows)
- Form fields and their values
- Dates, times, and codes
- Any other readable content

Return the extracted text in a clear, organized format. If the image contains no text, respond with "No se encontró texto en la imagen".`;

        console.log(`   🔍 Sending image to ${model} (${imageSizeMB.toFixed(2)}MB, ${mimeType})...`);

        // Create a timeout promise (60 seconds for image processing)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Image extraction timeout: Request took longer than 60 seconds'));
            }, 60000);
        });

        // Create the API request promise
        const apiRequest = imageExtractorClient.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Extract all text from this image, including any tables, forms, or structured data. Preserve the layout and structure as much as possible.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageDataUrl
                            }
                        }
                    ]
                }
            ],
            temperature: 0.1, // Low temperature for deterministic text extraction
            max_tokens: 4000 // Allow for longer text extraction
        });

        // Race between the API request and timeout
        const response = await Promise.race([apiRequest, timeoutPromise]);

        const extractedText = response.choices[0].message.content.trim();
        
        if (extractedText && extractedText !== 'No se encontró texto en la imagen') {
            console.log(`   📊 OCR completed using ${model}: ${extractedText.length} characters extracted`);
            
            // Log token usage for image extraction
            if (response.usage) {
                const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
                console.log(`   📊 Image extraction tokens: ${total_tokens.toLocaleString()} (prompt: ${prompt_tokens.toLocaleString()}, completion: ${completion_tokens.toLocaleString()})`);
            }
        } else {
            console.log(`   ⚠️ No se encontró texto en ${image.originalname}`);
        }
        
        return extractedText || 'No se encontró texto en la imagen';
    } catch (error) {
        // Enhanced error logging
        const errorDetails = {
            message: error.message,
            status: error.status || error.statusCode,
            code: error.code,
            endpoint: config.imageExtractor.endpoint ? `${config.imageExtractor.endpoint.substring(0, 30)}...` : 'not configured',
            deployment: config.imageExtractor.deployment || 'not configured',
            imageName: image.originalname,
            imageSize: image.buffer ? `${(image.buffer.length / (1024 * 1024)).toFixed(2)}MB` : 'unknown'
        };
        
        console.error(`   ⚠️ Error extrayendo texto de imagen ${image.originalname}:`, error.message);
        console.error(`   📋 Error details:`, JSON.stringify(errorDetails, null, 2));
        
        // If it's a connection error, provide more helpful information
        if (error.message && error.message.includes('Connection')) {
            console.error(`   💡 Connection error troubleshooting:`);
            console.error(`      - Verify AZURE_OPENAI_IMAGE_EXTRACTOR_API_ENDPOINT is correct`);
            console.error(`      - Verify AZURE_OPENAI_IMAGE_EXTRACTOR_API_KEY is valid`);
            console.error(`      - Verify AZURE_OPENAI_IMAGE_EXTRACTOR_API_DEPLOYMENT exists and supports vision`);
            console.error(`      - Check network connectivity to Azure OpenAI endpoint`);
        }
        
        throw error;
    }
}

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

    if (masterData) {
        console.log('📋 Using master data for reservation fields (reservationType, status, seller, client)');
    }

    // Extract text from images if available
    let extractedImageText = '';
    if (images && images.length > 0) {
        console.log(`🖼️ Procesando ${images.length} imagen(es)...`);
        
        // Filter similar images before processing
        const similarityThreshold = parseFloat(process.env.IMAGE_SIMILARITY_THRESHOLD) || 85;
        let uniqueImages = images;
        
        try {
            uniqueImages = await filterSimilarImages(images, similarityThreshold);
            if (uniqueImages.length < images.length) {
                console.log(`📊 Filtrado: ${images.length} imágenes → ${uniqueImages.length} imágenes únicas (ahorro: ${images.length - uniqueImages.length} imágenes)`);
            }
        } catch (hashError) {
            console.warn(`⚠️ Error en filtrado de imágenes similares, procesando todas las imágenes:`, hashError.message);
            // Continue with all images if hash filtering fails
            uniqueImages = images;
        }
        
        console.log(`🖼️ Extrayendo texto de ${uniqueImages.length} imagen(es) única(s)...`);
        const imageTexts = [];
        
        for (let i = 0; i < uniqueImages.length; i++) {
            const image = uniqueImages[i];
            try {
                console.log(`   📄 Extrayendo texto de imagen ${i + 1}/${uniqueImages.length}: ${image.originalname}`);
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
        }
    }
    
    // Combine email content with extracted image text (same content is sent to all section extractors)
    const combinedContent = extractedImageText 
        ? `${truncatedContent}\n\n=== TEXTO EXTRAÍDO DE IMÁGENES ADJUNTAS ===${extractedImageText}`
        : truncatedContent;
    
    if (extractedImageText) {
        console.log(`📤 Sending email + extracted image text to extraction (6 parallel calls)`);
    }

    // Retry logic with exponential backoff for rate limits
    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
        try {
            const extractionClient = getOpenAIClient();
            if (!extractionClient) {
                throw new Error('OpenAI client not configured. Please check your .env file.');
            }
            const model = config.openai.deployment || 'gpt-4o-mini';

            const extractedData = await runAllExtractions(combinedContent, masterData, {
                openAIClient: extractionClient,
                model
            });
            console.log(`✅ Extraction completed (6 section calls merged)`);

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
    calculateQualityScore
};
