/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global document, Office */

import { crearReservaEnITraffic } from './rpaClient.js';

// Estado global para datos maestros
const masterData = {
  sellers: [],
  clients: [],
  statuses: [],
  reservationTypes: [],
  genders: [],
  documentTypes: [],
  countries: [],
  loaded: false
};

// Función para mostrar mensajes al usuario
function mostrarMensaje(mensaje, tipo = "info") {
  // Crear elemento de mensaje
  const mensajeDiv = document.createElement("div");
  mensajeDiv.className = `status-message ${tipo}`;
  mensajeDiv.textContent = mensaje;
  mensajeDiv.style.position = "fixed";
  mensajeDiv.style.top = "20px";
  mensajeDiv.style.left = "50%";
  mensajeDiv.style.transform = "translateX(-50%)";
  mensajeDiv.style.zIndex = "10000";
  mensajeDiv.style.minWidth = "200px";
  mensajeDiv.style.maxWidth = "90%";
  mensajeDiv.style.textAlign = "center";
  mensajeDiv.style.animation = "slideDown 0.3s ease";
  
  document.body.appendChild(mensajeDiv);
  
  // Remover después de 3 segundos
  setTimeout(() => {
    mensajeDiv.style.animation = "slideUp 0.3s ease";
    setTimeout(() => {
      if (mensajeDiv.parentNode) {
        mensajeDiv.parentNode.removeChild(mensajeDiv);
      }
    }, 300);
  }, 3000);
}

Office.onReady((info) => {
  try {
  if (info.host === Office.HostType.Outlook) {
      // Ocultar mensaje de sideload si existe
      const sideloadMsg = document.getElementById("sideload-msg");
      if (sideloadMsg) {
        sideloadMsg.style.display = "none";
      }
      
      // Mostrar el cuerpo de la aplicación
      const appBody = document.getElementById("app-body");
      if (appBody) {
        appBody.style.display = "flex";
      }
      
      // Asignar evento al botón de extraer
      const runButton = document.getElementById("run");
      if (runButton) {
        runButton.onclick = function() {
          try {
            run();
          } catch (error) {
            mostrarMensaje("Error al extraer datos: " + error.message, "error");
          }
        };
      }
      
      // Asignar evento al botón de re-extraer
      const reextractButton = document.getElementById("reextract");
      if (reextractButton) {
        reextractButton.onclick = function() {
          try {
            // Ocultar resultados y volver a extraer
            const resultsDiv = document.getElementById("results");
            resultsDiv.style.display = "none";
            run();
          } catch (error) {
            mostrarMensaje("Error al re-extraer datos: " + error.message, "error");
          }
        };
      }
      
      // Asignar evento al botón de guardar
      const guardarButton = document.getElementById("guardar");
      if (guardarButton) {
        guardarButton.onclick = function() {
          try {
            guardarDatos();
          } catch (error) {
            mostrarMensaje("Error al guardar datos: " + error.message, "error");
          }
        };
      }
      
      // Asignar evento al botón de agregar pasajero
      const agregarButton = document.getElementById("agregarPasajero");
      if (agregarButton) {
        agregarButton.onclick = function() {
          try {
            agregarNuevoPasajero();
          } catch (error) {
            mostrarMensaje("Error al agregar pasajero: " + error.message, "error");
          }
        };
      }
      
      // Asignar evento al botón de crear reserva
      const crearReservaButton = document.getElementById("crearReserva");
      if (crearReservaButton) {
        crearReservaButton.onclick = function() {
          ejecutarCrearReserva();
        };
        // Deshabilitar el botón inicialmente
        crearReservaButton.disabled = true;
        crearReservaButton.style.opacity = "0.5";
        crearReservaButton.style.cursor = "not-allowed";
      }
      
      // Agregar event listeners para campos de reserva
      const camposReserva = ['tipoReserva', 'estadoReserva', 'fechaViaje', 'vendedor', 'cliente'];
      camposReserva.forEach(campoId => {
        const campo = document.getElementById(campoId);
        if (campo) {
          campo.addEventListener('change', actualizarEstadoBotonCrearReserva);
          campo.addEventListener('input', actualizarEstadoBotonCrearReserva);
        }
      });
      
      // Cargar datos maestros al iniciar
      cargarDatosMaestros();
    }
  } catch (error) {
    // Error silencioso
  }
});

/**
 * Cargar datos maestros desde el servidor
 */
async function cargarDatosMaestros() {
  try {
    const response = await fetch('http://20.3.142.67:3001/api/master-data');
    
    if (!response.ok) {
      console.warn('⚠️ No se pudieron cargar los datos maestros, usando valores por defecto');
      return;
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      masterData.sellers = result.data.sellers || [];
      masterData.clients = result.data.clients || [];
      masterData.statuses = result.data.statuses || [];
      masterData.reservationTypes = result.data.reservationTypes || [];
      masterData.genders = result.data.genders || [];
      masterData.documentTypes = result.data.documentTypes || [];
      masterData.countries = result.data.countries || [];
      masterData.loaded = true;
      
      console.log('✅ Datos maestros cargados:', {
        vendedores: masterData.sellers.length,
        clientes: masterData.clients.length,
        estados: masterData.statuses.length,
        tiposReserva: masterData.reservationTypes.length,
        generos: masterData.genders.length,
        tiposDoc: masterData.documentTypes.length,
        paises: masterData.countries.length
      });
      
      // Poblar los selects de reserva
      poblarSelectReserva();
    }
  } catch (error) {
    console.error('❌ Error cargando datos maestros:', error);
  }
}

/**
 * Poblar los selects de la sección de reserva
 */
