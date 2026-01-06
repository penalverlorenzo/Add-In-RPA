# 🤖 RPA iTraffic

Este módulo contiene toda la lógica de automatización RPA para crear reservas en iTraffic.

## 📁 Estructura de Archivos

```
rpa/
├── rpaService.js       # Servicio principal que orquesta el RPA
├── browser.js          # Manejo del navegador y sesiones
├── login.js            # Lógica de autenticación
├── session.js          # Verificación de sesión activa
├── dashboard.js        # Navegación al dashboard
├── newReservation.js   # Apertura del modal de nueva reserva
├── dataReservation.js  # Llenado del formulario de reserva
├── helpers/
│   └── utils.js        # Funciones auxiliares (select2, fillInput)
└── utils/
    └── screenshot.js   # Captura de pantallas
```

## 🔧 Configuración

### 1. Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
ITRAFFIC_LOGIN_URL=https://tu-servidor-itraffic.com/login
ITRAFFIC_HOME_URL=https://tu-servidor-itraffic.com/home
ITRAFFIC_USER=tu_usuario
ITRAFFIC_PASSWORD=tu_password
```

### 2. Instalar Playwright

```bash
npm install
npx playwright install chromium
```

## 🚀 Uso

### Desde el Servidor Express

El RPA se ejecuta automáticamente cuando se hace una petición POST al endpoint `/api/rpa/create-reservation`.

### Uso Directo (para testing)

```javascript
import { runRpa } from './rpa/rpaService.js';

const reservationData = {
  passengers: [
    {
      lastName: 'Pérez',
      firstName: 'Juan',
      paxType: 'ADU',
      birthDate: '01/15/1990',
      nationality: 'ARGENTINA',
      sex: 'M',
      documentNumber: '12345678',
      documentType: 'DNI',
      cuilCuit: '20123456789',
      direccion: 'Calle Falsa 123'
    }
  ],
  reservationType: 'AGENCIAS [COAG]',
  status: 'PENDIENTE DE CONFIRMACION [PC]',
  client: 'DESPEGAR - TEST - 1',
  travelDate: '12/01/2026',
  seller: 'TEST TEST'
};

const resultado = await runRpa(reservationData);
console.log(resultado);
```

## 📊 Formato de Datos

### Entrada (reservationData)

```javascript
{
  passengers: [
    {
      lastName: string,        // Apellido
      firstName: string,       // Nombre
      paxType: 'ADU'|'CHD'|'INF', // Tipo: Adulto, Niño, Infante
      birthDate: string,       // Formato: MM/DD/YYYY
      nationality: string,     // MAYÚSCULAS
      sex: 'M'|'F'|'O',       // Masculino, Femenino, Otro
      documentNumber: string,  // Número de documento
      documentType: string,    // DNI, PASAPORTE, etc.
      cuilCuit: string,       // CUIL/CUIT
      direccion: string       // Dirección completa
    }
  ],
  reservationType: string,   // Tipo de reserva
  status: string,           // Estado de la reserva
  client: string,           // Cliente
  travelDate: string,       // Fecha de viaje (MM/DD/YYYY)
  seller: string            // Vendedor
}
```

### Salida (resultado)

```javascript
{
  success: true,
  message: 'Reserva creada exitosamente',
  timestamp: '2026-01-05T...'
}
```

## 🔍 Debugging

### Screenshots

El RPA captura screenshots automáticamente en cada paso importante. Los archivos se guardan en `/tmp/` con nombres descriptivos:

- `login-01-page.png`
- `login-02-filled.png`
- `dashboard-01-loaded.png`
- etc.

### Logs

El RPA genera logs detallados en la consola:

```
🚀 Iniciando RPA iTraffic
🔎 Verificando sesión activa en iTraffic
✅ Ya está logueado
🏠 Verificando dashboard de iTraffic
✅ Dashboard cargado
...
```

### Modo Headless

Para ver el navegador en acción (debugging), edita `browser.js`:

```javascript
const browser = await chromium.launch({
  headless: false, // Cambiar a false
  args: ['--no-sandbox']
});
```

## ⚙️ Funciones Principales

### `runRpa(reservationData)`

Función principal que ejecuta todo el flujo RPA.

**Pasos:**
1. Crea el navegador con sesión persistente
2. Verifica si hay sesión activa
3. Si no hay sesión, hace login
4. Navega al dashboard
5. Abre el modal de nueva reserva
6. Llena el formulario con los datos
7. Cierra el navegador

### `createBrowser()`

Crea una instancia de navegador Chromium con sesión persistente.

### `loginITraffic(page)`

Realiza el login en iTraffic usando las credenciales del `.env`.

### `ensureSession(page)`

Verifica si hay una sesión activa. Retorna `true` si está logueado.

### `navigateToDashboard(page)`

Navega al dashboard y hace click en "Nueva Reserva".

### `newReservation(page, reservationData)`

Abre el modal de nueva reserva y llena el formulario.

### `dataReservation(page, reservationData)`

Llena todos los campos del formulario de reserva.

## 🛠️ Helpers

### `select2BySearch(page, containerSelector, valueToSelect)`

Busca y selecciona un valor en un dropdown Select2.

### `fillInput(page, selector, value, isDate)`

Llena un campo de input con scroll automático. Si `isDate` es `true`, presiona Tab después de llenar.

## 🔒 Sesiones Persistentes

El RPA guarda las cookies y el estado de sesión en `.browser-session/session.json`. Esto permite:

- No tener que hacer login cada vez
- Mantener la sesión activa entre ejecuciones
- Reducir el tiempo de ejecución

Para limpiar la sesión, elimina el archivo `.browser-session/session.json`.

## ⚠️ Notas Importantes

1. **Selectores**: Los selectores están hardcodeados para la versión actual de iTraffic. Si cambia la interfaz, necesitarán actualizarse.

2. **Timeouts**: Los timeouts están configurados para conexiones lentas. Puedes ajustarlos en cada archivo.

3. **Screenshots en Windows**: La ruta `/tmp/` puede no funcionar en Windows. Considera cambiarla a una ruta absoluta o usar `os.tmpdir()`.

4. **Headless**: Por defecto corre en modo headless. Para debugging, cambia a `headless: false`.

5. **Datos por defecto**: Si no se proporcionan datos, usa valores de prueba definidos en `dataReservation.js`.

