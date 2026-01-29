/**
 * MySQL Master Data Service - Simplified version for RPA Add-in
 * Manages reference data: Sellers, Clients, Statuses, Reservation Types, Genders, Document Types, Countries
 * Uses MySQL (Azure) instead of Cosmos DB
 */

import mysql from 'mysql2/promise';
import config from '../config/index.js';

let connectionPool = null;

function getMySQLConnection() {
    if (!connectionPool) {
        if (!config.mysql.host || !config.mysql.user || !config.mysql.password) {
            console.warn('⚠️ MySQL configuration incomplete:', {
                hasHost: !!config.mysql.host,
                hasUser: !!config.mysql.user,
                hasPassword: !!config.mysql.password,
                hasDatabase: !!config.mysql.database
            });
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
            connectTimeout: 10000, // 10 seconds
            acquireTimeout: 10000, // 10 seconds
            timeout: 10000, // 10 seconds
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        };

        // Configure SSL for Azure MySQL
        // Azure MySQL Flexible Server requires SSL by default
        if (config.mysql.ssl || config.mysql.host?.includes('mysql.database.azure.com')) {
            poolConfig.ssl = {
                rejectUnauthorized: false,
                // Azure MySQL requires SSL but doesn't need certificate verification
                // This allows connection without verifying the certificate
            };
            console.log('🔒 SSL enabled for MySQL connection (Azure MySQL)');
        }

        try {
            console.log(`🔌 Creating MySQL connection pool to ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);
            connectionPool = mysql.createPool(poolConfig);
            
            // Test connection asynchronously (don't block initialization)
            connectionPool.getConnection()
                .then(connection => {
                    console.log('✅ MySQL connection pool created and tested successfully');
                    connection.release();
                })
                .catch(error => {
                    console.error('❌ Error testing MySQL connection pool:', error.message);
                    console.error('   Error code:', error.code);
                    console.error('   Error errno:', error.errno);
                    if (error.code === 'ETIMEDOUT') {
                        console.error('   ⚠️ Connection timeout - check network/firewall settings');
                    } else if (error.code === 'ECONNREFUSED') {
                        console.error('   ⚠️ Connection refused - check host/port and firewall rules');
                    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                        console.error('   ⚠️ Access denied - check username/password');
                    }
                });
        } catch (error) {
            console.error('❌ Error initializing MySQL pool:', error.message);
            throw error;
        }
    }
    return connectionPool;
}

// ============================================================================
// SELLERS (Vendedores)
// ============================================================================

async function getAllSellers() {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for sellers');
        return [];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.sellers]
        );
        return rows;
    } catch (error) {
        console.error('❌ Error getting sellers:', error.message);
        console.error('   Error code:', error.code);
        console.error('   Error errno:', error.errno);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
        }
        return [];
    }
}

// ============================================================================
// CLIENTS (Clientes)
// ============================================================================

async function getAllClients() {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for clients');
        return [];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.clients]
        );
        return rows;
    } catch (error) {
        console.error('❌ Error getting clients:', error.message);
        console.error('   Error code:', error.code);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
        }
        return [];
    }
}

// ============================================================================
// STATUSES (Estados de Reserva)
// ============================================================================

async function getAllStatuses() {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for statuses');
        return [];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.statuses]
        );
        return rows;
    } catch (error) {
        console.error('❌ Error getting statuses:', error.message);
        console.error('   Error code:', error.code);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
        }
        return [];
    }
}

// ============================================================================
// RESERVATION TYPES (Tipos de Reserva)
// ============================================================================

async function getAllReservationTypes() {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for reservationTypes');
        return [];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.reservationTypes]
        );
        return rows;
    } catch (error) {
        console.error('❌ Error getting reservation types:', error.message);
        console.error('   Error code:', error.code);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
        }
        return [];
    }
}

// ============================================================================
// GENDERS (Sexo)
// ============================================================================

async function getAllGenders() {
    const pool = getMySQLConnection();
    if (!pool) {
        // Return defaults if no DB
        return [
            { id: 'M', code: 'M', name: 'MASCULINO' },
            { id: 'F', code: 'F', name: 'FEMENINO' }
        ];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.genders]
        );
        
        if (rows.length === 0) {
            return [
                { id: 'M', code: 'M', name: 'MASCULINO' },
                { id: 'F', code: 'F', name: 'FEMENINO' }
            ];
        }
        
        return rows;
    } catch (error) {
        console.error('❌ Error getting genders:', error.message);
        console.error('   Error code:', error.code);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - using defaults');
        }
        return [
            { id: 'M', code: 'M', name: 'MASCULINO' },
            { id: 'F', code: 'F', name: 'FEMENINO' }
        ];
    }
}

// ============================================================================
// DOCUMENT TYPES (Tipos de Documento)
// ============================================================================

async function getAllDocumentTypes() {
    const pool = getMySQLConnection();
    if (!pool) {
        return [
            { id: 'PAS', code: 'PAS', name: 'PASAPORTE' },
            { id: 'DNI', code: 'DNI', name: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
        ];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.documentTypes]
        );
        
        if (rows.length === 0) {
            return [
                { id: 'PAS', code: 'PAS', name: 'PASAPORTE' },
                { id: 'DNI', code: 'DNI', name: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
            ];
        }
        
        return rows;
    } catch (error) {
        console.error('❌ Error getting document types:', error.message);
        console.error('   Error code:', error.code);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - using defaults');
        }
        return [
            { id: 'PAS', code: 'PAS', name: 'PASAPORTE' },
            { id: 'DNI', code: 'DNI', name: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
        ];
    }
}

// ============================================================================
// COUNTRIES (Países/Nacionalidades)
// ============================================================================

async function getAllCountries() {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for countries');
        return [];
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY name`,
            [config.mysql.tables.countries]
        );
        return rows;
    } catch (error) {
        console.error('❌ Error getting countries:', error.message);
        console.error('   Error code:', error.code);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
        }
        return [];
    }
}