function poblarSelectReserva() {
  // Tipo de Reserva
  const tipoReservaSelect = document.getElementById('tipoReserva');
  if (tipoReservaSelect && masterData.reservationTypes.length > 0) {
    tipoReservaSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.reservationTypes.forEach(tipo => {
      const option = document.createElement('option');
      option.value = tipo.name;
      option.textContent = tipo.name;
      tipoReservaSelect.appendChild(option);
    });
    console.log(`📋 Tipo Reserva poblado con ${masterData.reservationTypes.length} opciones`);
  } else if (tipoReservaSelect) {
    // Opciones por defecto si no hay datos maestros
    tipoReservaSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="AGENCIAS [COAG]">AGENCIAS [COAG]</option>
      <option value="MAYORISTA [COMA]">MAYORISTA [COMA]</option>
      <option value="DIRECTO [CODI]">DIRECTO [CODI]</option>
      <option value="CORPORATIVA [COCO]">CORPORATIVA [COCO]</option>
    `;
    console.log(`📋 Tipo Reserva poblado con opciones por defecto`);
  }
  
  // Estado
  const estadoSelect = document.getElementById('estadoReserva');
  if (estadoSelect && masterData.statuses.length > 0) {
    estadoSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.statuses.forEach(estado => {
      const option = document.createElement('option');
      option.value = estado.name;
      option.textContent = estado.name;
      estadoSelect.appendChild(option);
    });
    console.log(`📋 Estado poblado con ${masterData.statuses.length} opciones`);
  } else if (estadoSelect) {
    // Opciones por defecto si no hay datos maestros
    estadoSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="PENDIENTE DE CONFIRMACION [PC]">PENDIENTE DE CONFIRMACION [PC]</option>
      <option value="CONFIRMADA [CO]">CONFIRMADA [CO]</option>
      <option value="CANCELADA [CA]">CANCELADA [CA]</option>
    `;
    console.log(`📋 Estado poblado con opciones por defecto`);
  }
  
  // Vendedor
  const vendedorSelect = document.getElementById('vendedor');
  if (vendedorSelect && masterData.sellers.length > 0) {
    vendedorSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.sellers.forEach(vendedor => {
      const option = document.createElement('option');
      option.value = vendedor.name;
      option.textContent = vendedor.name;
      vendedorSelect.appendChild(option);
    });
    console.log(`📋 Vendedor poblado con ${masterData.sellers.length} opciones`);
  } else if (vendedorSelect) {
    // Opciones por defecto si no hay datos maestros
    vendedorSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="TEST TEST">TEST TEST</option>
    `;
    console.log(`📋 Vendedor poblado con opciones por defecto`);
  }
  
  // Cliente
  const clienteSelect = document.getElementById('cliente');
  if (clienteSelect && masterData.clients.length > 0) {
    clienteSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.clients.forEach(cliente => {
      const option = document.createElement('option');
      option.value = cliente.name;
      option.textContent = cliente.name;
      clienteSelect.appendChild(option);
    });
    console.log(`📋 Cliente poblado con ${masterData.clients.length} opciones`);
  } else if (clienteSelect) {
    // Opciones por defecto si no hay datos maestros
    clienteSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="DESPEGAR - TEST - 1">DESPEGAR - TEST - 1</option>
    `;
    console.log(`📋 Cliente poblado con opciones por defecto`);
  }
}

/**
 * Poblar los selects de un formulario de pasajero
 * @param {number} numero - Número del pasajero
 */
function poblarSelectsPasajero(numero) {
  // Sexo
  const sexoSelect = document.getElementById(`sexo_${numero}`);
  if (sexoSelect && masterData.genders.length > 0) {
    const valorActual = sexoSelect.value;
    sexoSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.genders.forEach(genero => {
      const option = document.createElement('option');
      option.value = genero.code;
      option.textContent = genero.name;
      sexoSelect.appendChild(option);
    });
    if (valorActual) sexoSelect.value = valorActual;
    console.log(`📋 Sexo ${numero} poblado con ${masterData.genders.length} opciones`);
  } else if (sexoSelect) {
    // Si no hay datos maestros, usar opciones por defecto
    sexoSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="M">MASCULINO</option>
      <option value="F">FEMENINO</option>
    `;
    console.log(`📋 Sexo ${numero} poblado con opciones por defecto`);
  }
  
  // Tipo de Documento
  const tipoDocSelect = document.getElementById(`tipoDoc_${numero}`);
  if (tipoDocSelect && masterData.documentTypes.length > 0) {
    const valorActual = tipoDocSelect.value;
    tipoDocSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.documentTypes.forEach(tipo => {
      const option = document.createElement('option');
      option.value = tipo.code;
      option.textContent = tipo.name;
      tipoDocSelect.appendChild(option);
    });
    if (valorActual) tipoDocSelect.value = valorActual;
    console.log(`📋 Tipo Doc ${numero} poblado con ${masterData.documentTypes.length} opciones`);
  } else if (tipoDocSelect) {
    // Si no hay datos maestros, usar opciones por defecto
    tipoDocSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="DNI">DOCUMENTO NACIONAL DE IDENTIDAD</option>
      <option value="PAS">PASAPORTE</option>
      <option value="CI">CÉDULA DE IDENTIDAD</option>
      <option value="LE">LIBRETA DE ENROLAMIENTO</option>
      <option value="LC">LIBRETA CÍVICA</option>
    `;
    console.log(`📋 Tipo Doc ${numero} poblado con opciones por defecto`);
  }
  
  // Nacionalidad
  const nacionalidadSelect = document.getElementById(`nacionalidad_${numero}`);
  if (nacionalidadSelect && masterData.countries.length > 0) {
    const valorActual = nacionalidadSelect.value;
    nacionalidadSelect.innerHTML = '<option value="">Seleccione...</option>';
    masterData.countries.forEach(pais => {
      const option = document.createElement('option');
      option.value = pais.name;
      option.textContent = pais.name;
      nacionalidadSelect.appendChild(option);
    });
    if (valorActual) nacionalidadSelect.value = valorActual;
    console.log(`📋 Nacionalidad ${numero} poblada con ${masterData.countries.length} opciones`);
  } else if (nacionalidadSelect) {
    // Si no hay datos maestros, usar opciones por defecto
    nacionalidadSelect.innerHTML = `
      <option value="">Seleccione...</option>
      <option value="ARGENTINA">ARGENTINA</option>
      <option value="BRASIL">BRASIL</option>
      <option value="CHILE">CHILE</option>
      <option value="URUGUAY">URUGUAY</option>
      <option value="PARAGUAY">PARAGUAY</option>
      <option value="BOLIVIA">BOLIVIA</option>
      <option value="PERU">PERU</option>
      <option value="COLOMBIA">COLOMBIA</option>
      <option value="VENEZUELA">VENEZUELA</option>
      <option value="ECUADOR">ECUADOR</option>
      <option value="MEXICO">MEXICO</option>
      <option value="ESPAÑA">ESPAÑA</option>
      <option value="ESTADOS UNIDOS">ESTADOS UNIDOS</option>
    `;
    console.log(`📋 Nacionalidad ${numero} poblada con opciones por defecto`);
  }
}

