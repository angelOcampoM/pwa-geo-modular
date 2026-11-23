// =====================================================================
// app.js - Interfaz, Pre-Permiso UX y consumo de geo-helper.js
// Autor: Angel Daniel Ocampo Martinez
//
// Regla del curso: la asincronía se construye con new Promise() (en
// geo-helper.js) y aquí se consume solo con .then() y .catch().
//
// app.js NO usa navigator.geolocation directamente: todo pasa por las
// funciones del módulo geo-helper.js (cargado antes en index.html).
//
// Índice:
//   1. Referencias al DOM y estado
//   2. Registro del Service Worker
//   3. Instalación (Chrome/Android + instrucciones iOS)
//   4. Diagnóstico de plataforma (Android / iOS / sin GPS)
//   5. Funciones de interfaz (cargando, error, resultado, plan B)
//   6. Flujo de Pre-Permiso con consultarEstadoPermisoGeo()
//   7. Uso 1: adjuntar coordenadas al reporte técnico
//   8. Uso 2: sucursal más cercana (lectura rápida)
//   9. Plan B: selector manual de zona
// =====================================================================


// =====================================================================
// 1. REFERENCIAS AL DOM Y ESTADO
// =====================================================================
const $ = (id) => document.getElementById(id);

const btnInstalar = $('btn-instalar');
const avisoIos = $('aviso-ios');
const diagnosticoPlataforma = $('diagnostico-plataforma');

const formReporte = $('form-reporte');
const btnAdjuntarUbicacion = $('btn-adjuntar-ubicacion');
const btnSucursales = $('btn-sucursales');
const listaSucursales = $('lista-sucursales');
const mensaje = $('mensaje');

const avisoUbicacion = $('aviso-ubicacion');
const btnConfirmarUbicacion = $('btn-confirmar-ubicacion');
const btnCancelarUbicacion = $('btn-cancelar-ubicacion');

const planB = $('plan-b');
const selectZona = $('select-zona');

// Qué quería hacer el usuario cuando inició el flujo: 'reporte' o 'sucursal'.
// Se recuerda para continuar después del aviso o del plan B.
let accionEnCurso = null;

// Ubicación que se adjuntará al reporte: { tipo: 'gps', ... } o { tipo: 'manual', ... }
let ubicacionReporte = null;

// Zonas para el Plan B (coordenadas aproximadas del centro de cada ciudad)
const ZONAS = [
  { id: 'cuernavaca', nombre: 'Cuernavaca, Mor.', latitud: 18.9242, longitud: -99.2216 },
  { id: 'emiliano-zapata', nombre: 'Emiliano Zapata, Mor.', latitud: 18.8417, longitud: -99.1856 },
  { id: 'jiutepec', nombre: 'Jiutepec, Mor.', latitud: 18.8814, longitud: -99.1772 },
  { id: 'temixco', nombre: 'Temixco, Mor.', latitud: 18.8538, longitud: -99.2252 },
  { id: 'cuautla', nombre: 'Cuautla, Mor.', latitud: 18.8121, longitud: -98.9548 },
  { id: 'cdmx', nombre: 'Ciudad de México', latitud: 19.4326, longitud: -99.1332 },
  { id: 'puebla', nombre: 'Puebla, Pue.', latitud: 19.0414, longitud: -98.2063 },
  { id: 'toluca', nombre: 'Toluca, Edo. Méx.', latitud: 19.2826, longitud: -99.6557 }
];

// Sucursales de ejemplo (ficticias) para el Uso 2
const SUCURSALES = [
  { nombre: 'Sucursal Centro Cuernavaca', latitud: 18.9220, longitud: -99.2340 },
  { nombre: 'Sucursal CIVAC Jiutepec', latitud: 18.8960, longitud: -99.1700 },
  { nombre: 'Sucursal Cuautla', latitud: 18.8150, longitud: -98.9520 },
  { nombre: 'Sucursal Coyoacán CDMX', latitud: 19.3467, longitud: -99.1617 },
  { nombre: 'Sucursal Angelópolis Puebla', latitud: 19.0326, longitud: -98.2330 }
];


// =====================================================================
// 2. REGISTRO DEL SERVICE WORKER (ruta relativa por GitHub Pages)
// =====================================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((registro) => console.log('[SW] Registrado con scope:', registro.scope))
    .catch((error) => console.error('[SW] Error al registrar:', error));
}


// =====================================================================
// 3. INSTALACIÓN
// =====================================================================
let eventoInstalacionDiferido = null;

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();             // evita el mini-banner automático
  eventoInstalacionDiferido = evento;  // lo guardamos para nuestro botón
  btnInstalar.hidden = false;
});

