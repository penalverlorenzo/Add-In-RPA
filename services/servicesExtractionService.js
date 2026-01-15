/**
 * Services Extraction Service - Azure Search Integration
 * Searches for services in Azure Search based on extracted email data
 */

import { SearchClient, AzureKeyCredential } from '@azure/search-documents';

let searchClient = null;

/**
 * Get Azure Search client for servicios-turismo index
 */
function getSearchClient() {
  if (!searchClient) {
    const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const key = process.env.AZURE_SEARCH_KEY;
    const indexName = process.env.AZURE_SEARCH_SERVICES_INDEX || 'servicios-turismo';

    if (!endpoint || !key) {
      throw new Error('Faltan credenciales de Azure Search en .env');
    }

    searchClient = new SearchClient(
      endpoint,
      indexName,
      new AzureKeyCredential(key)
    );
  }
  return searchClient;
}

/**
 * Build search query from service information
 * @param {Object} service - Service object with servicio, destino, in, out
 * @returns {string} Search query string
 */
function buildSearchQuery(service) {
  const queryParts = [];
  
  // Add service name if available
  if (service.servicio) {
    queryParts.push(service.servicio);
  }
  
  // Add destination/city if available
  if (service.destino) {
    queryParts.push(service.destino);
  }
  
  // If no specific query parts, use wildcard
  return queryParts.length > 0 ? queryParts.join(' ') : '*';
}

/**
 * Map Azure Search result to unified detail format
 * @param {Object} azureResult - Result from Azure Search
 * @param {Object} originalService - Original service from extraction
 * @returns {Object} Service in unified detail format
 */
function mapAzureResultToService(azureResult, originalService) {
  // Extract dates from Azure Search result
  const fechaDesde = azureResult.fecha_desde 
    ? new Date(azureResult.fecha_desde).toISOString().split('T')[0] 
    : null;
  const fechaHasta = azureResult.fecha_hasta 
    ? new Date(azureResult.fecha_hasta).toISOString().split('T')[0] 
    : null;
  
  // Calculate nights if both dates are available
  let nights = 0;
  if (fechaDesde && fechaHasta) {
    const inDate = new Date(fechaDesde);
    const outDate = new Date(fechaHasta);
    const diffTime = outDate - inDate;
    nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (nights < 0) nights = 0;
  }
  
  // Build description with categoria and proveedor
  const descripcionParts = [];
  if (azureResult.categoria) {
    descripcionParts.push(`Categoría: ${azureResult.categoria}`);
  }
  if (azureResult.proveedor) {
    descripcionParts.push(`Proveedor: ${azureResult.proveedor}`);
  }
  const descripcion = descripcionParts.length > 0 
    ? descripcionParts.join(' | ') 
    : originalService.descripcion || null;
  
  return {
    destino: azureResult.ciudad || originalService.destino || null,
    in: fechaDesde || originalService.in || null,
    out: fechaHasta || originalService.out || null,
    nts: nights || originalService.nts || 0,
    basePax: originalService.basePax || 0,
    servicio: azureResult.servicio || originalService.servicio || null,
    descripcion: descripcion,
    estado: originalService.estado || 'RQ' // Default to REQUERIDO
  };
}

/**
 * Search for services in Azure Search based on extracted email data
 * @param {Object} extractedData - Data extracted from email (from extractionService)
 * @returns {Promise<Array>} Array of services enriched with Azure Search data
 */
export async function searchServices(extractedData, emailContent) {
  try {
    // Validate input
    if (!extractedData || !extractedData.services || !Array.isArray(extractedData.services)) {
      console.log('⚠️ No services found in extracted data');
      return extractedData.services || [];
    }

    const client = getSearchClient();
    const enrichedServices = [];
    console.log('extractedData.services', extractedData.services);
    // Process each service from extracted data
    for (const service of extractedData.services) {
      console.log('service', service);
      if (!service || !service.servicio) {
        // Keep service as-is if no name to search
        enrichedServices.push(service);
        continue;
      }

      try {
        // Build search query from service information
        const searchQuery = buildSearchQuery(service);
        
        console.log(`🔍 Searching Azure Search for service: ${emailContent}`);
        
        // Build filter for Azure Search
        const filter = buildFilter(service);
        
        // Search in Azure Search
        const searchOptions = {
          top: 10, // Get top 10 results to find best match
          select: ['servicio', 'fecha_desde', 'fecha_hasta', 'categoria', 'proveedor', 'ciudad'],
          queryType: 'simple',
          searchMode: 'any'
        };
        
        // Add filter if available
        if (filter) {
          searchOptions.filter = filter;
        }
        console.log('searchOptions', searchOptions);
        const searchResults = await client.search(searchQuery, searchOptions);
        console.log('searchResults', searchResults);
        let bestMatch = null;
        let bestScore = 0;

        // Find best matching result
        for await (const result of searchResults.results) {
          const azureService = result.document;
          const score = calculateMatchScore(azureService, service, result.score);
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = azureService;
          }
        }

        // Map Azure Search result to unified format
        if (bestMatch && bestScore > 0.3) { // Only use if match score is reasonable
          const enrichedService = mapAzureResultToService(bestMatch, service);
          enrichedServices.push(enrichedService);
          console.log(`✅ Found match for service: ${service.servicio} (score: ${bestScore.toFixed(2)})`);
        } else {
          // Keep original service if no good match found
          enrichedServices.push(service);
          console.log(`⚠️ No good match found for service: ${service.servicio}`);
        }

      } catch (error) {
        console.error(`❌ Error searching for service ${service.servicio}:`, error.message);
        // Keep original service on error
        enrichedServices.push(service);
      }
    }

    return enrichedServices;

  } catch (error) {
    // If index doesn't exist or other error, return original services
    if (error.statusCode === 404) {
      console.log('⚠️ Índice servicios-turismo no encontrado. Usando servicios originales.');
      return extractedData.services || [];
    }
    console.error('❌ Error en búsqueda de servicios:', error.message);
    return extractedData.services || [];
  }
}