async function run() {
  try {
    // Ocultar el botón de extraer
    const runButton = document.getElementById("run");
    runButton.style.display = "none";
    
    // Mostrar el loader
    const loader = document.getElementById("loader");
    loader.style.display = "block";
    
    // Ocultar los resultados mientras se extrae
    const resultsDiv = document.getElementById("results");
    resultsDiv.style.display = "none";

  const item = Office.context.mailbox.item;
    
    // Obtener el cuerpo del correo
    Office.context.mailbox.item.body.getAsync(
      Office.CoercionType.Text, 
      async (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          const cuerpoCorreo = result.value;
          
          try {
            // Llamar al servicio de extracción con IA
            const extractedData = await extraerDatosConIA(cuerpoCorreo);
            
            // Ocultar loader
            loader.style.display = "none";
            
            // Mostrar resultados
            resultsDiv.style.display = "block";
            
            if (extractedData && extractedData.passengers && extractedData.passengers.length > 0) {
              // Crear formularios según el número de pasajeros extraídos
              crearFormulariosPasajeros(extractedData.passengers.length);
              
              // Llenar los datos de los pasajeros
              llenarDatosPasajeros(extractedData.passengers);
              
              // Llenar los datos de la reserva
              llenarDatosReserva(extractedData);
              
              mostrarMensaje(`✅ Datos extraídos: ${extractedData.passengers.length} pasajero(s)`, "success");
            } else {
              // Si no se extrajeron pasajeros, crear un formulario vacío
              crearFormulariosPasajeros(1);
              mostrarMensaje("No se pudieron extraer datos. Por favor, llena el formulario manualmente.", "info");
            }
          } catch (error) {
            // Ocultar loader
            loader.style.display = "none";
            
            // Mostrar resultados con formulario vacío
            resultsDiv.style.display = "block";
            
            // Si falla la extracción, crear un formulario vacío
            crearFormulariosPasajeros(1);
            mostrarMensaje("Error al extraer datos: " + error.message + ". Llena el formulario manualmente.", "error");
          }
        } else {
          // Ocultar loader
          loader.style.display = "none";
          
          // Mostrar botón de nuevo
          runButton.style.display = "block";
          
          mostrarMensaje("Error al obtener el contenido del correo", "error");
        }
      }
    );
  } catch (error) {
    // Ocultar loader
    const loader = document.getElementById("loader");
    loader.style.display = "none";
    
    // Mostrar botón de nuevo
    const runButton = document.getElementById("run");
    runButton.style.display = "block";
    
    mostrarMensaje("Error inesperado: " + error.message, "error");
  }
}

/**
 * Llama al servicio de extracción con IA
 */
async function extraerDatosConIA(emailContent) {
  const response = await fetch('http://20.3.142.67:3001/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      emailContent: emailContent,
      userId: Office.context.mailbox.userProfile.emailAddress || 'outlook-user'
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Error al extraer datos');
  }

  const result = await response.json();
  return result.data;
}

function crearFormulariosPasajeros(numeroPasajeros) {
  const container = document.getElementById("pasajerosContainer");
  container.innerHTML = ""; // Limpiar contenedor
  
  for (let i = 0; i < numeroPasajeros; i++) {
    const pasajeroDiv = crearFormularioPasajero(i + 1);
    container.appendChild(pasajeroDiv);
  }
  
  // Actualizar estado del botón después de crear los formularios
  setTimeout(() => actualizarEstadoBotonCrearReserva(), 200);
}

function crearFormularioPasajero(numero) {
  const pasajeroDiv = document.createElement("div");
  pasajeroDiv.className = "pasajero-acordeon";
  pasajeroDiv.dataset.numeroPasajero = numero;
  
  // Cabecera del acordeón (clickeable)
  const header = document.createElement("div");
  header.className = "pasajero-header";
  header.innerHTML = `
    <span class="pasajero-titulo">Pasajero ${numero}</span>
    <div class="pasajero-actions">
      <span class="arrow">▼</span>
      <button class="btn-eliminar-pasajero" title="Eliminar pasajero">✕</button>
    </div>
  `;
  
  // Contenido del acordeón (formulario)
  const content = document.createElement("div");
  content.className = "pasajero-content";
  content.style.display = "none";
  content.innerHTML = `
    <div>
      <label>Tipo de Pasajero:</label>
      <select id="tipoPasajero_${numero}">
        <option value="">Seleccione...</option>
        <option value="adulto">Adulto</option>
        <option value="menor">Menor</option>
        <option value="infante">Infante</option>
      </select>
    </div>

    <div>
      <label>Nombre: <span style="color: red;">*</span></label>
      <input type="text" id="nombre_${numero}" placeholder="Ingrese el nombre">
    </div>

    <div>
      <label>Apellido: <span style="color: red;">*</span></label>
      <input type="text" id="apellido_${numero}" placeholder="Ingrese el apellido">
    </div>

    <div>
      <label>DNI:</label>
      <input type="number" id="dni_${numero}" placeholder="Ingrese el DNI">
    </div>

    <div>
      <label>Fecha de Nacimiento:</label>
      <input type="date" id="fechaNacimiento_${numero}">
    </div>

    <div>
      <label>CUIL:</label>
      <input type="number" id="cuil_${numero}" placeholder="Ingrese el CUIL">
    </div>

    <div>
      <label>Tipo de Documento:</label>
      <select id="tipoDoc_${numero}">
        <option value="">Seleccione...</option>
        <option value="dni">DNI</option>
        <option value="pasaporte">Pasaporte</option>
        <option value="cedula">Cédula</option>
        <option value="otro">Otro</option>
      </select>
    </div>

    <div>
      <label>Sexo:</label>
      <select id="sexo_${numero}">
        <option value="">Seleccione...</option>
        <option value="masculino">Masculino</option>
        <option value="femenino">Femenino</option>
        <option value="otro">Otro</option>
      </select>
    </div>

    <div>
      <label>Nacionalidad:</label>
      <select id="nacionalidad_${numero}">
        <option value="">Seleccione...</option>
        <option value="argentina">Argentina</option>
        <option value="brasilera">Brasilera</option>
        <option value="chilena">Chilena</option>
        <option value="uruguaya">Uruguaya</option>
        <option value="paraguaya">Paraguaya</option>
        <option value="boliviana">Boliviana</option>
        <option value="peruana">Peruana</option>
        <option value="colombiana">Colombiana</option>
        <option value="venezolana">Venezolana</option>
        <option value="otra">Otra</option>
      </select>
    </div>

    <div>
      <label>Dirección:</label>
      <input type="text" id="direccion_${numero}" placeholder="Ingrese la dirección">
    </div>

    <div>
      <label>Número de Teléfono:</label>
      <input type="tel" id="telefono_${numero}" placeholder="Ingrese el teléfono">
    </div>
  `;
  
  // Funcionalidad de acordeón (toggle)
  header.onclick = function(e) {
    // No hacer toggle si se clickeó el botón de eliminar
    if (e.target.classList.contains('btn-eliminar-pasajero')) {
      return;
    }
    
    const isOpen = content.style.display === "block";
    const arrow = header.querySelector(".arrow");
    
    if (isOpen) {
      content.style.display = "none";
      arrow.style.transform = "rotate(0deg)";
    } else {
      content.style.display = "block";
      arrow.style.transform = "rotate(180deg)";
    }
  };
  
  // Agregar event listeners para validación en tiempo real (solo nombre y apellido)
  setTimeout(() => {
    const nombreInput = document.getElementById(`nombre_${numero}`);
    const apellidoInput = document.getElementById(`apellido_${numero}`);
    
    if (nombreInput) {
      nombreInput.addEventListener('input', actualizarEstadoBotonCrearReserva);
    }
    if (apellidoInput) {
      apellidoInput.addEventListener('input', actualizarEstadoBotonCrearReserva);
    }
  }, 100);
  
  // Funcionalidad del botón eliminar
  const btnEliminar = header.querySelector('.btn-eliminar-pasajero');
  btnEliminar.onclick = function(e) {
    e.stopPropagation(); // Evitar que se abra/cierre el acordeón
    eliminarPasajero(pasajeroDiv);
  };
  
  pasajeroDiv.appendChild(header);
  pasajeroDiv.appendChild(content);
  
  // Poblar los selects con datos maestros después de crear el formulario
  setTimeout(() => {
    poblarSelectsPasajero(numero);
  }, 50);
  
  return pasajeroDiv;
}

