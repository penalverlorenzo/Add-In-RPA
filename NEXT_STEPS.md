# 🎯 Próximos Pasos - Despliegue Completado

## ✅ Lo que ya está hecho:

1. ✅ **Infraestructura en Azure desplegada**
   - Resource Group: `rg-addin-rpa-prod-1`
   - Container Registry: `acraddinrpa1.azurecr.io`
   - Container App (Backend): `ca-addin-rpa-backend-1`
   - Static Web App (Frontend): `swa-addin-rpa-prod-1`

2. ✅ **manifest.xml actualizado**
   - Todas las URLs cambiadas de localhost a producción
   - ProviderName actualizado a "Abril Cantera"
   - DisplayName actualizado a "iTraffic RPA Extractor"

3. ✅ **Scripts de despliegue creados**
   - `build-production.ps1` - Build con URLs de producción
   - `PRODUCTION_URLS.md` - Documentación de URLs
   - Workflows de GitHub Actions configurados

---

## 📝 PASOS QUE DEBES HACER AHORA:

### Paso 1: Build del Frontend para Producción

```powershell
# Opción A: Usar el script automatizado
npm run build:prod

# Opción B: Build manual
$env:FRONTEND_URL = "https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net"
$env:BACKEND_URL = "https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io"
npm run build
```

**Resultado esperado**: Carpeta `dist/` con todos los archivos compilados

---

### Paso 2: Configurar GitHub Secrets

Ve a: https://github.com/abril-cantera/Add-In-RPA/settings/secrets/actions

Haz clic en **"New repository secret"** y agrega cada uno:

#### Secrets Requeridos:

1. **ACR_LOGIN_SERVER**
   ```
   acraddinrpa1.azurecr.io
   ```

2. **ACR_USERNAME**
   ```
   acraddinrpa1
   ```

3. **ACR_PASSWORD**
   ```powershell
   # Obtener con este comando:
   az acr credential show --name acraddinrpa1 --query "passwords[0].value" -o tsv
   ```

4. **FRONTEND_URL**
   ```
   https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net
   ```

5. **BACKEND_URL**
   ```
   https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io
   ```

6. **AZURE_STATIC_WEB_APPS_API_TOKEN**
   - Ve al Portal de Azure: https://portal.azure.com
   - Busca: `swa-addin-rpa-prod-1`
   - Settings → Configuration → Deployment token
   - Copia el token completo

---

### Paso 3: Commit y Push a GitHub

```powershell
# Ver cambios
git status

# Agregar todos los archivos
git add .

# Commit
git commit -m "Configure production deployment with Azure URLs"

# Push a GitHub
git push origin main
```

**Resultado esperado**: 
- GitHub Actions se ejecutará automáticamente
- El frontend se desplegará a Azure Static Web Apps
- El backend ya está desplegado

---

### Paso 4: Verificar Despliegue

#### Verificar Backend:
```powershell
# Health check
curl https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io/api/rpa/health

# Debería retornar JSON con "status": "ok"
```

#### Verificar Frontend:
Abre en el navegador:
```
https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net/taskpane.html
```

Deberías ver la interfaz del add-in.

---

### Paso 5: Publicar Add-in en Microsoft 365

1. **Ve al Centro de Administración de Microsoft 365**
   - https://admin.microsoft.com

2. **Navega a Integrated Apps**
   - Settings → Integrated apps → Upload custom apps

3. **Sube el manifest**
   - Haz clic en "Upload custom apps"
   - Selecciona "Upload an app from a file"
   - Sube el archivo: `dist/manifest.xml`

4. **Configura el despliegue**
   - Selecciona quién puede usar el add-in:
     - Solo tú (para testing)
     - Usuarios específicos
     - Toda la organización
   - Haz clic en "Deploy"

5. **Espera la aprobación**
   - El proceso puede tardar hasta 24 horas
   - Recibirás un email cuando esté listo

---

### Paso 6: Probar el Add-in en Outlook

#### Outlook Web:
1. Ve a: https://outlook.office.com
2. Abre un correo
3. Busca el botón "Extractor RPA" o "Extraer Datos"
4. Haz clic para abrir el panel lateral
5. Prueba la funcionalidad

#### Outlook Desktop:
1. Abre Outlook Desktop
2. Abre un correo
3. En la cinta de opciones, busca "Extractor RPA"
4. Haz clic para abrir el panel
5. Prueba la funcionalidad

---

## 🧪 Testing Completo

### 1. Test de Extracción con IA
- Abre un correo con datos de pasajeros
- Haz clic en "Extraer con IA"
- Verifica que los datos se extraen correctamente

### 2. Test de Datos Maestros
- Verifica que los dropdowns cargan:
  - Vendedores
  - Clientes
  - Países
  - Tipos de documento

### 3. Test de Creación de Reserva
- Llena el formulario completo
- Agrega al menos un pasajero
- Haz clic en "Crear Reserva en iTraffic"
- Verifica que el RPA se ejecuta correctamente

---

## 📊 Monitoreo

### Ver Logs del Backend:
```powershell
az containerapp logs show `
  --name ca-addin-rpa-backend-1 `
  --resource-group rg-addin-rpa-prod-1 `
  --follow
```

### Ver Estado del Frontend:
- Ve a: https://portal.azure.com
- Busca: `swa-addin-rpa-prod-1`
- Revisa el estado del deployment

### Ver Workflows de GitHub:
- Ve a: https://github.com/abril-cantera/Add-In-RPA/actions
- Verifica que los workflows se ejecutan sin errores

---

## 🚨 Troubleshooting

### Si el frontend no carga:
1. Verifica que el build se completó sin errores
2. Verifica que GitHub Actions se ejecutó exitosamente
3. Verifica las URLs en el manifest.xml

### Si el backend no responde:
1. Verifica el health endpoint
2. Revisa los logs del Container App
3. Verifica que las variables de entorno están configuradas

### Si el RPA falla:
1. Verifica las credenciales de iTraffic
2. Revisa los logs para ver el error específico
3. Verifica que Playwright tiene suficiente memoria (4GB mínimo)

---

## 📚 Documentación Adicional

- **DEPLOYMENT.md** - Guía completa de despliegue
- **PRODUCTION_URLS.md** - URLs y recursos de Azure
- **DEPLOYMENT_SUMMARY.md** - Resumen ejecutivo
- **README.md** - Documentación general

---

## ✨ ¡Felicitaciones!

Has desplegado exitosamente tu Add-in RPA en Azure. 🎉

**Siguiente paso inmediato**: Ejecuta `npm run build:prod` y luego haz push a GitHub.

¿Necesitas ayuda con algún paso? Consulta la documentación o revisa los logs.

