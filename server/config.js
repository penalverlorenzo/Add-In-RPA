/**
 * Configuración centralizada para el servidor RPA
 * Maneja variables de entorno para desarrollo y producción
 */

import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Configuración del servidor
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Configuración de CORS
  corsOrigin: process.env.CORS_ORIGIN || 'https://localhost:3000',
  
  // Configuración de iTraffic
  itraffic: {
    loginUrl: process.env.ITRAFFIC_LOGIN_URL,
    homeUrl: process.env.ITRAFFIC_HOME_URL,
    user: process.env.ITRAFFIC_USER,
    password: process.env.ITRAFFIC_PASSWORD
  },
  
  // Configuración de Azure OpenAI
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini'
  },
  
  // Configuración de Cosmos DB
  cosmosDB: {
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
    databaseId: process.env.COSMOS_DB_DATABASE_ID || 'iTrafficDB'
  },
  
  // Validar configuración requerida
  validate() {
    const required = [
      { name: 'ITRAFFIC_LOGIN_URL', value: this.itraffic.loginUrl },
      { name: 'ITRAFFIC_USER', value: this.itraffic.user },
      { name: 'ITRAFFIC_PASSWORD', value: this.itraffic.password },
      { name: 'AZURE_OPENAI_API_KEY', value: this.azureOpenAI.apiKey },
      { name: 'AZURE_OPENAI_ENDPOINT', value: this.azureOpenAI.endpoint },
      { name: 'COSMOS_DB_ENDPOINT', value: this.cosmosDB.endpoint },
      { name: 'COSMOS_DB_KEY', value: this.cosmosDB.key }
    ];
    
    const missing = required.filter(r => !r.value);
    
    if (missing.length > 0) {
      const missingNames = missing.map(m => m.name).join(', ');
      throw new Error(`Faltan variables de entorno requeridas: ${missingNames}`);
    }
    
    return true;
  },
  
  // Verificar si está en modo producción
  isProduction() {
    return this.nodeEnv === 'production';
  },
  
  // Verificar si está en modo desarrollo
  isDevelopment() {
    return this.nodeEnv === 'development';
  }
};

export default config;