// ============================================================================
// EXTRACTIONS
// ============================================================================

async function saveExtraction(extraction) {
    const pool = getMySQLConnection();
    if (!pool) throw new Error('MySQL not configured');

    try {
        const tableName = config.mysql.tables.extractions;
        
        // Extract fields that go directly to table columns
        const {
            id,
            userId,
            userEmail,
            conversationId,
            extractedData, // This will go into the 'data' JSON field
            emailContentLength,
            qualityScore,
            confidence,
            passengersCount,
            extractedAt,
            processingTimeMs,
            ...otherFields
        } = extraction;

        // Build the data JSON object with all extraction metadata
        const dataJson = {
            extractedData,
            emailContentLength,
            qualityScore,
            confidence,
            passengersCount,
            extractedAt,
            processingTimeMs,
            ...otherFields
        };

        // Prepare insert data matching the table structure
        // If id is provided, include it; otherwise let MySQL generate UUID
        const insertData = {
            userId: userId || null,
            userEmail: userEmail || null,
            conversationId: conversationId || null,
            data: JSON.stringify(dataJson)
        };

        // Build query - include id only if provided
        let columns = ['userId', 'userEmail', 'conversationId', 'data'];
        let placeholders = ['?', '?', '?', '?'];
        let values = [insertData.userId, insertData.userEmail, insertData.conversationId, insertData.data];

        if (id) {
            insertData.id = id;
            columns.unshift('id');
            placeholders.unshift('?');
            values.unshift(id);
        }

        await pool.query(
            `INSERT INTO ?? (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            [tableName, ...values]
        );
        
        // Retrieve the inserted record to get the generated UUID
        // Use conversationId as it should be unique
        let insertedRecord;
        if (conversationId) {
            const [rows] = await pool.query(
                `SELECT * FROM ?? WHERE conversationId = ? LIMIT 1`,
                [tableName, conversationId]
            );
            insertedRecord = rows[0];
        } else if (id) {
            const [rows] = await pool.query(
                `SELECT * FROM ?? WHERE id = ? LIMIT 1`,
                [tableName, id]
            );
            insertedRecord = rows[0];
        }

        // Parse the data JSON for return
        let parsedData = {};
        if (insertedRecord && insertedRecord.data) {
            try {
                parsedData = typeof insertedRecord.data === 'string' 
                    ? JSON.parse(insertedRecord.data) 
                    : insertedRecord.data;
            } catch (parseError) {
                console.error('Error parsing data JSON:', parseError);
                parsedData = dataJson;
            }
        } else {
            parsedData = dataJson;
        }

        return {
            id: insertedRecord?.id || id,
            userId: insertData.userId,
            userEmail: insertData.userEmail,
            conversationId: insertData.conversationId,
            data: parsedData
        };
    } catch (error) {
        console.error('Error saving extraction:', error);
        throw error;
    }
}

// ============================================================================
// EXTRACTIONS BY CONVERSATION ID
// ============================================================================

async function getExtractionByConversationId(conversationId) {
  console.log('Getting extraction by conversationId:', conversationId);
  const pool = getMySQLConnection();
  if (!pool) throw new Error('MySQL not configured');

  try {
      const [rows] = await pool.query(
          `SELECT * FROM ?? WHERE conversationId = ? LIMIT 1`,
          [config.mysql.tables.extractions, conversationId]
      );
      
      if (rows.length === 0) {
          console.log('No extraction found for conversationId:', conversationId);
          return null;
      }

      const row = rows[0];
      
      // Parse the JSON data field
      let parsedData = {};
      if (row.data) {
          try {
              parsedData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          } catch (parseError) {
              console.error('Error parsing data JSON:', parseError);
              parsedData = {};
          }
      }

      // Return in the format expected by the frontend
      // The frontend expects extractedData directly (same format as when extracted)
      if (parsedData.extractedData) {
          // Return the extractedData object directly, which is what the frontend expects
          // This matches the format returned by extractReservationData
          const result = parsedData.extractedData;
          console.log('Extraction found:', row.id);
          return result;
      }

      // Fallback: if extractedData is not in the expected format, return the parsed data
      console.log('Extraction found but extractedData format unexpected:', row.id);
      return parsedData;
  } catch (error) {
      console.error('Error getting extraction by conversationId:', error);
      return null;
  }
}

// ============================================================================
// CATEGORIES
// ============================================================================

async function createCategory(category) {
    const pool = getMySQLConnection();
    if (!pool) throw new Error('MySQL not configured');

    try {
        const tableName = config.mysql.tables.categories;
        const categoryToSave = {
            id: category.id || `cat_${Date.now()}`,
            userId: category.userId || 'default',
            ...category,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Convert nested objects to JSON strings for MySQL storage
        const processedData = {};
        for (const [key, value] of Object.entries(categoryToSave)) {
            if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
                processedData[key] = JSON.stringify(value);
            } else {
                processedData[key] = value;
            }
        }

        const columns = Object.keys(processedData).join(', ');
        const placeholders = Object.keys(processedData).map(() => '?').join(', ');
        const values = Object.values(processedData);

        await pool.query(
            `INSERT INTO ?? (${columns}) VALUES (${placeholders})`,
            [tableName, ...values]
        );

        return categoryToSave;
    } catch (error) {
        console.error('Error creating category:', error);
        throw error;
    }
}

// ============================================================================
// RESERVATIONS
// ============================================================================

async function saveReservation(reservation) {
    const pool = getMySQLConnection();
    if (!pool) throw new Error('MySQL not configured');

    try {
        const tableName = config.mysql.tables.classifications;
        const id = reservation.id || `res_${Date.now()}`;
        const data = {
            id,
            type: 'extraction',
            ...reservation,
            createdAt: reservation.createdAt || new Date().toISOString(),
            updatedAt: reservation.updatedAt || new Date().toISOString()
        };

        // Convert nested objects to JSON strings for MySQL storage
        const processedData = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
                processedData[key] = JSON.stringify(value);
            } else {
                processedData[key] = value;
            }
        }

        const columns = Object.keys(processedData).join(', ');
        const placeholders = Object.keys(processedData).map(() => '?').join(', ');
        const values = Object.values(processedData);

        await pool.query(
            `INSERT INTO ?? (${columns}) VALUES (${placeholders})`,
            [tableName, ...values]
        );

        return { id, ...data };
    } catch (error) {
        console.error('Error saving reservation:', error);
        throw error;
    }
}

// ============================================================================
// USERS
// ============================================================================

async function getUserById(userId) {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for getUserById');
        return null;
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? WHERE id = ? LIMIT 1`,
            [config.mysql.tables.users, userId]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('❌ Error getting user by id:', error.message);
        console.error('   Error code:', error.code);
        console.error('   User ID:', userId);
        if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
            return null;
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
            throw new Error('Database connection error');
        }
        throw error;
    }
}

async function getUserByEmail(email) {
    const pool = getMySQLConnection();
    if (!pool) {
        console.warn('⚠️ MySQL connection pool not available for getUserByEmail');
        return null;
    }

    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? WHERE email = ? LIMIT 1`,
            [config.mysql.tables.users, email]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('❌ Error getting user by email:', error.message);
        console.error('   Error code:', error.code);
        console.error('   Email:', email);
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('   ⚠️ Connection timeout or refused - check MySQL configuration');
            throw new Error('Database connection error');
        }
        return null;
    }
}

export default {
    getAllSellers,
    getAllClients,
    getAllStatuses,
    getAllReservationTypes,
    getAllGenders,
    getAllDocumentTypes,
    getAllCountries,
    createCategory,
    saveReservation,
    saveExtraction,
    getExtractionByConversationId,
    getUserById,
    getUserByEmail
};
