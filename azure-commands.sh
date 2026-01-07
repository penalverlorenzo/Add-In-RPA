#!/bin/bash

# Script con comandos de Azure CLI para desplegar el Add-in RPA
# IMPORTANTE: Reemplaza los valores entre <> con tus valores reales
# Uso: Copia y pega los comandos uno por uno, o ejecuta el script completo

set -e

# ============================================================================
# CONFIGURACIÓN - EDITA ESTOS VALORES
# ============================================================================

RESOURCE_GROUP="rg-addin-rpa-prod-1"
LOCATION="brazilsouth"  # Cambia a tu región preferida
ACR_NAME="acraddinrpa1"  # Debe ser único globalmente, solo letras y números (sin guiones)
CONTAINERAPPS_ENVIRONMENT="env-addin-rpa-prod-1"
CONTAINER_APP_NAME="ca-addin-rpa-backend-1"
STATIC_WEB_APP_NAME="swa-addin-rpa-prod-1"

# ============================================================================
# PASO 1: LOGIN Y VERIFICACIÓN
# ============================================================================

echo "🔐 Paso 1: Login a Azure..."
az login

echo "📋 Verificando suscripción activa..."
az account show

# Si necesitas cambiar de suscripción, descomenta y edita:
# az account set --subscription "TU_SUBSCRIPTION_ID"

# ============================================================================
# PASO 2: CREAR RESOURCE GROUP
# ============================================================================

echo ""
echo "📦 Paso 2: Creando Resource Group..."
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# ============================================================================
# PASO 3: CREAR AZURE CONTAINER REGISTRY
# ============================================================================

echo ""
echo "🐳 Paso 3: Creando Azure Container Registry..."
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

echo ""
echo "🔑 Obteniendo credenciales del ACR..."
az acr credential show --name $ACR_NAME

echo ""
echo "⚠️  IMPORTANTE: Guarda estas credenciales para configurar GitHub Secrets:"
echo "   - ACR_LOGIN_SERVER: ${ACR_NAME}.azurecr.io"
echo "   - ACR_USERNAME: (mostrado arriba)"
echo "   - ACR_PASSWORD: (mostrado arriba)"
read -p "Presiona Enter cuando hayas guardado las credenciales..."

# ============================================================================
# PASO 4: BUILD Y PUSH DE IMAGEN DOCKER (OPCIONAL - LOCAL)
# ============================================================================

echo ""
echo "🏗️  Paso 4: Build y Push de imagen Docker..."
echo "Opción 1: Usar GitHub Actions (recomendado)"
echo "  - Configura los secrets en GitHub"
echo "  - Haz push a main y el workflow se ejecutará automáticamente"
echo ""
echo "Opción 2: Build y push manual desde aquí"
read -p "¿Quieres hacer build y push manual ahora? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Login a ACR..."
    az acr login --name $ACR_NAME
    
    echo "Building imagen..."
    docker build -t addin-rpa-backend:latest .
    
    echo "Tagging imagen..."
    docker tag addin-rpa-backend:latest ${ACR_NAME}.azurecr.io/addin-rpa-backend:latest
    
    echo "Pushing a ACR..."
    docker push ${ACR_NAME}.azurecr.io/addin-rpa-backend:latest
    
    echo "✅ Imagen subida a ACR"
else
    echo "⏭️  Saltando build manual. Usa GitHub Actions o hazlo después."
fi

# ============================================================================
# PASO 5: CREAR CONTAINER APPS ENVIRONMENT
# ============================================================================

echo ""
echo "🌍 Paso 5: Creando Container Apps Environment..."
az extension add --name containerapp --upgrade

az containerapp env create \
  --name $CONTAINERAPPS_ENVIRONMENT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# ============================================================================
# PASO 6: CREAR CONTAINER APP
# ============================================================================

echo ""
echo "🚀 Paso 6: Creando Container App..."

# Obtener password de ACR
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINERAPPS_ENVIRONMENT \
  --image ${ACR_NAME}.azurecr.io/addin-rpa-backend:latest \
  --registry-server ${ACR_NAME}.azurecr.io \
  --registry-username $ACR_NAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3001 \
  --ingress external \
  --cpu 2 \
  --memory 4Gi \
  --min-replicas 1 \
  --max-replicas 3

