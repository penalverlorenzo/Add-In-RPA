#!/usr/bin/env node

/**
 * Script de verificación pre-despliegue
 * Valida que todo esté configurado correctamente antes de desplegar a Azure
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando configuración para despliegue...\n');

let hasErrors = false;

// 1. Verificar que existen archivos críticos
const requiredFiles = [
  'Dockerfile',
  '.dockerignore',
  'staticwebapp.config.json',
  'manifest.xml',
  'package.json',
  'server/config.js',
  'server/rpaServer.js',
  'src/taskpane/rpaClient.js'
];

console.log('📁 Verificando archivos requeridos...');
requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - NO ENCONTRADO`);
    hasErrors = true;
  }
});

// 2. Verificar que .env existe (para desarrollo local)
console.log('\n🔐 Verificando configuración de entorno...');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('  ✅ .env existe');
  
  // Leer y verificar variables críticas
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const requiredEnvVars = [
    'ITRAFFIC_LOGIN_URL',
    'ITRAFFIC_USER',
    'ITRAFFIC_PASSWORD',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'COSMOS_DB_ENDPOINT',
    'COSMOS_DB_KEY'
  ];
  
  requiredEnvVars.forEach(varName => {
    if (envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your_`)) {
      console.log(`  ✅ ${varName} configurado`);
    } else {
      console.log(`  ⚠️  ${varName} no configurado o usa valor por defecto`);
    }
  });
} else {
  console.log('  ⚠️  .env no existe (necesario para desarrollo local)');
  console.log('     Copia env.example a .env y configura las variables');
}

// 3. Verificar node_modules
console.log('\n📦 Verificando dependencias...');
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('  ✅ node_modules existe');
} else {
  console.log('  ❌ node_modules no existe - ejecuta: npm install');
  hasErrors = true;
}

// 4. Verificar package.json scripts
console.log('\n📜 Verificando scripts de npm...');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const requiredScripts = ['build', 'dev', 'rpa-server'];
  
  requiredScripts.forEach(script => {
    if (packageJson.scripts && packageJson.scripts[script]) {
      console.log(`  ✅ npm run ${script}`);
    } else {
      console.log(`  ❌ npm run ${script} - NO ENCONTRADO`);
      hasErrors = true;
    }
  });
}

// 5. Verificar estructura de carpetas
console.log('\n📂 Verificando estructura de carpetas...');
const requiredDirs = ['rpa', 'server', 'services', 'src/taskpane'];
requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    console.log(`  ✅ ${dir}/`);
  } else {
    console.log(`  ❌ ${dir}/ - NO ENCONTRADO`);
    hasErrors = true;
  }
});

// 6. Verificar manifest.xml
console.log('\n📋 Verificando manifest.xml...');
const manifestPath = path.join(__dirname, '..', 'manifest.xml');
if (fs.existsSync(manifestPath)) {
  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  
  if (manifestContent.includes('localhost:3000')) {
    console.log('  ⚠️  manifest.xml contiene URLs de localhost');
    console.log('     Para producción, actualiza las URLs a tu dominio de Azure');
  } else {
    console.log('  ✅ manifest.xml configurado para producción');
  }
  
  if (manifestContent.includes('contoso.com')) {
    console.log('  ⚠️  manifest.xml contiene URLs de ejemplo (contoso.com)');
    console.log('     Actualiza con tu dominio real');
  }
} else {
  console.log('  ❌ manifest.xml no encontrado');
  hasErrors = true;
}

// 7. Verificar GitHub Actions
console.log('\n🔄 Verificando GitHub Actions...');
const workflowsPath = path.join(__dirname, '..', '.github', 'workflows');
if (fs.existsSync(workflowsPath)) {
  const workflows = fs.readdirSync(workflowsPath);
  if (workflows.length > 0) {
    console.log(`  ✅ ${workflows.length} workflow(s) configurado(s):`);
    workflows.forEach(wf => console.log(`     - ${wf}`));
  } else {
    console.log('  ⚠️  No hay workflows configurados');
  }
} else {
  console.log('  ⚠️  Carpeta .github/workflows no existe');
}

// Resumen final
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.log('❌ Se encontraron errores. Corrígelos antes de desplegar.');
  process.exit(1);
} else {
  console.log('✅ Verificación completada. El proyecto está listo para desplegar.');
  console.log('\n📚 Próximos pasos:');
  console.log('   1. Revisa DEPLOYMENT.md para instrucciones detalladas');
  console.log('   2. Configura Azure Container Registry');
  console.log('   3. Construye y sube la imagen Docker');
  console.log('   4. Despliega a Azure Container Apps');
  console.log('   5. Despliega a Azure Static Web Apps');
  console.log('   6. Actualiza manifest.xml con URLs finales');
  console.log('   7. Publica en Microsoft 365 Admin Center');
  process.exit(0);
}

