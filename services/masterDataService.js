/**
 * Master Data Service - Simplified version for RPA Add-in
 * Manages reference data: Sellers, Clients, Statuses, Reservation Types, Genders, Document Types, Countries
 */

import { CosmosClient } from '@azure/cosmos';
import config from '../config/index.js';

let client = null;
let database = null;

function getCosmosClient() {
    if (!client && config.cosmosDb.endpoint && config.cosmosDb.key) {
        client = new CosmosClient({
            endpoint: config.cosmosDb.endpoint,
            key: config.cosmosDb.key
        });
        database = client.database(config.cosmosDb.databaseId);
    }
    return { client, database };
}

// ============================================================================
// SELLERS (Vendedores)
// ============================================================================

async function getAllSellers() {
    const { database } = getCosmosClient();
    if (!database) return [];

    try {
        const container = database.container(config.cosmosDb.containers.sellers);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        return resources;
    } catch (error) {
        console.error('❌ Error getting sellers:', error.message);
        return [];
    }
}

// ============================================================================
// CLIENTS (Clientes)
// ============================================================================

async function getAllClients() {
    const { database } = getCosmosClient();
    if (!database) return [];

    try {
        const container = database.container(config.cosmosDb.containers.clients);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        return resources;
    } catch (error) {
        console.error('❌ Error getting clients:', error.message);
        return [];
    }
}

// ============================================================================
// STATUSES (Estados de Reserva)
// ============================================================================

async function getAllStatuses() {
    const { database } = getCosmosClient();
    if (!database) return [];

    try {
        const container = database.container(config.cosmosDb.containers.statuses);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        return resources;
    } catch (error) {
        console.error('❌ Error getting statuses:', error.message);
        return [];
    }
}

// ============================================================================
// RESERVATION TYPES (Tipos de Reserva)
// ============================================================================

async function getAllReservationTypes() {
    const { database } = getCosmosClient();
    if (!database) return [];

    try {
        const container = database.container(config.cosmosDb.containers.reservationTypes);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        return resources;
    } catch (error) {
        console.error('❌ Error getting reservation types:', error.message);
        return [];
    }
}

// ============================================================================
// GENDERS (Sexo)
// ============================================================================

async function getAllGenders() {
    const { database } = getCosmosClient();
    if (!database) {
        // Return defaults if no DB
        return [
            { id: 'M', code: 'M', name: 'MASCULINO' },
            { id: 'F', code: 'F', name: 'FEMENINO' }
        ];
    }

    try {
        const container = database.container(config.cosmosDb.containers.genders);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        
        if (resources.length === 0) {
            return [
                { id: 'M', code: 'M', name: 'MASCULINO' },
                { id: 'F', code: 'F', name: 'FEMENINO' }
            ];
        }
        
        return resources;
    } catch (error) {
        console.error('❌ Error getting genders:', error.message);
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
    const { database } = getCosmosClient();
    if (!database) {
        return [
            { id: 'PAS', code: 'PAS', name: 'PASAPORTE' },
            { id: 'DNI', code: 'DNI', name: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
        ];
    }

    try {
        const container = database.container(config.cosmosDb.containers.documentTypes);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        
        if (resources.length === 0) {
            return [
                { id: 'PAS', code: 'PAS', name: 'PASAPORTE' },
                { id: 'DNI', code: 'DNI', name: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
            ];
        }
        
        return resources;
    } catch (error) {
        console.error('❌ Error getting document types:', error.message);
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
    const { database } = getCosmosClient();
    if (!database) return [];

    try {
        const container = database.container(config.cosmosDb.containers.countries);
        const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
        return resources;
    } catch (error) {
        console.error('❌ Error getting countries:', error.message);
        return [];
    }
}

export default {
    getAllSellers,
    getAllClients,
    getAllStatuses,
    getAllReservationTypes,
    getAllGenders,
    getAllDocumentTypes,
    getAllCountries
};