# Obtener URL del backend
BACKEND_URL=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
echo "✅ Container App creado exitosamente!"
echo "🌐 Backend URL: https://$BACKEND_URL"
echo ""
echo "⚠️  IMPORTANTE: Guarda esta URL para configurar el frontend"
read -p "Presiona Enter para continuar..."

# ============================================================================
# PASO 7: CONFIGURAR VARIABLES DE ENTORNO Y SECRETS
# ============================================================================

echo ""
echo "🔐 Paso 7: Configurando variables de entorno y secrets..."
echo ""
echo "⚠️  IMPORTANTE: Necesitas ingresar tus credenciales reales"
echo ""

# Pedir credenciales al usuario
read -p "iTraffic Login URL: " ITRAFFIC_LOGIN_URL
read -p "iTraffic Home URL: " ITRAFFIC_HOME_URL
read -p "iTraffic User: " ITRAFFIC_USER
read -sp "iTraffic Password: " ITRAFFIC_PASSWORD
echo ""
read -p "Azure OpenAI API Key: " AZURE_OPENAI_API_KEY
read -p "Azure OpenAI Endpoint: " AZURE_OPENAI_ENDPOINT
read -p "Cosmos DB Endpoint: " COSMOS_DB_ENDPOINT
read -p "Cosmos DB Key: " COSMOS_DB_KEY

echo ""
echo "Configurando secrets..."
az containerapp secret set \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --secrets \
    itraffic-login-url="$ITRAFFIC_LOGIN_URL" \
    itraffic-home-url="$ITRAFFIC_HOME_URL" \
    itraffic-user="$ITRAFFIC_USER" \
    itraffic-password="$ITRAFFIC_PASSWORD" \
    openai-api-key="$AZURE_OPENAI_API_KEY" \
    openai-endpoint="$AZURE_OPENAI_ENDPOINT" \
    cosmos-endpoint="$COSMOS_DB_ENDPOINT" \
    cosmos-key="$COSMOS_DB_KEY"

echo ""
echo "Configurando variables de entorno..."
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    "NODE_ENV=production" \
    "PORT=3001" \
    "CORS_ORIGIN=https://placeholder-will-update-later.azurestaticapps.net" \
    "ITRAFFIC_LOGIN_URL=secretref:itraffic-login-url" \
    "ITRAFFIC_HOME_URL=secretref:itraffic-home-url" \
    "ITRAFFIC_USER=secretref:itraffic-user" \
    "ITRAFFIC_PASSWORD=secretref:itraffic-password" \
    "AZURE_OPENAI_API_KEY=secretref:openai-api-key" \
    "AZURE_OPENAI_ENDPOINT=secretref:openai-endpoint" \
    "AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini" \
    "COSMOS_DB_ENDPOINT=secretref:cosmos-endpoint" \
    "COSMOS_DB_KEY=secretref:cosmos-key" \
    "COSMOS_DB_DATABASE_ID=iTrafficDB"

echo ""
echo "✅ Variables de entorno configuradas"

# ============================================================================
# PASO 8: VERIFICAR BACKEND
# ============================================================================

echo ""
echo "🏥 Paso 8: Verificando backend..."
sleep 5

echo "Health check..."
HEALTH_RESPONSE=$(curl -s "https://$BACKEND_URL/api/rpa/health" 2>/dev/null || echo "Error")
echo "$HEALTH_RESPONSE"

echo ""
echo "Si ves un JSON con status: 'ok', el backend está funcionando correctamente"
read -p "Presiona Enter para continuar..."

# ============================================================================
# PASO 9: CREAR STATIC WEB APP (INSTRUCCIONES)
# ============================================================================

