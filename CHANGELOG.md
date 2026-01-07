# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Agregado
- Configuración completa para despliegue en Azure
- Dockerfile optimizado con Playwright para el backend
- GitHub Actions workflows para CI/CD automático
- Azure Static Web Apps configuración
- Documentación completa de despliegue (DEPLOYMENT.md)
- Sistema de configuración centralizado para producción
- Soporte para variables de entorno dinámicas
- README.md mejorado con instrucciones completas

### Cambiado
- `rpaClient.js` ahora usa URLs dinámicas según el entorno
- `rpaServer.js` actualizado con validación de configuración
- `webpack.config.js` inyecta URLs de API automáticamente
- Mejorada configuración de CORS para producción

### Seguridad
- Implementado manejo seguro de secrets con Azure Container Apps
- Configuración de CORS restrictiva
- Headers de seguridad en Static Web Apps

## [0.0.1] - 2025-01-XX

### Agregado
- Implementación inicial del Add-in de Outlook
- Extracción de datos con Azure OpenAI
- RPA con Playwright para iTraffic
- Integración con Azure Cosmos DB
- Panel de tareas interactivo
- Gestión de pasajeros y reservas
- Sistema de datos maestros

[Unreleased]: https://github.com/tu-usuario/addin-rpa/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/tu-usuario/addin-rpa/releases/tag/v0.0.1