btnInstalar.addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;
  eventoInstalacionDiferido.prompt();
  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      console.log('[Instalación] Resultado:', resultado.outcome);
      // El evento solo sirve una vez: se limpia y se oculta el botón
      eventoInstalacionDiferido = null;
      btnInstalar.hidden = true;
    })
    .catch((error) => console.error('[Instalación] Error:', error));
});

window.addEventListener('appinstalled', () => {
  btnInstalar.hidden = true;
});


// =====================================================================
// 4. DIAGNÓSTICO DE PLATAFORMA
// La precisión y las reglas cambian según el dispositivo, así que lo
// detectamos para explicarlo en pantalla y ajustar las opciones.
// =====================================================================
function detectarPlataforma() {
  const ua = navigator.userAgent;
  // iPadOS 13+ se presenta como Mac, pero tiene pantalla táctil
  const esIpadModerno = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || esIpadModerno) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'escritorio';
}

const plataforma = detectarPlataforma();

const TEXTOS_PLATAFORMA = {
  android: '🤖 Android: ubicación híbrida (GPS + torres celulares + Wi-Fi). Precisión esperada: 3–15 m en exteriores, 15–50 m en interiores. Android 12+ te deja elegir ubicación Precisa o Aproximada.',
  ios: '🍎 iPhone / iPad: CoreLocation (GPS + Wi-Fi + Bluetooth + red celular). Precisión esperada: 5–20 m en exteriores. La ubicación solo se pide al tocar un botón, y Safari y la app instalada guardan permisos por separado.',
  escritorio: '💻 Equipo sin GPS: usa triangulación Wi-Fi o tu dirección IP. Precisión esperada: 30–300 m con Wi-Fi o 1–10 km solo por IP. Para evitar TIMEOUT se usa enableHighAccuracy: false.'
};

diagnosticoPlataforma.textContent = TEXTOS_PLATAFORMA[plataforma];

// iOS no dispara beforeinstallprompt: mostramos los pasos manuales
if (plataforma === 'ios' && !window.navigator.standalone) {
  avisoIos.hidden = false;
}

// Opciones para el reporte, adaptadas al hardware:
// - Teléfono: enableHighAccuracy true (aprovecha el chip GPS).
// - Laptop sin GPS: enableHighAccuracy true NO crea precisión satelital,
//   solo hace que escanee Wi-Fi más tiempo y termine en TIMEOUT (código 3).
//   Por eso ahí usamos false y damos más tiempo de espera.
function opcionesParaReporte() {
  if (plataforma === 'escritorio') {
    return { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 };
  }
  return { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 };
}


// =====================================================================
// 5. FUNCIONES DE INTERFAZ
// =====================================================================
let temporizadorMensaje = null;

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje ' + (tipo || '');
  mensaje.hidden = false;

  // Los avisos informativos o de éxito se ocultan solos a los 5 s;
  // los de error y "cargando" se quedan hasta que llegue otro mensaje.
  clearTimeout(temporizadorMensaje);
  if (tipo !== 'error' && tipo !== 'cargando') {
    temporizadorMensaje = setTimeout(() => { mensaje.hidden = true; }, 5000);
  }
}

function mostrarCargando(texto) {
  mostrarMensaje(texto, 'cargando');
}

function mostrarMensajeError(texto) {
  mostrarMensaje(texto, 'error');
}

// Convierte metros a un texto legible: 12 m / 1.4 km
function formatearDistancia(metros) {
  return metros < 1000 ? metros + ' m' : (metros / 1000).toFixed(1) + ' km';
}

// Pinta coordenadas + indicador de calidad de señal (coords.accuracy)
function renderizarResultadoUbicacion(ubicacion) {
  const calidad = clasificarPrecision(ubicacion.precisionMetros); // de geo-helper.js

  $('res-latitud').textContent = ubicacion.latitud.toFixed(6);
  $('res-longitud').textContent = ubicacion.longitud.toFixed(6);
  $('res-precision').textContent = '± ' + formatearDistancia(ubicacion.precisionMetros);

  const insignia = $('res-insignia');
  insignia.textContent = calidad.etiqueta;
  insignia.className = 'insignia ' + calidad.nivel;

  // Escala logarítmica: 1 m = 0 %, 10 m = 25 %, 100 m = 50 %, 1 km = 75 %, 10 km = 100 %
  const posicion = Math.min(100, Math.max(0, Math.log10(Math.max(1, ubicacion.precisionMetros)) / 4 * 100));
  $('escala-marca').style.left = posicion + '%';

  $('res-hora').textContent = new Date(ubicacion.timestamp).toLocaleTimeString('es-MX');
  $('res-mapa').href = 'https://www.openstreetmap.org/?mlat=' + ubicacion.latitud +
    '&mlon=' + ubicacion.longitud + '#map=16/' + ubicacion.latitud + '/' + ubicacion.longitud;

  $('resultado-ubicacion').hidden = false;
  $('resultado-manual').hidden = true;
}