echo ""
echo "🌐 Paso 9: Crear Azure Static Web App"
echo ""
echo "El Static Web App se crea mejor desde el Portal de Azure porque"
echo "configura automáticamente GitHub Actions."
echo ""
echo "Pasos:"
echo "1. Ve a https://portal.azure.com"
echo "2. Busca 'Static Web Apps' y haz clic en 'Create'"
echo "3. Configuración:"
echo "   - Resource Group: $RESOURCE_GROUP"
echo "   - Name: $STATIC_WEB_APP_NAME"
echo "   - Plan: Free"
echo "   - Region: elige la más cercana"
echo "   - Source: GitHub"
echo "   - Repository: tu-usuario/addin-rpa"
echo "   - Branch: main"
echo "   - Build Presets: Custom"
echo "   - App location: /"
echo "   - Api location: vacío"
echo "   - Output location: dist"
echo "4. Haz clic en 'Review + create' y luego 'Create'"
echo "5. Azure creará automáticamente un workflow en GitHub"
echo ""
read -p "Presiona Enter cuando hayas creado el Static Web App..."

# ============================================================================
# PASO 10: OBTENER URL DEL FRONTEND Y ACTUALIZAR CORS
# ============================================================================

echo ""
echo "🔄 Paso 10: Actualizando CORS con URL del frontend..."

# Intentar obtener URL del Static Web App
FRONTEND_URL=$(az staticwebapp show \
  --name $STATIC_WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" -o tsv 2>/dev/null || echo "")

if [ -z "$FRONTEND_URL" ]; then
    echo "⚠️  No se pudo obtener automáticamente la URL del Static Web App"
    read -p "Ingresa la URL del frontend (sin https://): " FRONTEND_URL
fi

echo "Frontend URL: https://$FRONTEND_URL"

# Actualizar CORS
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "CORS_ORIGIN=https://$FRONTEND_URL"

echo "✅ CORS actualizado"

# ============================================================================
# PASO 11: CONFIGURAR GITHUB SECRETS
# ============================================================================

echo ""
echo "🔐 Paso 11: Configurar GitHub Secrets"
echo ""
echo "Ve a tu repositorio en GitHub:"
echo "Settings → Secrets and variables → Actions → New repository secret"
echo ""
echo "Agrega estos secrets:"
echo ""
echo "ACR_LOGIN_SERVER = ${ACR_NAME}.azurecr.io"
echo "ACR_USERNAME = $ACR_NAME"
echo "ACR_PASSWORD = obtener con: az acr credential show --name $ACR_NAME"
echo ""
echo "FRONTEND_URL = https://$FRONTEND_URL"
echo "BACKEND_URL = https://$BACKEND_URL"
echo ""
echo "AZURE_STATIC_WEB_APPS_API_TOKEN = se genera automáticamente al crear Static Web App"
echo "  Para obtenerlo: az staticwebapp secrets list --name $STATIC_WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
read -p "Presiona Enter cuando hayas configurado los secrets..."

# ============================================================================
# PASO 12: RESUMEN FINAL
# ============================================================================

echo ""
echo "============================================================================"
echo "✅ DESPLIEGUE COMPLETADO"
echo "============================================================================"
echo ""
echo "📊 Resumen de recursos creados:"
echo ""
echo "Resource Group:      $RESOURCE_GROUP"
echo "Container Registry:  ${ACR_NAME}.azurecr.io"
echo "Container App:       $CONTAINER_APP_NAME"
echo "Backend URL:         https://$BACKEND_URL"
echo "Static Web App:      $STATIC_WEB_APP_NAME"
echo "Frontend URL:        https://$FRONTEND_URL"
echo ""
echo "🔗 URLs importantes:"
echo "  Backend Health:    https://$BACKEND_URL/api/rpa/health"
echo "  Frontend:          https://$FRONTEND_URL/taskpane.html"
echo ""
echo "📝 Próximos pasos:"
echo "  1. Actualiza manifest.xml con la URL del frontend"
echo "  2. Rebuild el frontend: npm run build"
echo "  3. Push a GitHub para desplegar automáticamente"
echo "  4. Sube manifest.xml al Microsoft 365 Admin Center"
echo "  5. Prueba el add-in en Outlook"
echo ""
echo "📚 Documentación:"
echo "  - Ver logs: az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --follow"
echo "  - Reiniciar: az containerapp revision restart --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo "🎉 ¡Felicitaciones! Tu Add-in RPA está desplegado en Azure."
echo ""

