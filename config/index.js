/**
 * Configuration for the application
 * Loads environment variables from .env file
 */

require('dotenv').config();

module.exports = {
    // Azure OpenAI Configuration
    openai: {
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
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
            sellers: 'Sellers',
            clients: 'Clients',
            statuses: 'Statuses',
            reservationTypes: 'ReservationTypes',
            genders: 'Genders',
            documentTypes: 'DocumentTypes',
            countries: 'Countries'
        }
    }
};