function eliminarPasajero(pasajeroDiv) {
  try {
    const container = document.getElementById("pasajerosContainer");
    const pasajeros = container.querySelectorAll(".pasajero-acordeon");
    
    // No permitir eliminar si solo hay un pasajero
    if (pasajeros.length <= 1) {
      mostrarMensaje("Debe haber al menos un pasajero", "info");
      return;
    }
    
    // Eliminar directamente sin confirmación (o puedes crear un modal personalizado)
    pasajeroDiv.remove();
    renumerarPasajeros();
    mostrarMensaje("Pasajero eliminado correctamente", "success");
    
    // Actualizar estado del botón después de eliminar
    setTimeout(() => actualizarEstadoBotonCrearReserva(), 200);
  } catch (error) {
    mostrarMensaje("Error al eliminar pasajero", "error");
  }
}

function renumerarPasajeros() {
  const container = document.getElementById("pasajerosContainer");
  const pasajeros = container.querySelectorAll(".pasajero-acordeon");
  
  pasajeros.forEach((pasajeroDiv, index) => {
    const nuevoNumero = index + 1;
    const titulo = pasajeroDiv.querySelector(".pasajero-titulo");
    titulo.textContent = `Pasajero ${nuevoNumero}`;
    pasajeroDiv.dataset.numeroPasajero = nuevoNumero;
  });
}

