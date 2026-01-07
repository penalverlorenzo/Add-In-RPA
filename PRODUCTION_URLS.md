# URLs de Producción - Add-in RPA

## 🌐 URLs del Despliegue

### Frontend (Azure Static Web App)
- **URL Principal**: https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net
- **Taskpane**: https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net/taskpane.html
- **Commands**: https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net/commands.html

### Backend (Azure Container App)
- **URL Base**: https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io
- **Health Check**: https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io/api/rpa/health
- **Master Data**: https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io/api/master-data
- **Extract**: https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io/api/extract
- **Create Reservation**: https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io/api/rpa/create-reservation

## 📦 Recursos de Azure

- **Resource Group**: rg-addin-rpa-prod-1
- **Container Registry**: acraddinrpa1.azurecr.io
- **Container App**: ca-addin-rpa-backend-1
- **Static Web App**: swa-addin-rpa-prod-1
- **Location**: Brazil South

## ✅ Estado Actual

- [x] Resource Group creado
- [x] Azure Container Registry creado
- [x] Imagen Docker construida y subida
- [x] Container App desplegado
- [x] Static Web App creado
- [x] manifest.xml actualizado con URLs de producción
- [ ] Frontend construido y desplegado
- [ ] GitHub Secrets configurados
- [ ] Add-in publicado en Microsoft 365

## 📝 Próximos Pasos

### 1. Configurar Variables de Entorno para Build
```bash
# En tu terminal o en GitHub Secrets
FRONTEND_URL=https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net
BACKEND_URL=https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io
```

### 2. Build del Frontend
```bash
npm run build
```

### 3. Configurar GitHub Secrets
Ve a: https://github.com/abril-cantera/Add-In-RPA/settings/secrets/actions

Agrega estos secrets:
- `ACR_LOGIN_SERVER` = acraddinrpa1.azurecr.io
- `ACR_USERNAME` = acraddinrpa1
- `ACR_PASSWORD` = (obtener con: az acr credential show --name acraddinrpa1)
- `FRONTEND_URL` = https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net
- `BACKEND_URL` = https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io
- `AZURE_STATIC_WEB_APPS_API_TOKEN` = (obtener del portal de Azure)

### 4. Push a GitHub
```bash
git add .
git commit -m "Configure production URLs and deployment"
git push origin main
```

### 5. Publicar Add-in en Microsoft 365
1. Ve a: https://admin.microsoft.com
2. Settings → Integrated apps → Upload custom apps
3. Sube el archivo `dist/manifest.xml`
4. Configura permisos y usuarios
5. Deploy

## 🧪 Testing

### Verificar Backend
```bash
curl https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io/api/rpa/health
```

### Verificar Frontend
Abre en el navegador:
https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net/taskpane.html

## 📚 Comandos Útiles

### Ver logs del backend
```bash
az containerapp logs show \
  --name ca-addin-rpa-backend-1 \
  --resource-group rg-addin-rpa-prod-1 \
  --follow
```

### Reiniciar backend
```bash
az containerapp revision restart \
  --name ca-addin-rpa-backend-1 \
  --resource-group rg-addin-rpa-prod-1
```

### Actualizar CORS
```bash
az containerapp update \
  --name ca-addin-rpa-backend-1 \
  --resource-group rg-addin-rpa-prod-1 \
  --set-env-vars "CORS_ORIGIN=https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net"
```

## 🔐 Seguridad

- ✅ HTTPS habilitado en todos los endpoints
- ✅ CORS configurado para el frontend específico
- ✅ Secrets almacenados en Azure Container App
- ⚠️ Considerar agregar Azure Key Vault para mayor seguridad

## 💰 Costos Estimados

- Azure Static Web Apps (Free): $0/mes
- Azure Container Apps: ~$30-50/mes
- Azure Container Registry (Basic): ~$5/mes
- Azure Cosmos DB: ~$25/mes
- Azure OpenAI: Variable según uso

**Total estimado**: $60-80/mes

---

**Última actualización**: $(date)
**Estado**: Infraestructura desplegada, pendiente build de frontend

