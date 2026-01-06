# Configuración de Datos Maestros

Este documento explica cómo configurar los datos maestros (vendedores, clientes, estados, etc.) desde Cosmos DB.

## 📋 ¿Qué se agregó?

### 1. **Servicio de Datos Maestros** (`services/masterDataService.js`)
Servicio simplificado que obtiene datos desde Cosmos DB:
- Vendedores (sellers)
- Clientes (clients)
- Estados de reserva (statuses)
- Tipos de reserva (reservationTypes)
- Géneros (genders)
- Tipos de documento (documentTypes)
- Países/Nacionalidades (countries)

### 2. **Endpoint en el servidor** (`server/rpaServer.js`)
Nuevo endpoint: `GET /api/master-data`
- Obtiene todos los datos maestros en una sola llamada
- Transforma los datos al formato que espera el frontend

### 3. **Frontend actualizado** (`src/taskpane/taskpane.js`)
- Carga automática de datos maestros al iniciar el add-in
- Función `cargarDatosMaestros()`: Obtiene datos del servidor
- Función `poblarSelectReserva()`: Puebla los selects de la sección de reserva
- Función `poblarSelectsPasajero(numero)`: Puebla los selects de cada pasajero

### 4. **Configuración actualizada**
- `config/index.js`: Agregada configuración de Cosmos DB
- `env.example`: Agregadas variables de entorno para Cosmos DB
- `package.json`: Agregada dependencia `@azure/cosmos`

## ⚙️ Configuración

### 1. Crear archivo `.env` con tus credenciales:

```env
# Cosmos DB Configuration
COSMOS_DB_ENDPOINT=https://tu-cuenta-cosmosdb.documents.azure.com:443/
COSMOS_DB_KEY=tu_clave_primaria_de_cosmos_db
COSMOS_DB_DATABASE_ID=iTrafficDB
```

### 2. Estructura de Cosmos DB

El servicio espera los siguientes contenedores (collections):

- **sellers**: Vendedores
  ```json
  {
    "id": "VDOR01",
    "code": "VDOR01",
    "name": "Juan Pérez",
    "fullName": "Juan Pérez"
  }
  ```

- **clients**: Clientes
  ```json
  {
    "id": "CLI001",
    "code": "CLI001",
    "name": "Empresa SA",
    "displayName": "CLI001 - Empresa SA - Cuit:30-12345678-9"
  }
  ```

- **statuses**: Estados de reserva
  ```json
  {
    "id": "PC",
    "code": "PC",
    "name": "PENDIENTE DE CONFIRMACION [PC]"
  }
  ```

- **reservationTypes**: Tipos de reserva
  ```json
  {
    "id": "COMA",
    "code": "COMA",
    "name": "MAYORISTA [COMA]"
  }
  ```

- **genders**: Géneros
  ```json
  {
    "id": "M",
    "code": "M",
    "name": "MASCULINO"
  }
  ```

- **documentTypes**: Tipos de documento
  ```json
  {
    "id": "DNI",
    "code": "DNI",
    "name": "DOCUMENTO NACIONAL DE IDENTIDAD"
  }
  ```

- **countries**: Países
  ```json
  {
    "id": "AR",
    "code": "AR",
    "name": "ARGENTINA"
  }
  ```

## 🚀 Uso

1. **Iniciar el servidor RPA:**
   ```bash
   npm run rpa-server
   ```

2. **El add-in cargará automáticamente los datos maestros al iniciar**

3. **Los selects se poblarán con los datos de Cosmos DB:**
   - Sección de Reserva: Tipo de Reserva, Estado, Vendedor, Cliente
   - Sección de Pasajeros: Sexo, Tipo de Documento, Nacionalidad

## 🔍 Verificación

Para verificar que los datos se están cargando correctamente:

1. Abre la consola del navegador (F12)
2. Busca el mensaje: `✅ Datos maestros cargados:`
3. Deberías ver la cantidad de registros de cada tipo

## ⚠️ Valores por defecto

Si no se puede conectar a Cosmos DB o no hay datos:
- **Géneros**: Se usan valores por defecto (MASCULINO, FEMENINO)
- **Tipos de Documento**: Se usan valores por defecto (PASAPORTE, DNI)
- **Otros campos**: Quedarán vacíos

## 🛠️ Troubleshooting

### No se cargan los datos
1. Verifica que el archivo `.env` esté en la raíz del proyecto
2. Verifica que las credenciales de Cosmos DB sean correctas
3. Verifica que el servidor RPA esté corriendo (`npm run rpa-server`)
4. Revisa la consola del servidor para ver errores

### Los selects están vacíos
1. Abre la consola del navegador
2. Busca mensajes de error relacionados con `cargarDatosMaestros`
3. Verifica que el endpoint `http://localhost:3001/api/master-data` responda correctamente

## 📝 Notas

- Los datos se cargan **una sola vez** al iniciar el add-in
- Si agregas nuevos datos a Cosmos DB, necesitas recargar el add-in
- Los valores se guardan en memoria (variable `masterData`)
- La validación de campos obligatorios sigue funcionando igual

