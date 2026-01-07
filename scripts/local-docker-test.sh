#!/bin/bash

# Script para probar la imagen Docker localmente antes de desplegar
# Uso: ./scripts/local-docker-test.sh

set -e

echo "🐳 Probando imagen Docker localmente..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar que existe .env
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: No se encontró .env${NC}"
    echo "Copia env.example a .env y configura las variables"
    exit 1
fi

# Nombre de la imagen
IMAGE_NAME="addin-rpa-backend"
CONTAINER_NAME="addin-rpa-test"

# 1. Build de la imagen
echo -e "\n${YELLOW}📦 Construyendo imagen Docker...${NC}"
docker build -t $IMAGE_NAME:test .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Imagen construida exitosamente${NC}"
else
    echo -e "${RED}❌ Error al construir la imagen${NC}"
    exit 1
fi

# 2. Detener y eliminar contenedor anterior si existe
echo -e "\n${YELLOW}🧹 Limpiando contenedores anteriores...${NC}"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 3. Ejecutar contenedor
echo -e "\n${YELLOW}🚀 Iniciando contenedor...${NC}"
docker run -d \
    --name $CONTAINER_NAME \
    -p 3001:3001 \
    --env-file .env \
    $IMAGE_NAME:test

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Contenedor iniciado${NC}"
else
    echo -e "${RED}❌ Error al iniciar contenedor${NC}"
    exit 1
fi

# 4. Esperar a que el servidor inicie
echo -e "\n${YELLOW}⏳ Esperando a que el servidor inicie...${NC}"
sleep 5

# 5. Verificar logs
echo -e "\n${YELLOW}📋 Logs del contenedor:${NC}"
docker logs $CONTAINER_NAME

# 6. Health check
echo -e "\n${YELLOW}🏥 Verificando health endpoint...${NC}"
sleep 2

HEALTH_RESPONSE=$(curl -s http://localhost:3001/api/rpa/health || echo "ERROR")

if [[ $HEALTH_RESPONSE == *"ok"* ]]; then
    echo -e "${GREEN}✅ Health check exitoso${NC}"
    echo $HEALTH_RESPONSE | jq . 2>/dev/null || echo $HEALTH_RESPONSE
else
    echo -e "${RED}❌ Health check falló${NC}"
    echo "Respuesta: $HEALTH_RESPONSE"
    echo -e "\n${YELLOW}Logs del contenedor:${NC}"
    docker logs $CONTAINER_NAME
    exit 1
fi

# 7. Instrucciones
echo -e "\n${GREEN}✅ Contenedor corriendo exitosamente${NC}"
echo -e "\n📝 Comandos útiles:"
echo "  Ver logs:        docker logs -f $CONTAINER_NAME"
echo "  Detener:         docker stop $CONTAINER_NAME"
echo "  Eliminar:        docker rm $CONTAINER_NAME"
echo "  Entrar al shell: docker exec -it $CONTAINER_NAME /bin/bash"
echo ""
echo "🌐 Endpoints disponibles:"
echo "  Health:     http://localhost:3001/api/rpa/health"
echo "  Master Data: http://localhost:3001/api/master-data"
echo "  Extract:     http://localhost:3001/api/extract"
echo "  Create RPA:  http://localhost:3001/api/rpa/create-reservation"
echo ""
echo -e "${YELLOW}Para detener el contenedor, ejecuta:${NC}"
echo "  docker stop $CONTAINER_NAME"