function agregarNuevoPasajero() {
  try {
    const container = document.getElementById("pasajerosContainer");
    if (!container) {
      return;
    }
    
    const pasajeros = container.querySelectorAll(".pasajero-acordeon");
    const nuevoNumero = pasajeros.length + 1;
    
    const nuevoPasajero = crearFormularioPasajero(nuevoNumero);
    container.appendChild(nuevoPasajero);
    
    // Abrir automáticamente el nuevo pasajero
    const content = nuevoPasajero.querySelector(".pasajero-content");
    const arrow = nuevoPasajero.querySelector(".arrow");
    if (content && arrow) {
      content.style.display = "block";
      arrow.style.transform = "rotate(180deg)";
    }
    
    // Scroll suave hacia el nuevo pasajero
    if (nuevoPasajero.scrollIntoView) {
      nuevoPasajero.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Actualizar estado del botón después de agregar
    setTimeout(() => actualizarEstadoBotonCrearReserva(), 200);
  } catch (error) {
    throw error;
  }
}

function guardarDatos() {
  try {
    const container = document.getElementById("pasajerosContainer");
    if (!container) {
      mostrarMensaje("No se encontró el contenedor de pasajeros", "error");
      return;
    }
    
    const pasajeros = container.querySelectorAll(".pasajero-acordeon");
    if (pasajeros.length === 0) {
      mostrarMensaje("No hay pasajeros para guardar. Por favor, extraiga datos primero.", "info");
      return;
    }
    
    const todosPasajeros = [];
    
    pasajeros.forEach((pasajeroDiv, index) => {
      const numero = pasajeroDiv.dataset.numeroPasajero;
      
      // Obtener valores directamente del DOM del pasajero
      const content = pasajeroDiv.querySelector(".pasajero-content");
      if (content) {
        const datos = {
          numeroPasajero: index + 1, // Número secuencial para el guardado
          tipoPasajero: content.querySelector(`#tipoPasajero_${numero}`)?.value || "",
          nombre: content.querySelector(`#nombre_${numero}`)?.value || "",
          apellido: content.querySelector(`#apellido_${numero}`)?.value || "",
          dni: content.querySelector(`#dni_${numero}`)?.value || "",
          fechaNacimiento: content.querySelector(`#fechaNacimiento_${numero}`)?.value || "",
          cuil: content.querySelector(`#cuil_${numero}`)?.value || "",
          tipoDoc: content.querySelector(`#tipoDoc_${numero}`)?.value || "",
          sexo: content.querySelector(`#sexo_${numero}`)?.value || "",
          nacionalidad: content.querySelector(`#nacionalidad_${numero}`)?.value || "",
          direccion: content.querySelector(`#direccion_${numero}`)?.value || "",
          telefono: content.querySelector(`#telefono_${numero}`)?.value || ""
        };
        
        todosPasajeros.push(datos);
      }
    });
    
    // Aquí puedes enviar los datos a tu backend/base de datos
    // Por ejemplo: enviar a Azure Function, API, etc.
    // fetch('tu-api-url', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(todosPasajeros)
    // });
    
    mostrarMensaje(`Datos de ${todosPasajeros.length} pasajero(s) guardados correctamente`, "success");
  } catch (error) {
    throw error;
  }
}

function llenarDatosPasajeros(datosPasajeros) {
  // Función auxiliar para llenar los datos extraídos por la IA
  // Esperar un poco para asegurar que los selects estén poblados
  setTimeout(() => {
    datosPasajeros.forEach((datos, index) => {
      const numero = index + 1;
      
      if (document.getElementById(`tipoPasajero_${numero}`)) {
        // Mapear paxType de la IA a tipoPasajero del formulario
        let tipoPasajero = "";
        if (datos.paxType === "ADU") tipoPasajero = "adulto";
        else if (datos.paxType === "CHD") tipoPasajero = "menor";
        else if (datos.paxType === "INF") tipoPasajero = "infante";
        
        // Los valores de sex, documentType y nationality ahora vienen normalizados del backend
        // sex viene como código: "M" o "F"
        // documentType viene como código: "DNI", "PAS", "CI", etc.
        // nationality viene como nombre completo en mayúsculas: "ARGENTINA", "BRASIL", etc.
        
        document.getElementById(`tipoPasajero_${numero}`).value = tipoPasajero;
        document.getElementById(`nombre_${numero}`).value = datos.firstName || "";
        document.getElementById(`apellido_${numero}`).value = datos.lastName || "";
        document.getElementById(`dni_${numero}`).value = datos.documentNumber || "";
        document.getElementById(`fechaNacimiento_${numero}`).value = datos.birthDate || "";
        document.getElementById(`cuil_${numero}`).value = datos.cuilCuit || "";
        
        // Usar los códigos directamente tal como vienen del backend
        const tipoDocSelect = document.getElementById(`tipoDoc_${numero}`);
        if (tipoDocSelect && datos.documentType) {
          tipoDocSelect.value = datos.documentType;
          console.log(`✅ Tipo Doc ${numero}: ${datos.documentType} -> ${tipoDocSelect.value}`);
        }
        
        const sexoSelect = document.getElementById(`sexo_${numero}`);
        if (sexoSelect && datos.sex) {
          sexoSelect.value = datos.sex;
          console.log(`✅ Sexo ${numero}: ${datos.sex} -> ${sexoSelect.value}`);
        }
        
        const nacionalidadSelect = document.getElementById(`nacionalidad_${numero}`);
        if (nacionalidadSelect && datos.nationality) {
          nacionalidadSelect.value = datos.nationality;
          console.log(`✅ Nacionalidad ${numero}: ${datos.nationality} -> ${nacionalidadSelect.value}`);
        }
        
        document.getElementById(`direccion_${numero}`).value = datos.direccion || "";
        document.getElementById(`telefono_${numero}`).value = datos.telefono || "";
      }
    });
    
    // Actualizar estado del botón después de llenar los datos
    setTimeout(() => actualizarEstadoBotonCrearReserva(), 200);
  }, 150); // Esperar 150ms para que los selects se pueblen primero
}

/**
 * Llena los datos de la reserva extraídos por la IA
 */
function llenarDatosReserva(datosExtraidos) {
  // Repoblar los selects de reserva primero para asegurar que tengan opciones
  poblarSelectReserva();
  
  // Esperar un poco más para asegurar que los selects estén poblados
  setTimeout(() => {
    // Tipo de Reserva
    const tipoReservaSelect = document.getElementById("tipoReserva");
    if (tipoReservaSelect) {
      const valorTipoReserva = datosExtraidos.reservationType;
      console.log(`🔍 Intentando asignar Tipo Reserva: "${valorTipoReserva}"`);
      console.log(`📋 Opciones en select:`, Array.from(tipoReservaSelect.options).map(o => `"${o.value}"`));
      
      if (valorTipoReserva && valorTipoReserva !== 'null' && valorTipoReserva !== null) {
        tipoReservaSelect.value = valorTipoReserva;
        console.log(`✅ Tipo Reserva asignado: "${valorTipoReserva}" -> "${tipoReservaSelect.value}"`);
        
        // Si no se seleccionó, intentar buscar una coincidencia parcial
        if (!tipoReservaSelect.value || tipoReservaSelect.value === "") {
          const opciones = Array.from(tipoReservaSelect.options);
          const coincidencia = opciones.find(opt => 
            opt.value && valorTipoReserva &&
            (opt.value.toUpperCase().includes(valorTipoReserva.toUpperCase()) ||
            valorTipoReserva.toUpperCase().includes(opt.value.toUpperCase()))
          );
          if (coincidencia) {
            tipoReservaSelect.value = coincidencia.value;
            console.log(`✅ Tipo Reserva (coincidencia): "${valorTipoReserva}" -> "${tipoReservaSelect.value}"`);
          } else {
            console.warn(`⚠️ No se encontró coincidencia para Tipo Reserva: "${valorTipoReserva}"`);
          }
        }
      }
    }
    
    // Estado
    const estadoReservaSelect = document.getElementById("estadoReserva");
    if (estadoReservaSelect) {
      const valorEstado = datosExtraidos.status;
      const opcionesDisponibles = Array.from(estadoReservaSelect.options).map(o => o.value);
      
      console.log(`🔍 Intentando asignar Estado: "${valorEstado}"`);
      console.log(`📋 Opciones disponibles en select Estado:`, opcionesDisponibles);
      console.log(`📊 Total de opciones: ${opcionesDisponibles.length}`);
      
      if (valorEstado && valorEstado !== 'null' && valorEstado !== null) {
        // Intentar asignación directa
        estadoReservaSelect.value = valorEstado;
        console.log(`🔄 Intento directo: "${valorEstado}" -> "${estadoReservaSelect.value}"`);
        
        // Si no se seleccionó, intentar buscar una coincidencia
        if (!estadoReservaSelect.value || estadoReservaSelect.value === "") {
          console.log(`⚠️ Asignación directa falló, buscando coincidencia...`);
          
          const opciones = Array.from(estadoReservaSelect.options);
          
          // Intentar coincidencia exacta ignorando espacios y mayúsculas
          let coincidencia = opciones.find(opt => 
            opt.value && 
            opt.value.trim().toUpperCase() === valorEstado.trim().toUpperCase()
          );
          
          if (coincidencia) {
            estadoReservaSelect.value = coincidencia.value;
            console.log(`✅ Estado (coincidencia exacta): "${valorEstado}" -> "${estadoReservaSelect.value}"`);
          } else {
            // Intentar coincidencia parcial
            coincidencia = opciones.find(opt => 
              opt.value && valorEstado &&
              (opt.value.toUpperCase().includes(valorEstado.toUpperCase()) ||
              valorEstado.toUpperCase().includes(opt.value.toUpperCase()))
            );
            
            if (coincidencia) {
              estadoReservaSelect.value = coincidencia.value;
              console.log(`✅ Estado (coincidencia parcial): "${valorEstado}" -> "${estadoReservaSelect.value}"`);
            } else {
              // Intentar mapeo inteligente por palabras clave
              const valorUpper = valorEstado.toUpperCase();
              
              if (valorUpper.includes('CONFIRMAD') || valorUpper.includes('CONFIRM')) {
                coincidencia = opciones.find(opt => opt.value && opt.value.toUpperCase().includes('CONFIRMAD'));
              } else if (valorUpper.includes('PENDIENTE') || valorUpper.includes('PENDING')) {
                coincidencia = opciones.find(opt => opt.value && opt.value.toUpperCase().includes('PENDIENTE'));
              } else if (valorUpper.includes('CANCELAD') || valorUpper.includes('CANCEL')) {
                coincidencia = opciones.find(opt => opt.value && opt.value.toUpperCase().includes('CANCELAD'));
              }
              
              if (coincidencia) {
                estadoReservaSelect.value = coincidencia.value;
                console.log(`✅ Estado (mapeo inteligente): "${valorEstado}" -> "${estadoReservaSelect.value}"`);
              } else {
                console.error(`❌ No se encontró ninguna coincidencia para Estado: "${valorEstado}"`);
                console.log(`💡 Sugerencia: Verifica que el valor extraído coincida con alguna de estas opciones:`, opcionesDisponibles);
              }
            }
          }
        } else {
          console.log(`✅ Estado asignado correctamente: "${estadoReservaSelect.value}"`);
        }
      } else {
        console.log(`⚠️ Estado es null o inválido: "${valorEstado}"`);
      }
    }
    
    // Fecha de Viaje
    if (document.getElementById("fechaViaje")) {
      document.getElementById("fechaViaje").value = datosExtraidos.travelDate || "";
      console.log(`✅ Fecha Viaje: ${datosExtraidos.travelDate}`);
    }
    
    // Vendedor
    const vendedorSelect = document.getElementById("vendedor");
    if (vendedorSelect) {
      const valorVendedor = datosExtraidos.seller;
      if (valorVendedor && valorVendedor !== 'null' && valorVendedor !== null) {
        vendedorSelect.value = valorVendedor;
        console.log(`✅ Vendedor: "${valorVendedor}" -> "${vendedorSelect.value}"`);
        
        // Si no se seleccionó, intentar buscar una coincidencia parcial
        if (!vendedorSelect.value || vendedorSelect.value === "") {
          const opciones = Array.from(vendedorSelect.options);
          const coincidencia = opciones.find(opt => 
            opt.value && valorVendedor &&
            (opt.value.toUpperCase().includes(valorVendedor.toUpperCase()) ||
            valorVendedor.toUpperCase().includes(opt.value.toUpperCase()))
          );
          if (coincidencia) {
            vendedorSelect.value = coincidencia.value;
            console.log(`✅ Vendedor (coincidencia): "${valorVendedor}" -> "${vendedorSelect.value}"`);
          }
        }
      } else {
        console.log(`⚠️ Vendedor es null o inválido: "${valorVendedor}"`);
      }
    }
    
    // Cliente
    const clienteSelect = document.getElementById("cliente");
    if (clienteSelect) {
      const valorCliente = datosExtraidos.client;
      if (valorCliente && valorCliente !== 'null' && valorCliente !== null) {
        clienteSelect.value = valorCliente;
        console.log(`✅ Cliente: "${valorCliente}" -> "${clienteSelect.value}"`);
        
        // Si no se seleccionó, intentar buscar una coincidencia parcial
        if (!clienteSelect.value || clienteSelect.value === "") {
          const opciones = Array.from(clienteSelect.options);
          const coincidencia = opciones.find(opt => 
            opt.value && valorCliente &&
            (opt.value.toUpperCase().includes(valorCliente.toUpperCase()) ||
            valorCliente.toUpperCase().includes(opt.value.toUpperCase()))
          );
          if (coincidencia) {
            clienteSelect.value = coincidencia.value;
            console.log(`✅ Cliente (coincidencia): "${valorCliente}" -> "${clienteSelect.value}"`);
          }
        }
      } else {
        console.log(`⚠️ Cliente es null o inválido: "${valorCliente}"`);
      }
    }
    
    // Actualizar estado del botón después de llenar los datos
    setTimeout(() => actualizarEstadoBotonCrearReserva(), 200);
  }, 250); // Esperar 250ms para asegurar que los selects estén poblados
}

/**
 * Valida si todos los campos obligatorios están completos
 * @returns {boolean} true si todos los campos están completos
 */
function validarCamposObligatorios() {
  const container = document.getElementById("pasajerosContainer");
  if (!container) return false;
  
  const pasajeros = container.querySelectorAll(".pasajero-acordeon");
  if (pasajeros.length === 0) return false;
  
  // Validar pasajeros (solo nombre y apellido)
  let pasajerosValidos = true;
  pasajeros.forEach((pasajeroDiv) => {
    const numero = pasajeroDiv.dataset.numeroPasajero;
    const content = pasajeroDiv.querySelector(".pasajero-content");
    
    if (content) {
      const nombre = content.querySelector(`#nombre_${numero}`)?.value || "";
      const apellido = content.querySelector(`#apellido_${numero}`)?.value || "";
      
      if (nombre.trim() === "" || apellido.trim() === "") {
        pasajerosValidos = false;
      }
    }
  });
  
  // Validar datos de reserva (todos obligatorios)
  const tipoReserva = document.getElementById("tipoReserva")?.value || "";
  const estadoReserva = document.getElementById("estadoReserva")?.value || "";
  const fechaViaje = document.getElementById("fechaViaje")?.value || "";
  const vendedor = document.getElementById("vendedor")?.value || "";
  const cliente = document.getElementById("cliente")?.value || "";
  
  const reservaValida = 
    tipoReserva.trim() !== "" &&
    estadoReserva.trim() !== "" &&
    fechaViaje.trim() !== "" &&
    vendedor.trim() !== "" &&
    cliente.trim() !== "";
  
  return pasajerosValidos && reservaValida;
}

/**
 * Actualiza el estado del botón "Crear Reserva" según la validación
 */
function actualizarEstadoBotonCrearReserva() {
  const boton = document.getElementById("crearReserva");
  if (!boton) return;
  
  const esValido = validarCamposObligatorios();
  
  if (esValido) {
    boton.disabled = false;
    boton.style.opacity = "1";
    boton.style.cursor = "pointer";
  } else {
    boton.disabled = true;
    boton.style.opacity = "0.5";
    boton.style.cursor = "not-allowed";
  }
}

/**
 * Deshabilita todos los campos del formulario
 */
function deshabilitarFormularios() {
  // Deshabilitar campos de pasajeros
  const container = document.getElementById("pasajerosContainer");
  if (container) {
    const inputs = container.querySelectorAll("input, select");
    inputs.forEach(input => {
      input.disabled = true;
      input.style.backgroundColor = "#f3f4f6";
      input.style.cursor = "not-allowed";
    });
    
    // Deshabilitar botones de eliminar pasajero
    const botonesEliminar = container.querySelectorAll(".btn-eliminar-pasajero");
    botonesEliminar.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = "0.3";
      btn.style.cursor = "not-allowed";
      btn.style.pointerEvents = "none";
    });
  }
  
  // Deshabilitar campos de reserva
  const camposReserva = ['tipoReserva', 'estadoReserva', 'fechaViaje', 'vendedor', 'cliente'];
  camposReserva.forEach(campoId => {
    const campo = document.getElementById(campoId);
    if (campo) {
      campo.disabled = true;
      campo.style.backgroundColor = "#f3f4f6";
      campo.style.cursor = "not-allowed";
    }
  });
  
  // Deshabilitar botón de agregar pasajero
  const btnAgregar = document.getElementById("agregarPasajero");
  if (btnAgregar) {
    btnAgregar.disabled = true;
    btnAgregar.style.opacity = "0.5";
    btnAgregar.style.cursor = "not-allowed";
  }
  
  // Deshabilitar botón de guardar
  const btnGuardar = document.getElementById("guardar");
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.style.opacity = "0.5";
    btnGuardar.style.cursor = "not-allowed";
  }
}