// PLAN B obligatorio: la app nunca se queda bloqueada.
// mostrarInstrucciones = true cuando el permiso está bloqueado ('denied').
function habilitarSelectorManualZona(motivo, mostrarInstrucciones) {
  $('plan-b-motivo').textContent = motivo;
  $('instrucciones-permiso').hidden = !mostrarInstrucciones;
  // Si está bloqueado, reintentar no sirve: el diálogo ya no puede aparecer
  $('btn-reintentar').hidden = mostrarInstrucciones;
  planB.hidden = false;
  planB.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


// =====================================================================
// 6. FLUJO DE PRE-PERMISO (Desafío 2)
// Antes de tocar el GPS revisamos el estado del permiso:
//   'granted' -> ya aceptó antes: leemos directo
//   'prompt'  -> nunca ha decidido: tarjeta explicativa + botón de confirmación
//   'denied'  -> lo bloqueó: selector manual + cómo reactivarlo
// =====================================================================
function iniciarFlujoUbicacion(accion) {
  accionEnCurso = accion;
  avisoUbicacion.hidden = true;
  planB.hidden = true;

  consultarEstadoPermisoGeo() // de geo-helper.js (nunca rechaza: si falla devuelve 'prompt')
    .then((estado) => {
      console.log('[Geo] Estado del permiso:', estado);

      if (estado === 'granted') {
        ejecutarAccion(accion);
      } else if (estado === 'denied') {
        mostrarMensajeError('El permiso de ubicación está bloqueado en este navegador.');
        habilitarSelectorManualZona('Bloqueaste el permiso de ubicación, así que el navegador ya no puede volver a preguntarte. Elige tu zona o reactívalo:', true);
      } else {
        // 'prompt': primero explicamos, NO llamamos al GPS todavía
        mostrarMensaje('Lee por qué pedimos tu ubicación antes de continuar.');
        avisoUbicacion.hidden = false;
        avisoUbicacion.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
}

function ejecutarAccion(accion) {
  if (accion === 'sucursal') {
    return buscarSucursalesCercanas();
  }
  return obtenerUbicacionParaReporte();
}

// Botones que inician el flujo (siempre desde un clic del usuario)
btnAdjuntarUbicacion.addEventListener('click', () => iniciarFlujoUbicacion('reporte'));
btnSucursales.addEventListener('click', () => iniciarFlujoUbicacion('sucursal'));

// Consentimiento consciente: aquí se dispara el diálogo nativo.
// Es un gesto DIRECTO del usuario: obtenerUbicacionActual() llama a
// getCurrentPosition() dentro de este mismo clic, como exige Safari en iOS.
btnConfirmarUbicacion.addEventListener('click', () => {
  avisoUbicacion.hidden = true;
  ejecutarAccion(accionEnCurso);
});

// El usuario no quiere compartir: Plan B sin pedir ningún permiso
btnCancelarUbicacion.addEventListener('click', () => {
  avisoUbicacion.hidden = true;
  mostrarMensaje('No se compartió tu ubicación.');
  habilitarSelectorManualZona('Decidiste no compartir tu ubicación. Puedes elegir tu zona manualmente:', false);
});


// =====================================================================
// 7. USO 1: ADJUNTAR COORDENADAS AL REPORTE (basado en Fragmento C)
// =====================================================================
function obtenerUbicacionParaReporte() {
  mostrarCargando('Obteniendo coordenadas...');
  btnAdjuntarUbicacion.disabled = true;

  return obtenerUbicacionActual(opcionesParaReporte())
    .then((ubicacion) => {
      ubicacionReporte = Object.assign({ tipo: 'gps' }, ubicacion);
      renderizarResultadoUbicacion(ubicacion);
      planB.hidden = true;
      mostrarMensaje('Ubicación adjuntada al reporte.', 'ok');
    })
    .catch((error) => {
      console.warn('[Geo] Fallback activado:', error.message);
      mostrarMensajeError(error.message);
      // codigo 1 = PERMISSION_DENIED: el usuario pulsó "Bloquear" en el diálogo nativo
      habilitarSelectorManualZona('No pudimos obtener tu ubicación. Elige tu zona para continuar:', error.codigo === 1);
    })
    .then(() => {
      // Se ejecuta después del .then o del .catch: reactivamos el botón
      btnAdjuntarUbicacion.disabled = false;
    });
}

// Al generar el reporte se combina el formulario con la ubicación (GPS o manual)
formReporte.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!ubicacionReporte) {
    mostrarMensajeError('Adjunta tu ubicación o elige una zona manual antes de generar el reporte.');
    return;
  }

  const datosFormulario = {
    titulo: $('titulo').value.trim(),
    descripcion: $('descripcion').value.trim()
  };

  // Object.assign une los datos del formulario con las coordenadas
  const paqueteCompleto = Object.assign({}, datosFormulario, {
    coordenadas: ubicacionReporte,
    fechaReporte: new Date().toISOString()
  });

  console.log('Paquete listo para enviar o encolar en IndexedDB:', paqueteCompleto);
  $('paquete-json').textContent = JSON.stringify(paqueteCompleto, null, 2);
  $('paquete-reporte').hidden = false;
  mostrarMensaje('Reporte generado. En una app real se enviaría con fetch o se encolaría en IndexedDB (patrón Outbox).', 'ok');
});


// =====================================================================
// 8. USO 2: SUCURSAL MÁS CERCANA (reutiliza el MISMO helper)
// Lectura rápida y de bajo consumo: no necesitamos precisión de metros
// para elegir una sucursal, así que aceptamos una lectura de hasta 60 s.
// =====================================================================
function buscarSucursalesCercanas() {
  mostrarCargando('Buscando sucursales cercanas...');

  return obtenerUbicacionActual({ enableHighAccuracy: false, maximumAge: 60000 })
    .then((ubicacion) => {
      console.log(`Filtrando sucursales cerca de ${ubicacion.latitud}, ${ubicacion.longitud}`);
      mostrarSucursales(ubicacion, 'tu ubicación (± ' + formatearDistancia(ubicacion.precisionMetros) + ')');
    })
    .catch((error) => {
      console.warn('[Geo] Fallback activado:', error.message);
      mostrarMensajeError(error.message);
      habilitarSelectorManualZona('Elige tu zona para calcular la sucursal más cercana:', error.codigo === 1);
    });
}

// Ordena las sucursales por distancia al punto de origen (GPS o zona manual)
function mostrarSucursales(origen, descripcionOrigen) {
  const ordenadas = SUCURSALES
    .map((sucursal) => Object.assign({}, sucursal, {
      distanciaKm: calcularDistanciaKm(origen, sucursal) // de geo-helper.js
    }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);

  listaSucursales.innerHTML = '';
  ordenadas.forEach((sucursal, indice) => {
    const li = document.createElement('li');
    if (indice === 0) li.className = 'mas-cercana';
    li.innerHTML = '<span></span><strong>' + sucursal.distanciaKm.toFixed(1) + ' km</strong>';
    li.querySelector('span').textContent = sucursal.nombre + (indice === 0 ? ' · más cercana' : '');
    listaSucursales.appendChild(li);
  });
  listaSucursales.hidden = false;
  mostrarMensaje('Distancias calculadas (origen: ' + descripcionOrigen + ')', 'ok');
}


// =====================================================================
// 9. PLAN B: SELECTOR MANUAL DE ZONA
// =====================================================================
ZONAS.forEach((zona) => {
  const opcion = document.createElement('option');
  opcion.value = zona.id;
  opcion.textContent = zona.nombre;
  selectZona.appendChild(opcion);
});

$('btn-usar-zona').addEventListener('click', () => {
  const zona = ZONAS.find((z) => z.id === selectZona.value);
  if (!zona) {
    mostrarMensajeError('Selecciona una zona de la lista.');
    return;
  }

  if (accionEnCurso === 'sucursal') {
    // Las zonas tienen coordenadas aproximadas: el Uso 2 sigue funcionando sin GPS
    mostrarSucursales(zona, 'la zona ' + zona.nombre);
  } else {
    ubicacionReporte = {
      tipo: 'manual',
      zona: zona.nombre,
      latitud: zona.latitud,
      longitud: zona.longitud,
      referencia: $('referencia-direccion').value.trim() || null
    };
    $('res-zona').textContent = zona.nombre + (ubicacionReporte.referencia ? ' · ' + ubicacionReporte.referencia : '');
    $('resultado-manual').hidden = false;
    $('resultado-ubicacion').hidden = true;
    mostrarMensaje('Zona manual adjuntada al reporte.', 'ok');
  }
  planB.hidden = true;
});

// Reintentar (solo visible si el permiso NO está bloqueado, por ejemplo tras un TIMEOUT)
$('btn-reintentar').addEventListener('click', () => {
  iniciarFlujoUbicacion(accionEnCurso);
});
