/**
 * Configuration for the application
 * Loads environment variables from .env file
 */

import dotenv from 'dotenv';
dotenv.config();

export default {
    // Azure OpenAI Configuration
    openai: {
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
        apiVersion: '2024-08-01-preview'
    },
    imageExtractor: {
        apiKey: process.env.AZURE_OPENAI_IMAGE_EXTRACTOR_API_KEY,
        endpoint: process.env.AZURE_OPENAI_IMAGE_EXTRACTOR_API_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_IMAGE_EXTRACTOR_API_DEPLOYMENT || 'gpt-4o-mini',
        apiVersion: process.env.AZURE_OPENAI_IMAGE_EXTRACTOR_API_VERSION || '2025-09-01-preview'
    },

    // Azure Computer Vision Configuration (for OCR)
    // Uses the same API key as OpenAI, only endpoint is different
    computerVision: {
        endpoint: process.env.AZURE_COMPUTER_VISION_ENDPOINT
    },

    // Azure AI Foundry Assistant Configuration
    assistant: {
        assistantId: process.env.AZURE_OPENAI_ASSISTANT_ID,
        vectorStoreId: process.env.AZURE_OPENAI_VECTOR_STORE_ID,
        // Uses the same endpoint and API key as config.openai
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: '2024-08-01-preview'
    },

    // Server Configuration
    server: {
        port: process.env.PORT || 3001,
        corsOrigin: process.env.CORS_ORIGIN || 'https://localhost:3000'
    },

    // iTraffic RPA Configuration
    itraffic: {
        loginUrl: process.env.ITRAFFIC_LOGIN_URL,
        homeUrl: process.env.ITRAFFIC_HOME_URL,
        user: process.env.ITRAFFIC_USER,
        password: process.env.ITRAFFIC_PASSWORD
    },

    // Cosmos DB Configuration
    cosmosDb: {
        endpoint: process.env.COSMOS_DB_ENDPOINT,
        key: process.env.COSMOS_DB_KEY,
        databaseId: process.env.COSMOS_DB_DATABASE_ID || 'iTrafficDB',
        containers: {
          users: 'Users',
          rules: 'Rules',
          classifications: 'Classifications',
          categories: 'Categories',
          extractions: 'Extractions',
          // Master data containers for RPA
          sellers: 'Sellers',
          clients: 'Clients',
          currencies: 'Currencies',
          statuses: 'Statuses',
          reservationTypes: 'ReservationTypes',
          // Passenger data containers
          genders: 'Genders',
          documentTypes: 'DocumentTypes',
          countries: 'Countries',
          contacts: 'Contacts'
        }
    },

    // MySQL Configuration (Azure)
    mysql: {
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT || 3306,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE || 'iTrafficDB',
        ssl: process.env.MYSQL_SSL === 'true' || false,
        // Table names mapping (equivalent to Cosmos containers)
        tables: {
            users: 'users',
            rules: 'rules',
            classifications: 'classifications',
            categories: 'categories',
            extractions: 'extractions',
            reservationsHistory: 'reservations_history',
            // Master data tables for RPA
            sellers: 'sellers',
            clients: 'clients',
            currencies: 'currencies',
            statuses: 'statuses',
            reservationTypes: 'reservationTypes',
            // Passenger data tables
            genders: 'genders',
            documentTypes: 'documentTypes',
            countries: 'countries',
            contacts: 'contacts'
        }
    }
};