/**
 * Convierte los formularios a modo lectura (texto plano)
 */
function convertirAModoLectura() {
  // Convertir pasajeros a modo lectura
  const container = document.getElementById("pasajerosContainer");
  if (container) {
    const pasajeros = container.querySelectorAll(".pasajero-acordeon");
    
    pasajeros.forEach((pasajeroDiv) => {
      const numero = pasajeroDiv.dataset.numeroPasajero;
      const content = pasajeroDiv.querySelector(".pasajero-content");
      
      if (content) {
        // Obtener valores actuales
        const datos = {
          tipoPasajero: content.querySelector(`#tipoPasajero_${numero}`)?.value || "",
          nombre: content.querySelector(`#nombre_${numero}`)?.value || "",
          apellido: content.querySelector(`#apellido_${numero}`)?.value || "",
          dni: content.querySelector(`#dni_${numero}`)?.value || "",
          fechaNacimiento: content.querySelector(`#fechaNacimiento_${numero}`)?.value || "",
          cuil: content.querySelector(`#cuil_${numero}`)?.value || "",
          tipoDoc: content.querySelector(`#tipoDoc_${numero}`)?.value || "",
          sexo: content.querySelector(`#sexo_${numero}`)?.value || "",
          nacionalidad: content.querySelector(`#nacionalidad_${numero}`)?.value || "",
          direccion: content.querySelector(`#direccion_${numero}`)?.value || "",
          telefono: content.querySelector(`#telefono_${numero}`)?.value || ""
        };
        
        // Crear HTML en modo lectura
        content.innerHTML = `
          <div class="campo-lectura">
            <label>Tipo de Pasajero:</label>
            <p>${datos.tipoPasajero || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Nombre:</label>
            <p>${datos.nombre || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Apellido:</label>
            <p>${datos.apellido || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>DNI:</label>
            <p>${datos.dni || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Fecha de Nacimiento:</label>
            <p>${datos.fechaNacimiento || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>CUIL:</label>
            <p>${datos.cuil || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Tipo de Documento:</label>
            <p>${datos.tipoDoc || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Sexo:</label>
            <p>${datos.sexo || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Nacionalidad:</label>
            <p>${datos.nacionalidad || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Dirección:</label>
            <p>${datos.direccion || '-'}</p>
          </div>
          <div class="campo-lectura">
            <label>Número de Teléfono:</label>
            <p>${datos.telefono || '-'}</p>
          </div>
        `;
      }
      
      // Ocultar botón de eliminar
      const btnEliminar = pasajeroDiv.querySelector(".btn-eliminar-pasajero");
      if (btnEliminar) {
        btnEliminar.style.display = "none";
      }
    });
  }
  
  // Convertir datos de reserva a modo lectura
  const datosReservaSection = document.getElementById("datosReservaSection");
  if (datosReservaSection) {
    const datosReserva = {
      tipoReserva: document.getElementById("tipoReserva")?.value || "",
      estadoReserva: document.getElementById("estadoReserva")?.value || "",
      fechaViaje: document.getElementById("fechaViaje")?.value || "",
      vendedor: document.getElementById("vendedor")?.value || "",
      cliente: document.getElementById("cliente")?.value || ""
    };
    
    datosReservaSection.innerHTML = `
      <h3>Datos de la Reserva</h3>
      <div class="campo-lectura">
        <label>Tipo de Reserva:</label>
        <p>${datosReserva.tipoReserva || '-'}</p>
      </div>
      <div class="campo-lectura">
        <label>Estado:</label>
        <p>${datosReserva.estadoReserva || '-'}</p>
      </div>
      <div class="campo-lectura">
        <label>Fecha de Viaje:</label>
        <p>${datosReserva.fechaViaje || '-'}</p>
      </div>
      <div class="campo-lectura">
        <label>Vendedor:</label>
        <p>${datosReserva.vendedor || '-'}</p>
      </div>
      <div class="campo-lectura">
        <label>Cliente:</label>
        <p>${datosReserva.cliente || '-'}</p>
      </div>
    `;
  }
  
  // Ocultar botón de agregar pasajero
  const btnAgregar = document.getElementById("agregarPasajero");
  if (btnAgregar) {
    btnAgregar.style.display = "none";
  }
  
  // Ocultar botón de guardar
  const btnGuardar = document.getElementById("guardar");
  if (btnGuardar) {
    btnGuardar.style.display = "none";
  }
  
  // Ocultar botón de crear reserva
  const btnCrearReserva = document.getElementById("crearReserva");
  if (btnCrearReserva) {
    btnCrearReserva.style.display = "none";
  }
}