/**
 * Build filter string for Azure Search
 * @param {Object} service - Service object with dates and destination
 * @returns {string|null} OData filter string or null
 */
function buildFilter(service) {
  const filters = [];
  
  // Filter by city if available
  if (service.destino) {
    // Escape single quotes in destino
    const escapedDestino = service.destino.replace(/'/g, "''");
    filters.push(`ciudad eq '${escapedDestino}'`);
  }
  
  // Filter by date range if available
  // Azure Search expects dates in ISO format with quotes
  if (service.in) {
    try {
      const serviceDate = new Date(service.in).toISOString();
      filters.push(`fecha_desde le ${serviceDate}`);
    } catch (e) {
      // Skip date filter if invalid
      console.warn(`Invalid date for filter: ${service.in}`);
    }
  }
  
  if (service.out) {
    try {
      const serviceDate = new Date(service.out).toISOString();
      filters.push(`fecha_hasta ge ${serviceDate}`);
    } catch (e) {
      // Skip date filter if invalid
      console.warn(`Invalid date for filter: ${service.out}`);
    }
  }
  
  return filters.length > 0 ? filters.join(' and ') : null;
}

/**
 * Calculate match score between Azure Search result and original service
 * @param {Object} azureService - Service from Azure Search
 * @param {Object} originalService - Original service from extraction
 * @param {number} searchScore - Search relevance score from Azure
 * @returns {number} Match score (0-1)
 */
function calculateMatchScore(azureService, originalService, searchScore) {
  let score = searchScore || 0.5; // Start with Azure search score
  
  // Boost score if service name matches
  if (azureService.servicio && originalService.servicio) {
    const azureName = azureService.servicio.toLowerCase();
    const originalName = originalService.servicio.toLowerCase();
    if (azureName.includes(originalName) || originalName.includes(azureName)) {
      score += 0.3;
    }
  }
  
  // Boost score if city matches
  if (azureService.ciudad && originalService.destino) {
    if (azureService.ciudad.toLowerCase() === originalService.destino.toLowerCase()) {
      score += 0.2;
    }
  }
  
  // Check date overlap
  if (azureService.fecha_desde && azureService.fecha_hasta && originalService.in) {
    const azureStart = new Date(azureService.fecha_desde);
    const azureEnd = new Date(azureService.fecha_hasta);
    const serviceDate = new Date(originalService.in);
    
    if (serviceDate >= azureStart && serviceDate <= azureEnd) {
      score += 0.2;
    }
  }
  
  return Math.min(score, 1.0); // Cap at 1.0
}

/**
 * Legacy function for backward compatibility
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
export async function searchDocuments(query) {
  try {
    const client = getSearchClient();
    
    const searchResults = await client.search(query, {
      top: 5,
      select: ['servicio', 'fecha_desde', 'fecha_hasta', 'categoria', 'proveedor', 'ciudad'],
      queryType: 'simple',
      searchMode: 'any'
    });

    const docs = [];
    
    for await (const result of searchResults.results) {
      const doc = result.document;
      docs.push({
        servicio: doc.servicio,
        fecha_desde: doc.fecha_desde,
        fecha_hasta: doc.fecha_hasta,
        categoria: doc.categoria,
        proveedor: doc.proveedor,
        ciudad: doc.ciudad
      });
    }

    return docs;

  } catch (error) {
    if (error.statusCode === 404) {
      console.log('⚠️ Índice no encontrado. Respondiendo sin contexto.');
      return [];
    }
    console.error('Error en búsqueda:', error.message);
    return [];
  }
}
