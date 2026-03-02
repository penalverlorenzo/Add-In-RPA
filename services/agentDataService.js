/**
 * Agent Data Service
 * Handles saving Hotels, Services, and Packages data to MySQL database
 * Uses INSERT ... ON DUPLICATE KEY UPDATE to handle duplicates
 */

import mysql from 'mysql2/promise';
import config from '../config/index.js';

let connectionPool = null;

/**
 * Gets MySQL connection pool
 * Reuses the same pool pattern as mysqlMasterDataService
 * @returns {mysql.Pool|null} MySQL connection pool
 */
function getMySQLPool() {
  if (!connectionPool) {
    if (!config.mysql.host || !config.mysql.user || !config.mysql.password) {
      console.warn('⚠️ MySQL configuration incomplete');
      return null;
    }

    const poolConfig = {
      host: config.mysql.host,
      port: parseInt(config.mysql.port) || 3306,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
      acquireTimeout: 10000,
      timeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    if (config.mysql.ssl || config.mysql.host?.includes('mysql.database.azure.com')) {
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    try {
      connectionPool = mysql.createPool(poolConfig);
    } catch (error) {
      console.error('❌ Error initializing MySQL pool:', error.message);
      return null;
    }
  }
  return connectionPool;
}

/**
 * Converts a date value to MySQL datetime format
 * @param {any} dateValue - Date value (string, Date object, or null)
 * @returns {string|null} MySQL datetime string or null
 */
function convertToMySQLDateTime(dateValue) {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 19).replace('T', ' ');
  }
  
  if (typeof dateValue === 'string') {
    // Try to parse common date formats
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
    // If already in MySQL format, return as is
    if (/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/.test(dateValue)) {
      return dateValue;
    }
  }
  
  return null;
}

/**
 * Converts empty strings to null for optional fields
 * @param {any} value - Value to convert
 * @returns {any} Value or null if empty string
 */