/**
 * Ejecuta la creación de reserva en iTraffic usando RPA
 */
async function ejecutarCrearReserva() {
  try {
    // Obtener datos de todos los pasajeros
    const container = document.getElementById("pasajerosContainer");
    if (!container) {
      mostrarMensaje("No se encontró el contenedor de pasajeros", "error");
      return;
    }
    
    const pasajeros = container.querySelectorAll(".pasajero-acordeon");
    if (pasajeros.length === 0) {
      mostrarMensaje("No hay pasajeros para crear la reserva. Por favor, extraiga datos primero.", "info");
      return;
    }
    
    // Recopilar datos de todos los pasajeros
    const todosPasajeros = [];
    pasajeros.forEach((pasajeroDiv, index) => {
      const numero = pasajeroDiv.dataset.numeroPasajero;
      const content = pasajeroDiv.querySelector(".pasajero-content");
      
      if (content) {
        const datos = {
          numeroPasajero: index + 1,
          tipoPasajero: content.querySelector(`#tipoPasajero_${numero}`)?.value || "",
          nombre: content.querySelector(`#nombre_${numero}`)?.value || "",
          apellido: content.querySelector(`#apellido_${numero}`)?.value || "",
          dni: content.querySelector(`#dni_${numero}`)?.value || "",
          fechaNacimiento: content.querySelector(`#fechaNacimiento_${numero}`)?.value || "",
          cuil: content.querySelector(`#cuil_${numero}`)?.value || "",
          tipoDoc: content.querySelector(`#tipoDoc_${numero}`)?.value || "",
          sexo: content.querySelector(`#sexo_${numero}`)?.value || "",
          nacionalidad: content.querySelector(`#nacionalidad_${numero}`)?.value || "",
          direccion: content.querySelector(`#direccion_${numero}`)?.value || "",
          telefono: content.querySelector(`#telefono_${numero}`)?.value || ""
        };
        
        todosPasajeros.push(datos);
      }
    });
    
    // Capturar datos de la reserva
    const datosReserva = {
      tipoReserva: document.getElementById("tipoReserva")?.value || "",
      estadoReserva: document.getElementById("estadoReserva")?.value || "",
      fechaViaje: document.getElementById("fechaViaje")?.value || "",
      vendedor: document.getElementById("vendedor")?.value || "",
      cliente: document.getElementById("cliente")?.value || ""
    };
    
    // VALIDAR CAMPOS OBLIGATORIOS
    let camposFaltantes = [];
    
    // Validar pasajeros (solo nombre y apellido son obligatorios)
    todosPasajeros.forEach((pasajero, index) => {
      if (!pasajero.nombre || pasajero.nombre.trim() === "") {
        camposFaltantes.push(`Pasajero ${index + 1}: Nombre`);
      }
      if (!pasajero.apellido || pasajero.apellido.trim() === "") {
        camposFaltantes.push(`Pasajero ${index + 1}: Apellido`);
      }
    });
    
    // Validar datos de reserva (todos obligatorios)
    if (!datosReserva.tipoReserva || datosReserva.tipoReserva.trim() === "") {
      camposFaltantes.push("Tipo de Reserva");
    }
    if (!datosReserva.estadoReserva || datosReserva.estadoReserva.trim() === "") {
      camposFaltantes.push("Estado");
    }
    if (!datosReserva.fechaViaje || datosReserva.fechaViaje.trim() === "") {
      camposFaltantes.push("Fecha de Viaje");
    }
    if (!datosReserva.vendedor || datosReserva.vendedor.trim() === "") {
      camposFaltantes.push("Vendedor");
    }
    if (!datosReserva.cliente || datosReserva.cliente.trim() === "") {
      camposFaltantes.push("Cliente");
    }
    
    // Si hay campos faltantes, mostrar error y no enviar
    if (camposFaltantes.length > 0) {
      mostrarMensaje(
        `Por favor completa los siguientes campos obligatorios: ${camposFaltantes.join(', ')}`,
        "error"
      );
      return; // NO enviar al RPA
    }
    
    // Mostrar mensaje de procesamiento
    mostrarMensaje("Creando reserva en iTraffic... Por favor espere.", "info");
    
    // DESHABILITAR TODOS LOS CAMPOS
    deshabilitarFormularios();
    
    // Deshabilitar botón mientras se procesa
    const botonCrearReserva = document.getElementById("crearReserva");
    if (botonCrearReserva) {
      botonCrearReserva.disabled = true;
      botonCrearReserva.style.opacity = "0.6";
      botonCrearReserva.querySelector('.ms-Button-label').textContent = "⏳ Procesando...";
    }
    
    // Llamar al servicio RPA con los datos de pasajeros y reserva
    const resultado = await crearReservaEnITraffic(todosPasajeros, datosReserva);
    
    mostrarMensaje("¡Reserva creada exitosamente en iTraffic!", "success");
    
    // CONVERTIR A MODO LECTURA
    convertirAModoLectura();
    
  } catch (error) {
    mostrarMensaje("Error al crear reserva: " + error.message, "error");
    // En caso de error, rehabilitar los formularios
    habilitarFormularios();
  }
}

