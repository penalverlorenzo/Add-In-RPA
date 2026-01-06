# Configuración del Sistema RPA para Add-in de Outlook

Este documento explica cómo configurar y usar el sistema RPA integrado con el add-in de Outlook.

## 📋 Requisitos Previos

1. Node.js instalado (v16 o superior)
2. Los archivos RPA de iTraffic en la carpeta correcta
3. Playwright instalado (para el RPA)

## 🚀 Instalación

### 1. Instalar dependencias del add-in

```bash
cd D:\GitHub's Repositories\addin-rpa\addin-rpa
npm install
```

### 2. Instalar dependencias del RPA (si no están instaladas)

```bash
cd c:\Users\Abril\Downloads\itraffic-rpa
npm install
```

## 🔧 Configuración

### 1. Verificar la ruta del RPA

Edita el archivo `server/rpaServer.js` y asegúrate de que la ruta de importación sea correcta:

```javascript
import { runRpa } from '../../itraffic-rpa/rpa/rpaService.js';
```

Si tu carpeta de RPA está en otra ubicación, actualiza esta ruta.

### 2. Configurar la URL del servicio (opcional)

Si necesitas cambiar el puerto del servidor RPA, edita `src/taskpane/rpaService.js`:

```javascript
const RPA_SERVICE_URL = 'http://localhost:3001/api/rpa/create-reservation';
```

## 🎯 Uso

### Opción 1: Ejecutar todo junto (Recomendado)

Ejecuta el add-in y el servidor RPA simultáneamente:

```bash
npm run dev
```

Esto iniciará:
- El servidor de desarrollo del add-in en `https://localhost:3000`
- El servidor RPA en `http://localhost:3001`

### Opción 2: Ejecutar por separado

**Terminal 1 - Add-in:**
```bash
npm run dev-server
```

**Terminal 2 - Servidor RPA:**
```bash
npm run rpa-server
```

## 📱 Flujo de Trabajo

1. **Abrir el add-in en Outlook**
   - Abre un correo electrónico
   - Abre el panel del add-in

2. **Extraer datos del correo**
   - Click en "Extraer con IA"
   - Se mostrarán los formularios de pasajeros

3. **Editar/Agregar pasajeros**
   - Edita los datos extraídos
   - Agrega más pasajeros con "+ Agregar Pasajero"
   - Elimina pasajeros con el botón "✕"

4. **Crear reserva en iTraffic**
   - Click en "🚀 Crear Reserva en iTraffic"
   - El sistema enviará los datos al servidor RPA
   - El RPA se ejecutará automáticamente
   - Recibirás una notificación del resultado

## 🔍 Verificación

### Verificar que el servidor RPA está corriendo

```bash
curl http://localhost:3001/api/rpa/health
```

Deberías ver:
```json
{
  "status": "ok",
  "message": "Servicio RPA disponible",
  "timestamp": "2026-01-05T..."
}
```

## 📊 Formato de Datos

Los datos se transforman automáticamente del formulario al formato esperado por el RPA:

**Formulario → RPA:**
- `tipoPasajero` (adulto/menor/infante) → `paxType` (ADU/CHD/INF)
- `fechaNacimiento` (YYYY-MM-DD) → `birthDate` (MM/DD/YYYY)
- `sexo` (masculino/femenino) → `sex` (M/F)
- `nacionalidad` → `nationality` (UPPERCASE)

## 🐛 Troubleshooting

### Error: "No se pudo conectar con el servicio RPA"

**Solución:**
1. Verifica que el servidor RPA esté corriendo (`npm run rpa-server`)
2. Verifica que el puerto 3001 esté disponible
3. Revisa la consola del servidor para ver errores

### Error: "Cannot find module 'rpaService.js'"

**Solución:**
1. Verifica la ruta en `server/rpaServer.js`
2. Asegúrate de que los archivos RPA estén en la ubicación correcta

### El RPA no se ejecuta

**Solución:**
1. Revisa la consola del navegador (F12) para ver errores
2. Revisa la consola del servidor RPA
3. Verifica que Playwright esté instalado en el proyecto RPA

## 📝 Logs

### Ver logs del add-in
- Abre las DevTools del navegador (F12)
- Ve a la pestaña "Console"

### Ver logs del servidor RPA
- Revisa la terminal donde ejecutaste `npm run rpa-server`

## 🔐 Seguridad

⚠️ **Importante:** Este servidor RPA está configurado para desarrollo local. Para producción:

1. Agrega autenticación
2. Usa HTTPS
3. Valida todos los datos de entrada
4. Implementa rate limiting
5. Usa variables de entorno para configuración sensible

## 📚 Archivos Importantes

- `src/taskpane/taskpane.js` - Lógica del add-in
- `src/taskpane/rpaService.js` - Cliente del servicio RPA
- `server/rpaServer.js` - Servidor Express que ejecuta el RPA
- `package.json` - Configuración y scripts

## 🎨 Personalización

### Cambiar valores por defecto del RPA

Edita `src/taskpane/rpaService.js`:

```javascript
reservationType: 'AGENCIAS [COAG]',
status: 'PENDIENTE DE CONFIRMACION [PC]',
client: 'TU-CLIENTE',
seller: 'TU-VENDEDOR'
```

### Agregar más campos al formulario

1. Agrega el campo en `taskpane.js` → `crearFormularioPasajero()`
2. Actualiza `guardarDatos()` para capturar el nuevo campo
3. Actualiza `rpaService.js` → `transformarDatosParaRPA()` para mapear el campo

