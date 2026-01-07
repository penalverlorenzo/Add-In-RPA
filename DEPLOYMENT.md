# Guía de Despliegue en Azure

Esta guía te llevará paso a paso para desplegar el Add-in RPA en Azure usando Azure Static Web Apps para el frontend y Azure Container Instances para el backend con RPA.

## Tabla de Contenidos

1. [Prerrequisitos](#prerrequisitos)
2. [Arquitectura de Despliegue](#arquitectura-de-despliegue)
3. [Fase 1: Configurar Azure Container Registry](#fase-1-configurar-azure-container-registry)
4. [Fase 2: Construir y Subir Imagen Docker](#fase-2-construir-y-subir-imagen-docker)
5. [Fase 3: Desplegar Backend en Azure Container Apps](#fase-3-desplegar-backend-en-azure-container-apps)
6. [Fase 4: Desplegar Frontend en Azure Static Web Apps](#fase-4-desplegar-frontend-en-azure-static-web-apps)
7. [Fase 5: Configurar Variables de Entorno](#fase-5-configurar-variables-de-entorno)
8. [Fase 6: Actualizar y Publicar Manifest](#fase-6-actualizar-y-publicar-manifest)
9. [Fase 7: Testing y Validación](#fase-7-testing-y-validación)
10. [Troubleshooting](#troubleshooting)

## Prerrequisitos

### Software Requerido
- **Azure CLI** instalado ([Descargar](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
- **Docker Desktop** instalado ([Descargar](https://www.docker.com/products/docker-desktop))
- **Node.js 18+** instalado
- **Git** instalado
- Cuenta de **GitHub** (para CI/CD)

### Recursos de Azure Existentes
Según tu configuración, ya debes tener:
- ✅ **Azure Cosmos DB** configurado con datos maestros
- ✅ **Azure OpenAI** con deployment de GPT-4o-mini
- 🔑 Las credenciales de acceso a iTraffic

### Verificar Azure CLI
```bash
# Login a Azure
az login

# Verificar suscripción activa
az account show

# Si necesitas cambiar de suscripción
az account set --subscription "TU_SUBSCRIPTION_ID"
```

## Arquitectura de Despliegue

```
┌─────────────────────────────────────────────────────────────┐
│                    Outlook Cliente                          │
│                  (Desktop/Web/Mobile)                       │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Azure Static Web Apps (Frontend)                  │
│  • taskpane.html, taskpane.js, manifest.xml                │
│  • Servido con CDN global                                   │
│  • HTTPS automático con certificado SSL                    │
└────────────────────┬────────────────────────────────────────┘
                     │ API Calls (HTTPS)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│      Azure Container Apps/Instance (Backend)                │
│  • Express API Server (Node.js)                            │
│  • RPA Service con Playwright                              │
│  • 2 vCPU, 4GB RAM                                         │
└──────┬──────────────┬──────────────┬───────────────────────┘
       │              │              │
       ▼              ▼              ▼
  ┌─────────┐  ┌──────────┐  ┌──────────────┐
  │Cosmos DB│  │Azure     │  │iTraffic Web  │
  │(Maestros)│  │OpenAI    │  │(Externo)     │
  └─────────┘  └──────────┘  └──────────────┘
```

## Fase 1: Configurar Azure Container Registry

El Azure Container Registry (ACR) almacenará la imagen Docker del backend.

### 1.1 Crear Resource Group

```bash
# Definir variables
RESOURCE_GROUP="rg-addin-rpa-prod"
LOCATION="eastus"  # o tu región preferida

# Crear resource group
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION
```

### 1.2 Crear Azure Container Registry

```bash
# Nombre del registry (debe ser único globalmente, solo letras y números)
ACR_NAME="acraddinrpa"  # Cambia esto por un nombre único

# Crear ACR
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# Obtener credenciales
az acr credential show --name $ACR_NAME

# Guardar estas credenciales para después:
# - loginServer: acraddinrpa.azurecr.io
# - username: acraddinrpa
# - password: (se mostrará en la salida)
```

## Fase 2: Construir y Subir Imagen Docker

### 2.1 Construir Imagen Localmente (Opcional - para testing)

```bash
# Desde la raíz del proyecto
docker build -t addin-rpa-backend:latest .

# Probar localmente (necesitas un archivo .env)
docker run -p 3001:3001 --env-file .env addin-rpa-backend:latest
```

### 2.2 Subir Imagen a ACR

```bash
# Login a ACR
az acr login --name $ACR_NAME

# Tag de la imagen
docker tag addin-rpa-backend:latest $ACR_NAME.azurecr.io/addin-rpa-backend:latest

# Push a ACR
docker push $ACR_NAME.azurecr.io/addin-rpa-backend:latest

# Verificar que la imagen está en ACR
az acr repository list --name $ACR_NAME --output table
```

### 2.3 Configurar CI/CD con GitHub Actions (Recomendado)

El proyecto incluye workflows de GitHub Actions que automatizan el build y push.

**Configurar Secrets en GitHub:**

1. Ve a tu repositorio en GitHub
2. Settings → Secrets and variables → Actions → New repository secret
3. Agrega estos secrets:

```
ACR_LOGIN_SERVER = acraddinrpa.azurecr.io
ACR_USERNAME = acraddinrpa
ACR_PASSWORD = (password del paso 1.2)
```

Ahora cada push a `main` construirá y subirá automáticamente la imagen.

## Fase 3: Desplegar Backend en Azure Container Apps

Azure Container Apps es mejor que Container Instances para aplicaciones con Playwright porque ofrece más control y escalabilidad.

### 3.1 Crear Container Apps Environment

```bash
# Instalar extensión de Container Apps
az extension add --name containerapp --upgrade

# Crear environment
CONTAINERAPPS_ENVIRONMENT="env-addin-rpa"

az containerapp env create \
  --name $CONTAINERAPPS_ENVIRONMENT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### 3.2 Crear Container App

```bash
# Nombre de la app
CONTAINER_APP_NAME="ca-addin-rpa-backend"

# Obtener password de ACR
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Crear container app
az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINERAPPS_ENVIRONMENT \
  --image $ACR_NAME.azurecr.io/addin-rpa-backend:latest \
  --registry-server $ACR_NAME.azurecr.io \
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

echo "Backend URL: https://$BACKEND_URL"
# Guarda esta URL, la necesitarás para el frontend
```

## Fase 4: Desplegar Frontend en Azure Static Web Apps

### 4.1 Crear Static Web App desde Azure Portal

Es más fácil crear el Static Web App desde el portal porque configura automáticamente GitHub Actions.

1. Ve a [Azure Portal](https://portal.azure.com)
2. Busca "Static Web Apps" y haz clic en "Create"
3. Configuración:
   - **Resource Group**: `rg-addin-rpa-prod`
   - **Name**: `swa-addin-rpa`
   - **Plan type**: Free (o Standard si necesitas más features)
   - **Region**: Elige la más cercana
   - **Source**: GitHub
   - **Organization**: Tu usuario de GitHub
   - **Repository**: addin-rpa
   - **Branch**: main
   - **Build Presets**: Custom
   - **App location**: `/`
   - **Api location**: (dejar vacío)
   - **Output location**: `dist`

4. Haz clic en "Review + create" y luego "Create"

5. Azure creará automáticamente un workflow en `.github/workflows/azure-static-web-apps-xxx.yml`

### 4.2 Obtener URL del Frontend

```bash
# Obtener URL del Static Web App
FRONTEND_URL=$(az staticwebapp show \
  --name swa-addin-rpa \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" -o tsv)

echo "Frontend URL: https://$FRONTEND_URL"
```

### 4.3 Configurar Secrets en GitHub para el Frontend

Agrega estos secrets adicionales en GitHub:

```
FRONTEND_URL = https://swa-addin-rpa.azurestaticapps.net
BACKEND_URL = https://ca-addin-rpa-backend.xxx.azurecontainerapps.io
AZURE_STATIC_WEB_APPS_API_TOKEN = (se genera automáticamente al crear el Static Web App)
```

## Fase 5: Configurar Variables de Entorno

### 5.1 Configurar Variables en Container App

```bash
# Configurar todas las variables de entorno
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    "NODE_ENV=production" \
    "PORT=3001" \
    "CORS_ORIGIN=https://$FRONTEND_URL" \
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
```

### 5.2 Configurar Secrets (Valores Sensibles)

**IMPORTANTE**: Reemplaza los valores con tus credenciales reales.

```bash
# Agregar secrets
az containerapp secret set \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --secrets \
    itraffic-login-url="https://tu-itraffic-url.com/login" \
    itraffic-home-url="https://tu-itraffic-url.com/home" \
    itraffic-user="tu_usuario" \
    itraffic-password="tu_password" \
    openai-api-key="tu_azure_openai_key" \
    openai-endpoint="https://tu-resource.openai.azure.com/" \
    cosmos-endpoint="https://tu-cosmos.documents.azure.com:443/" \
    cosmos-key="tu_cosmos_key"

# Verificar que los secrets están configurados
az containerapp secret list \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP
```

### 5.3 Reiniciar Container App

```bash
# Reiniciar para aplicar cambios
az containerapp revision restart \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP
```

## Fase 6: Actualizar y Publicar Manifest

### 6.1 Actualizar manifest.xml

Edita `manifest.xml` y reemplaza todas las URLs de localhost:

```xml
<!-- Buscar y reemplazar -->
https://localhost:3000 → https://swa-addin-rpa.azurestaticapps.net
```

También actualiza:
- `<Id>`: Genera un nuevo GUID para producción
- `<ProviderName>`: Tu nombre u organización
- `<SupportUrl>`: URL de soporte

### 6.2 Rebuild y Deploy

```bash
# Build con URLs de producción
FRONTEND_URL=https://swa-addin-rpa.azurestaticapps.net \
BACKEND_URL=https://ca-addin-rpa-backend.xxx.azurecontainerapps.io \
npm run build

# El workflow de GitHub Actions hará esto automáticamente en cada push
```

### 6.3 Publicar Add-in en Microsoft 365

1. Ve al [Centro de Administración de Microsoft 365](https://admin.microsoft.com)
2. Settings → Integrated apps → Upload custom apps
3. Sube el archivo `dist/manifest.xml`
4. Configura quién puede usar el add-in
5. Haz clic en "Deploy"

**Nota**: La aprobación puede tardar hasta 24 horas.

## Fase 7: Testing y Validación

### 7.1 Verificar Backend

```bash
# Health check
curl https://$BACKEND_URL/api/rpa/health

# Debería retornar:
# {
#   "status": "ok",
#   "message": "Servicio RPA disponible",
#   "environment": "production",
#   "rpaLoaded": true,
#   "timestamp": "..."
# }
```

### 7.2 Verificar Frontend

Abre en el navegador:
```
https://swa-addin-rpa.azurestaticapps.net/taskpane.html
```

Deberías ver la interfaz del add-in.

### 7.3 Probar en Outlook

1. Abre Outlook (Web, Desktop o Mobile)
2. Abre un correo
3. Busca el add-in "Extractor RPA" en la barra de herramientas
4. Haz clic para abrir el panel
5. Prueba extraer datos de un correo

### 7.4 Monitorear Logs

```bash
# Ver logs del backend
az containerapp logs show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --follow

# Ver logs del frontend (en Azure Portal)
# Static Web Apps → swa-addin-rpa → Logs
```

## Troubleshooting

### Problema: Backend no responde

**Verificar que el container está corriendo:**
```bash
az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.runningStatus"
```

**Ver logs de errores:**
```bash
az containerapp logs show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --tail 100
```

**Verificar variables de entorno:**
```bash
az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.template.containers[0].env"
```

### Problema: CORS errors en el frontend

**Verificar configuración de CORS:**
```bash
# Asegúrate de que CORS_ORIGIN esté configurado correctamente
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "CORS_ORIGIN=https://$FRONTEND_URL"
```

### Problema: Playwright falla en el container

**Aumentar memoria:**
```bash
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --memory 8Gi
```

**Verificar que la imagen tiene Playwright instalado:**
```bash
# Rebuild la imagen Docker localmente y verifica
docker build -t test .
docker run -it test npx playwright --version
```

### Problema: Add-in no aparece en Outlook

1. Verifica que el manifest.xml está bien formado
2. Asegúrate de que todas las URLs son HTTPS
3. Verifica que el add-in está desplegado en el Admin Center
4. Espera hasta 24 horas para la propagación
5. Intenta en modo incógnito/privado

### Problema: Extracción con IA falla

**Verificar Azure OpenAI:**
```bash
# Probar endpoint directamente
curl -X POST https://$BACKEND_URL/api/extract \
  -H "Content-Type: application/json" \
  -d '{"emailContent":"Test email with passenger data...", "userId":"test"}'
```

**Ver logs específicos:**
```bash
az containerapp logs show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --follow | grep "extracción"
```

## Costos Estimados Mensuales

| Servicio | Plan | Costo Estimado |
|----------|------|----------------|
| Azure Static Web Apps | Free | $0 |
| Azure Container Apps | 2 vCPU, 4GB RAM | $30-50 |
| Azure Cosmos DB | 400 RU/s | $25 |
| Azure OpenAI | Pay-as-you-go | $5-20 (depende del uso) |
| Azure Container Registry | Basic | $5 |
| **TOTAL** | | **$65-100/mes** |

## Seguridad y Mejores Prácticas

### 1. Usar Azure Key Vault

Para mayor seguridad, almacena secrets en Key Vault:

```bash
# Crear Key Vault
az keyvault create \
  --name kv-addin-rpa \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Agregar secrets
az keyvault secret set \
  --vault-name kv-addin-rpa \
  --name itraffic-password \
  --value "tu_password"

# Configurar Managed Identity para Container App
az containerapp identity assign \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --system-assigned

# Dar permisos al Key Vault
# (requiere configuración adicional)
```

### 2. Habilitar Application Insights

```bash
# Crear Application Insights
az monitor app-insights component create \
  --app addin-rpa-insights \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP

# Obtener instrumentation key
APPINSIGHTS_KEY=$(az monitor app-insights component show \
  --app addin-rpa-insights \
  --resource-group $RESOURCE_GROUP \
  --query "instrumentationKey" -o tsv)

# Agregar a Container App
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=$APPINSIGHTS_KEY"
```

### 3. Configurar Alertas

Configura alertas para:
- Errores HTTP 5xx
- Alto uso de CPU/memoria
- Fallos del RPA
- Latencia alta

## Mantenimiento

### Actualizar Backend

```bash
# Rebuild y push nueva imagen
docker build -t $ACR_NAME.azurecr.io/addin-rpa-backend:latest .
docker push $ACR_NAME.azurecr.io/addin-rpa-backend:latest

# Container App se actualizará automáticamente
# O forzar actualización:
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/addin-rpa-backend:latest
```

### Actualizar Frontend

```bash
# Simplemente hacer push a main
git add .
git commit -m "Update frontend"
git push origin main

# GitHub Actions desplegará automáticamente
```

## Recursos Adicionales

- [Azure Static Web Apps Documentation](https://docs.microsoft.com/en-us/azure/static-web-apps/)
- [Azure Container Apps Documentation](https://docs.microsoft.com/en-us/azure/container-apps/)
- [Office Add-ins Documentation](https://docs.microsoft.com/en-us/office/dev/add-ins/)
- [Playwright in Docker](https://playwright.dev/docs/docker)

## Soporte

Para problemas o preguntas:
1. Revisa los logs en Azure Portal
2. Consulta esta documentación
3. Revisa los issues en GitHub
4. Contacta al equipo de desarrollo

---

**¡Felicitaciones! Tu Add-in RPA está ahora en producción en Azure.** 🎉