/**
 * Habilita todos los campos del formulario (en caso de error)
 */
function habilitarFormularios() {
  // Habilitar campos de pasajeros
  const container = document.getElementById("pasajerosContainer");
  if (container) {
    const inputs = container.querySelectorAll("input, select");
    inputs.forEach(input => {
      input.disabled = false;
      input.style.backgroundColor = "#ffffff";
      input.style.cursor = "text";
    });
    
    // Habilitar botones de eliminar pasajero
    const botonesEliminar = container.querySelectorAll(".btn-eliminar-pasajero");
    botonesEliminar.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.pointerEvents = "auto";
    });
  }
  
  // Habilitar campos de reserva
  const camposReserva = ['tipoReserva', 'estadoReserva', 'fechaViaje', 'vendedor', 'cliente'];
  camposReserva.forEach(campoId => {
    const campo = document.getElementById(campoId);
    if (campo) {
      campo.disabled = false;
      campo.style.backgroundColor = "#ffffff";
      campo.style.cursor = "pointer";
    }
  });
  
  // Habilitar botón de agregar pasajero
  const btnAgregar = document.getElementById("agregarPasajero");
  if (btnAgregar) {
    btnAgregar.disabled = false;
    btnAgregar.style.opacity = "1";
    btnAgregar.style.cursor = "pointer";
  }
  
  // Habilitar botón de guardar
  const btnGuardar = document.getElementById("guardar");
  if (btnGuardar) {
    btnGuardar.disabled = false;
    btnGuardar.style.opacity = "1";
    btnGuardar.style.cursor = "pointer";
  }
  
  // Habilitar botón de crear reserva
  const botonCrearReserva = document.getElementById("crearReserva");
  if (botonCrearReserva) {
    botonCrearReserva.disabled = false;
    botonCrearReserva.style.opacity = "1";
    botonCrearReserva.querySelector('.ms-Button-label').textContent = "🚀 Crear Reserva en iTraffic";
  }
}

export { mostrarMensaje, run, crearFormulariosPasajeros, crearFormularioPasajero, guardarDatos, llenarDatosPasajeros, eliminarPasajero, renumerarPasajeros, agregarNuevoPasajero, ejecutarCrearReserva };