function emptyToNull(value) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Saves hotels to MySQL database
 * @param {Array} hoteles - Array of hotel objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveHotelsToDB(hoteles) {
  if (!hoteles || !Array.isArray(hoteles) || hoteles.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: hoteles.length, total: hoteles.length };
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${hoteles.length} hoteles en la base de datos...`);

  for (const hotel of hoteles) {
    try {
      // Validate required field
      if (!hotel.HotelID) {
        console.warn(`⚠️ Hotel sin HotelID, saltando registro:`, hotel);
        errors++;
        continue;
      }

      // Map JSON fields to database columns
      const hotelData = {
        HotelID: hotel.HotelID,
        NombreHotel: emptyToNull(hotel.NombreHotel || hotel.nombreHotel),
        Categoria: emptyToNull(hotel.Categoria || hotel.categoria),
        Ciudad: emptyToNull(hotel.Ciudad || hotel.ciudad),
        Mercado: emptyToNull(hotel.Mercado || hotel.mercado),
        Canal: emptyToNull(hotel.Canal || hotel.canal),
        Base: emptyToNull(hotel.Base || hotel.base),
        CantidadMinima: hotel.CantidadMinima || hotel.cantidadMinima || 0,
        Moneda: emptyToNull(hotel.Moneda || hotel.moneda),
        Precio: hotel.Precio || hotel.precio || null,
        VigenciaDesde: convertToMySQLDateTime(hotel.VigenciaDesde || hotel.vigenciaDesde),
        VigenciaHasta: convertToMySQLDateTime(hotel.VigenciaHasta || hotel.vigenciaHasta),
        Activo: emptyToNull(hotel.Activo || hotel.activo),
        MapsURL: emptyToNull(hotel.MapsURL || hotel.mapsURL || hotel.MapsUrl || hotel.mapsUrl)
      };

      const query = `
        INSERT INTO hotels (
          HotelID, NombreHotel, Categoria, Ciudad, Mercado, Canal, Base,
          CantidadMinima, Moneda, Precio, VigenciaDesde, VigenciaHasta, Activo, MapsURL
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          NombreHotel = VALUES(NombreHotel),
          Categoria = VALUES(Categoria),
          Ciudad = VALUES(Ciudad),
          Mercado = VALUES(Mercado),
          Canal = VALUES(Canal),
          Base = VALUES(Base),
          CantidadMinima = VALUES(CantidadMinima),
          Moneda = VALUES(Moneda),
          Precio = VALUES(Precio),
          VigenciaDesde = VALUES(VigenciaDesde),
          VigenciaHasta = VALUES(VigenciaHasta),
          Activo = VALUES(Activo),
          MapsURL = VALUES(MapsURL)
      `;

      const [result] = await pool.query(query, [
        hotelData.HotelID,
        hotelData.NombreHotel,
        hotelData.Categoria,
        hotelData.Ciudad,
        hotelData.Mercado,
        hotelData.Canal,
        hotelData.Base,
        hotelData.CantidadMinima,
        hotelData.Moneda,
        hotelData.Precio,
        hotelData.VigenciaDesde,
        hotelData.VigenciaHasta,
        hotelData.Activo,
        hotelData.MapsURL
      ]);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando hotel ${hotel.HotelID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Hoteles guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: hoteles.length };
}

/**
 * Saves services to MySQL database
 * @param {Array} servicios - Array of service objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveServicesToDB(servicios) {
  if (!servicios || !Array.isArray(servicios) || servicios.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: servicios.length, total: servicios.length };
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${servicios.length} servicios en la base de datos...`);

  for (const servicio of servicios) {
    try {
      // Validate required field
      if (!servicio.ServicioID) {
        console.warn(`⚠️ Servicio sin ServicioID, saltando registro:`, servicio);
        errors++;
        continue;
      }

      // Map JSON fields to database columns
      const servicioData = {
        ServicioID: servicio.ServicioID,
        NombreServicio: emptyToNull(servicio.NombreServicio || servicio.nombreServicio),
        TipoServicio: emptyToNull(servicio.TipoServicio || servicio.tipoServicio),
        Base: emptyToNull(servicio.Base || servicio.base),
        Categoria: emptyToNull(servicio.Categoria || servicio.categoria),
        Canal: emptyToNull(servicio.Canal || servicio.canal),
        Mercado: emptyToNull(servicio.Mercado || servicio.mercado),
        Descripcion: emptyToNull(servicio.Descripcion || servicio.descripcion),
        CantidadMinima: servicio.CantidadMinima || servicio.cantidadMinima || 0,
        Moneda: emptyToNull(servicio.Moneda || servicio.moneda),
        Precio: servicio.Precio || servicio.precio || null,
        VigenciaDesde: convertToMySQLDateTime(servicio.VigenciaDesde || servicio.vigenciaDesde),
        VigenciaHasta: convertToMySQLDateTime(servicio.VigenciaHasta || servicio.vigenciaHasta),
        Activo: emptyToNull(servicio.Activo || servicio.activo),
        CantidadPasos: servicio.CantidadPasos || servicio.cantidadPasos || 0,
        Zonas: emptyToNull(servicio.Zonas || servicio.zonas)
      };

      const query = `
        INSERT INTO services (
          ServicioID, NombreServicio, TipoServicio, Base, Categoria, Canal, Mercado,
          Descripcion, CantidadMinima, Moneda, Precio, VigenciaDesde, VigenciaHasta,
          Activo, CantidadPasos, Zonas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          NombreServicio = VALUES(NombreServicio),
          TipoServicio = VALUES(TipoServicio),
          Base = VALUES(Base),
          Categoria = VALUES(Categoria),
          Canal = VALUES(Canal),
          Mercado = VALUES(Mercado),
          Descripcion = VALUES(Descripcion),
          CantidadMinima = VALUES(CantidadMinima),
          Moneda = VALUES(Moneda),
          Precio = VALUES(Precio),
          VigenciaDesde = VALUES(VigenciaDesde),
          VigenciaHasta = VALUES(VigenciaHasta),
          Activo = VALUES(Activo),
          CantidadPasos = VALUES(CantidadPasos),
          Zonas = VALUES(Zonas)
      `;

      const [result] = await pool.query(query, [
        servicioData.ServicioID,
        servicioData.NombreServicio,
        servicioData.TipoServicio,
        servicioData.Base,
        servicioData.Categoria,
        servicioData.Canal,
        servicioData.Mercado,
        servicioData.Descripcion,
        servicioData.CantidadMinima,
        servicioData.Moneda,
        servicioData.Precio,
        servicioData.VigenciaDesde,
        servicioData.VigenciaHasta,
        servicioData.Activo,
        servicioData.CantidadPasos,
        servicioData.Zonas
      ]);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando servicio ${servicio.ServicioID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Servicios guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: servicios.length };
}

/**
 * Saves packages to MySQL database
 * @param {Array} paquetes - Array of package objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function savePackagesToDB(paquetes) {
  if (!paquetes || !Array.isArray(paquetes) || paquetes.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: paquetes.length, total: paquetes.length };
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${paquetes.length} paquetes en la base de datos...`);

  for (const paquete of paquetes) {
    try {
      // Validate required field
      if (!paquete.PaqueteID) {
        console.warn(`⚠️ Paquete sin PaqueteID, saltando registro:`, paquete);
        errors++;
        continue;
      }

      // Map JSON fields to database columns
      const paqueteData = {
        PaqueteID: paquete.PaqueteID,
        NombrePaquete: emptyToNull(paquete.NombrePaquete || paquete.nombrePaquete),
        Mercado: emptyToNull(paquete.Mercado || paquete.mercado),
        Dias: paquete.Dias || paquete.dias || 0,
        Noches: paquete.Noches || paquete.noches || 0,
        Canal: emptyToNull(paquete.Canal || paquete.canal),
        Base: emptyToNull(paquete.Base || paquete.base),
        CantidadMinima: paquete.CantidadMinima || paquete.cantidadMinima || 0,
        Moneda: emptyToNull(paquete.Moneda || paquete.moneda),
        Precio: paquete.Precio || paquete.precio || null,
        VigenciaDesde: convertToMySQLDateTime(paquete.VigenciaDesde || paquete.vigenciaDesde),
        VigenciaHasta: convertToMySQLDateTime(paquete.VigenciaHasta || paquete.vigenciaHasta),
        Descripcion: emptyToNull(paquete.Descripcion || paquete.descripcion),
        IncluyeResumen: emptyToNull(paquete.IncluyeResumen || paquete.incluyeResumen),
        Activo: emptyToNull(paquete.Activo || paquete.activo)
      };

      const query = `
        INSERT INTO packages (
          PaqueteID, NombrePaquete, Mercado, Dias, Noches, Canal, Base,
          CantidadMinima, Moneda, Precio, VigenciaDesde, VigenciaHasta,
          Descripcion, IncluyeResumen, Activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          NombrePaquete = VALUES(NombrePaquete),
          Mercado = VALUES(Mercado),
          Dias = VALUES(Dias),
          Noches = VALUES(Noches),
          Canal = VALUES(Canal),
          Base = VALUES(Base),
          CantidadMinima = VALUES(CantidadMinima),
          Moneda = VALUES(Moneda),
          Precio = VALUES(Precio),
          VigenciaDesde = VALUES(VigenciaDesde),
          VigenciaHasta = VALUES(VigenciaHasta),
          Descripcion = VALUES(Descripcion),
          IncluyeResumen = VALUES(IncluyeResumen),
          Activo = VALUES(Activo)
      `;

      const [result] = await pool.query(query, [
        paqueteData.PaqueteID,
        paqueteData.NombrePaquete,
        paqueteData.Mercado,
        paqueteData.Dias,
        paqueteData.Noches,
        paqueteData.Canal,
        paqueteData.Base,
        paqueteData.CantidadMinima,
        paqueteData.Moneda,
        paqueteData.Precio,
        paqueteData.VigenciaDesde,
        paqueteData.VigenciaHasta,
        paqueteData.Descripcion,
        paqueteData.IncluyeResumen,
        paqueteData.Activo
      ]);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando paquete ${paquete.PaqueteID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Paquetes guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: paquetes.length };
}

/**
 * Saves all data (hotels, services, packages) to MySQL database
 * @param {Array} hoteles - Array of hotel objects
 * @param {Array} servicios - Array of service objects
 * @param {Array} paquetes - Array of package objects
 * @returns {Promise<Object>} Summary of all operations
 */
export async function saveAllDataToDB(hoteles, servicios, paquetes) {
  console.log('💾 Iniciando guardado de datos en base de datos MySQL...');
  
  const results = {
    hotels: { inserted: 0, updated: 0, errors: 0, total: 0 },
    services: { inserted: 0, updated: 0, errors: 0, total: 0 },
    packages: { inserted: 0, updated: 0, errors: 0, total: 0 }
  };

  try {
    // Save hotels
    if (hoteles && hoteles.length > 0) {
      results.hotels = await saveHotelsToDB(hoteles);
    }
  } catch (error) {
    console.error('❌ Error guardando hoteles:', error.message);
    results.hotels.errors = hoteles?.length || 0;
  }

  try {
    // Save services
    if (servicios && servicios.length > 0) {
      results.services = await saveServicesToDB(servicios);
    }
  } catch (error) {
    console.error('❌ Error guardando servicios:', error.message);
    results.services.errors = servicios?.length || 0;
  }

  try {
    // Save packages
    if (paquetes && paquetes.length > 0) {
      results.packages = await savePackagesToDB(paquetes);
    }
  } catch (error) {
    console.error('❌ Error guardando paquetes:', error.message);
    results.packages.errors = paquetes?.length || 0;
  }

  const totalInserted = results.hotels.inserted + results.services.inserted + results.packages.inserted;
  const totalUpdated = results.hotels.updated + results.services.updated + results.packages.updated;
  const totalErrors = results.hotels.errors + results.services.errors + results.packages.errors;

  console.log(`✅ Guardado completado: ${totalInserted} insertados, ${totalUpdated} actualizados, ${totalErrors} errores`);

  return {
    hotels: results.hotels,
    services: results.services,
    packages: results.packages,
    summary: {
      totalInserted,
      totalUpdated,
      totalErrors,
      totalProcessed: results.hotels.total + results.services.total + results.packages.total
    }
  };
}
