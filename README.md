# Add-in RPA para Outlook - Extractor de Reservas iTraffic

Este proyecto es un Add-in de Microsoft Outlook que automatiza la extracción de datos de correos electrónicos y la creación de reservas en el sistema iTraffic usando RPA (Robotic Process Automation).

## 🚀 Características

- **Extracción Inteligente con IA**: Usa Azure OpenAI para extraer automáticamente datos de pasajeros y reservas desde correos electrónicos
- **Automatización RPA**: Crea reservas automáticamente en iTraffic usando Playwright
- **Integración con Outlook**: Panel lateral integrado en Outlook Desktop, Web y Mobile
- **Datos Maestros**: Integración con Azure Cosmos DB para vendedores, clientes, países, etc.
- **Interfaz Moderna**: UI intuitiva y responsiva para gestionar pasajeros y reservas

## 📋 Arquitectura

```
Outlook Add-in (Frontend)
    ↓
Express API Server (Backend)
    ↓
├── Azure OpenAI (Extracción IA)
├── Azure Cosmos DB (Datos Maestros)
└── RPA Service (Playwright) → iTraffic Web
```

## 🛠️ Tecnologías

### Frontend
- Office.js API
- Vanilla JavaScript (ES6+)
- HTML5 + CSS3
- Webpack

### Backend
- Node.js + Express
- Playwright (RPA)
- Azure OpenAI SDK
- Azure Cosmos DB SDK

### Infraestructura
- Azure Static Web Apps (Frontend)
- Azure Container Apps (Backend)
- Azure Container Registry (Docker)
- GitHub Actions (CI/CD)

## 📦 Instalación Local

### Prerrequisitos

- Node.js 18+
- npm o yarn
- Cuenta de Azure con:
  - Azure OpenAI
  - Azure Cosmos DB
  - Credenciales de iTraffic

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/addin-rpa.git
cd addin-rpa
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp env.example .env
# Edita .env con tus credenciales
```

4. **Instalar navegadores de Playwright**
```bash
npx playwright install chromium
```

5. **Iniciar en modo desarrollo**
```bash
# Terminal 1: Frontend (webpack dev server)
npm run dev-server

# Terminal 2: Backend (RPA server)
npm run rpa-server

# O ambos a la vez:
npm run dev
```

6. **Cargar el Add-in en Outlook**
```bash
npm start
```

Esto abrirá Outlook Desktop con el add-in cargado.

## 🌐 Despliegue en Producción

Para desplegar en Azure, consulta la guía detallada:

**[📖 DEPLOYMENT.md](./DEPLOYMENT.md)**

### Resumen de Despliegue

1. **Backend**: Azure Container Apps con Docker
2. **Frontend**: Azure Static Web Apps con CI/CD
3. **CI/CD**: GitHub Actions automático
4. **Manifest**: Publicar en Microsoft 365 Admin Center

## 📁 Estructura del Proyecto

```
addin-rpa/
├── .github/
│   └── workflows/          # GitHub Actions para CI/CD
├── rpa/                    # Servicios RPA con Playwright
│   ├── rpaService.js       # Orquestador principal
│   ├── login.js            # Login a iTraffic
│   ├── newReservation.js   # Crear nueva reserva
│   ├── dataReservation.js  # Llenar datos de reserva
│   ├── newPassenger.js     # Agregar pasajero
│   └── dataPassenger.js    # Llenar datos de pasajero
├── server/                 # Backend Express
│   ├── rpaServer.js        # Servidor principal
│   └── config.js           # Configuración centralizada
├── services/               # Servicios de negocio
│   ├── extractionService.js    # Extracción con IA
│   └── masterDataService.js    # Datos maestros
├── src/
│   └── taskpane/           # Frontend del Add-in
│       ├── taskpane.html   # UI principal
│       ├── taskpane.js     # Lógica del add-in
│       ├── taskpane.css    # Estilos
│       └── rpaClient.js    # Cliente HTTP para API
├── Dockerfile              # Imagen Docker del backend
├── manifest.xml            # Manifest del Add-in
├── webpack.config.js       # Configuración de Webpack
├── staticwebapp.config.json # Config de Azure Static Web Apps
└── package.json            # Dependencias y scripts
```

## 🔑 Variables de Entorno

Crea un archivo `.env` basado en `env.example`:

```env
# iTraffic
ITRAFFIC_LOGIN_URL=https://...
ITRAFFIC_USER=...
ITRAFFIC_PASSWORD=...

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini

# Cosmos DB
COSMOS_DB_ENDPOINT=...
COSMOS_DB_KEY=...
COSMOS_DB_DATABASE_ID=iTrafficDB

# Server
PORT=3001
CORS_ORIGIN=https://localhost:3000
NODE_ENV=development
```

## 🧪 Testing

### Probar Backend
```bash
# Health check
curl http://localhost:3001/api/rpa/health

# Probar extracción
curl -X POST http://localhost:3001/api/extract \
  -H "Content-Type: application/json" \
  -d '{"emailContent":"..."}'
```

### Probar RPA Localmente
```bash
# Ejecutar RPA con datos de prueba
node rpa/rpaService.js
```

## 📝 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Frontend + Backend
npm run dev-server       # Solo frontend
npm run rpa-server       # Solo backend

# Build
npm run build            # Build de producción
npm run build:dev        # Build de desarrollo

# Office Add-in
npm start                # Cargar add-in en Outlook
npm stop                 # Detener add-in
npm run validate         # Validar manifest.xml

# Linting
npm run lint             # Verificar código
npm run lint:fix         # Corregir automáticamente
```

## 🐛 Troubleshooting

### El add-in no carga en Outlook
- Verifica que el dev-server esté corriendo en `https://localhost:3000`
- Asegúrate de que los certificados SSL están instalados
- Intenta limpiar la caché de Office: `npm run clear-cache`

### Error de CORS
- Verifica que `CORS_ORIGIN` en `.env` coincida con la URL del frontend
- En desarrollo debe ser `https://localhost:3000`

### Playwright falla
- Instala los navegadores: `npx playwright install chromium`
- Verifica que tienes suficiente memoria (4GB mínimo)
- En Windows, puede requerir permisos de administrador

### Extracción con IA no funciona
- Verifica las credenciales de Azure OpenAI
- Asegúrate de que el deployment existe
- Revisa los logs del servidor

## 📚 Documentación Adicional

- [AI_SETUP.md](./AI_SETUP.md) - Configuración de Azure OpenAI
- [MASTER_DATA_SETUP.md](./MASTER_DATA_SETUP.md) - Configuración de Cosmos DB
- [RPA_SETUP.md](./RPA_SETUP.md) - Configuración del RPA
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guía de despliegue en Azure

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es privado y confidencial.

## 👥 Autores

- Tu Nombre - Desarrollo inicial

## 🙏 Agradecimientos

- Microsoft Office Add-ins Team
- Playwright Team
- Azure OpenAI Team

---

**¿Necesitas ayuda?** Consulta la [documentación de despliegue](./DEPLOYMENT.md) o abre un issue.

