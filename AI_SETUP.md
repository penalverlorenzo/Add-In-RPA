# Configuración de Azure OpenAI para Extracción de Datos

Este proyecto utiliza Azure OpenAI para extraer automáticamente información de reservas desde los correos electrónicos.

## Requisitos Previos

1. **Cuenta de Azure** con acceso a Azure OpenAI Service
2. **Recurso de Azure OpenAI** creado
3. **Modelo desplegado** (recomendado: `gpt-4o-mini` o `gpt-4`)

## Pasos de Configuración

### 1. Crear Recurso de Azure OpenAI

1. Ve al [Portal de Azure](https://portal.azure.com)
2. Crea un nuevo recurso de **Azure OpenAI**
3. Selecciona tu suscripción y grupo de recursos
4. Elige una región disponible
5. Crea el recurso

### 2. Desplegar un Modelo

1. En tu recurso de Azure OpenAI, ve a **Azure OpenAI Studio**
2. Navega a **Deployments**
3. Crea un nuevo deployment:
   - Modelo: `gpt-4o-mini` (recomendado) o `gpt-4`
   - Nombre del deployment: `gpt-4o-mini` (o el que prefieras)
4. Guarda el nombre del deployment

### 3. Obtener Credenciales

1. En el Portal de Azure, ve a tu recurso de Azure OpenAI
2. En el menú lateral, selecciona **Keys and Endpoint**
3. Copia:
   - **KEY 1** (API Key)
   - **Endpoint** (URL del recurso)

### 4. Configurar Variables de Entorno

1. Copia el archivo `env.example` a `.env`:
   ```bash
   cp env.example .env
   ```

2. Edita el archivo `.env` y completa las variables:
   ```env
   # Azure OpenAI Configuration
   AZURE_OPENAI_API_KEY=tu_api_key_aqui
   AZURE_OPENAI_ENDPOINT=https://tu-recurso.openai.azure.com/
   AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
   ```

### 5. Instalar Dependencias

```bash
npm install
```

## Uso

Una vez configurado, el add-in extraerá automáticamente los datos cuando hagas clic en **"Extraer con IA"**:

1. Selecciona un correo en Outlook
2. Abre el add-in
3. Haz clic en "Extraer con IA"
4. El sistema:
   - Extrae el contenido del correo
   - Envía el contenido a Azure OpenAI
   - Procesa la respuesta
   - Llena automáticamente los formularios

## Datos Extraídos

El sistema extrae:

### Pasajeros
- Nombre y apellido
- Tipo de documento y número
- Fecha de nacimiento
- Nacionalidad
- Sexo
- CUIL/CUIT
- Dirección
- Teléfono
- Tipo de pasajero (Adulto/Menor/Infante)

### Reserva
- Tipo de reserva
- Estado
- Fecha de viaje
- Vendedor
- Cliente

## Costos

Azure OpenAI cobra por tokens utilizados:
- **gpt-4o-mini**: ~$0.15 por 1M tokens de entrada, ~$0.60 por 1M tokens de salida
- **gpt-4**: ~$30 por 1M tokens de entrada, ~$60 por 1M tokens de salida

Un correo típico usa ~500-1000 tokens, por lo que el costo por extracción es muy bajo.

## Troubleshooting

### Error: "OpenAI client not configured"
- Verifica que las variables de entorno estén correctamente configuradas en `.env`
- Asegúrate de que el servidor RPA esté corriendo (`npm run rpa-server`)

### Error: "Rate limit exceeded"
- Espera unos momentos antes de intentar nuevamente
- Considera aumentar tu cuota en Azure

### Error: "Invalid JSON format"
- El modelo puede haber devuelto un formato inesperado
- Revisa los logs del servidor para ver la respuesta completa
- Considera ajustar el prompt en `services/extractionService.js`

## Seguridad

⚠️ **IMPORTANTE:**
- Nunca compartas tu archivo `.env`
- Nunca subas tu API key a repositorios públicos
- El archivo `.env` está incluido en `.gitignore` para protección

## Soporte

Para más información sobre Azure OpenAI:
- [Documentación oficial](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Guía de inicio rápido](https://learn.microsoft.com/en-us/azure/ai-services/openai/quickstart)

