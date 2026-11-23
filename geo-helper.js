// =====================================================================
// geo-helper.js - Módulo reutilizable de geolocalización (Vanilla JS)
// Autor: Angel Daniel Ocampo Martinez
//
// ¿Por qué un módulo aparte?
// La API navigator.geolocation es anterior a las Promesas: trabaja con
// callbacks (éxito y error). Si cada pantalla la usara directamente,
// repetiríamos callbacks anidados en todos lados. Aquí la envolvemos
// UNA sola vez en Promesas, y cualquier función de app.js la usa con:
//
//     obtenerUbicacionActual().then(...).catch(...)
//
// Se carga en index.html ANTES de app.js para que sus funciones ya
// existan en el ámbito global cuando app.js se ejecute.
//
// Funciones que expone:
//   1. traducirErrorGeolocalizacion(error)  -> código 1/2/3 a mensaje claro
//   2. obtenerUbicacionActual(opciones)     -> Promesa con la ubicación normalizada
//   3. consultarEstadoPermisoGeo()          -> Promesa con 'granted' | 'denied' | 'prompt'
//   4. clasificarPrecision(metros)          -> etiqueta de calidad de señal
//   5. calcularDistanciaKm(a, b)            -> distancia entre dos coordenadas
// =====================================================================


// ---------------------------------------------------------------------
// 1. TRADUCCIÓN DE ERRORES (Fragmento A)
// El navegador entrega un GeolocationPositionError con un código numérico.
// Lo convertimos en un mensaje que el usuario sí entienda.
// ---------------------------------------------------------------------
function traducirErrorGeolocalizacion(error) {
  switch (error.code) {
    case 1: // error.PERMISSION_DENIED -> el usuario bloqueó el permiso
      return 'Permiso de ubicación denegado. Puedes ingresar tu zona manualmente.';
    case 2: // error.POSITION_UNAVAILABLE -> no hay señal GPS / Wi-Fi para calcularla
      return 'No fue posible determinar tu ubicación (señal GPS o Wi-Fi no disponible).';
    case 3: // error.TIMEOUT -> se acabó el tiempo de "timeout" sin obtener coordenadas
      return 'Se agotó el tiempo de espera intentando obtener las coordenadas.';
    default:
      return 'Ocurrió un error inesperado al consultar la ubicación.';
  }
}


// ---------------------------------------------------------------------
// 2. LECTURA ÚNICA PROMISIFICADA (Fragmento A)
// Usa getCurrentPosition (una sola lectura, no drena batería) en lugar
// de watchPosition (canal continuo para navegación, alto consumo).
//
// opcionesPersonalizadas (opcional) sobrescribe los valores por defecto:
//   enableHighAccuracy: true  -> pide la máxima precisión (chip GPS si existe)
//   timeout: 8000             -> ms máximos de espera antes del error TIMEOUT (código 3)
//   maximumAge: 30000         -> acepta una lectura guardada de hasta 30 s
//                                (0 obligaría a una lectura totalmente nueva)
// ---------------------------------------------------------------------
function obtenerUbicacionActual(opcionesPersonalizadas) {
  // Object.assign: parte de los valores por defecto y encima pone los que mande quien llama
  const opciones = Object.assign(
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    },
    opcionesPersonalizadas
  );

  return new Promise((resolve, reject) => {
    // Detección de soporte: navegadores viejos o contextos sin HTTPS no la tienen
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador no soporta la API de Geolocalización.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      // Callback de ÉXITO -> resolve
      (posicion) => {
        // Normalizamos la salida: quien consuma el helper siempre recibe
        // la misma estructura, en español y con la precisión redondeada.
        resolve({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          // accuracy = margen de error en metros (radio con 95 % de confianza)
          precisionMetros: Math.round(posicion.coords.accuracy),
          timestamp: posicion.timestamp
        });
      },
      // Callback de ERROR -> reject con un mensaje ya traducido
      (error) => {
        const errorTraducido = new Error(traducirErrorGeolocalizacion(error));
        // Conservamos el código original (1, 2 o 3) por si app.js necesita distinguirlo
        errorTraducido.codigo = error.code;
        reject(errorTraducido);
      },
      opciones
    );
  });
}


// ---------------------------------------------------------------------
// 3. ESTADO DEL PERMISO (Fragmento B)
// Antes de mostrar el aviso de Pre-Permiso preguntamos a la Permissions API
// si el usuario ya había decidido algo:
//   'granted' -> ya dio permiso: podemos leer directo
//   'prompt'  -> nunca ha decidido: mostramos el aviso explicativo
//   'denied'  -> lo bloqueó: JS ya NO puede volver a mostrar el diálogo
// Si la API no existe o falla, asumimos 'prompt' (el caso más seguro).
// ---------------------------------------------------------------------
function consultarEstadoPermisoGeo() {
  if (!('permissions' in navigator)) {
    return Promise.resolve('prompt');
  }

  return navigator.permissions.query({ name: 'geolocation' })
    .then((resultado) => resultado.state)
    .catch(() => 'prompt');
}


// ---------------------------------------------------------------------
// 4. CALIDAD DE LA SEÑAL (Indicador del desafío)
// Nunca hay que confiar en una coordenada sin revisar su accuracy.
//   < 30 m    -> casi seguro viene del chip GPS / GNSS
//   >= 30 m   -> aproximada: Wi-Fi (30–300 m) o IP (1–10 km)
// ---------------------------------------------------------------------
const UMBRAL_GPS_METROS = 30;

function clasificarPrecision(metros) {
  if (metros < UMBRAL_GPS_METROS) {
    return { nivel: 'alta', etiqueta: 'Precisión GPS Alta' };
  }
  return { nivel: 'aproximada', etiqueta: 'Ubicación Aproximada (Wi-Fi / IP)' };
}


// ---------------------------------------------------------------------
// 5. DISTANCIA ENTRE DOS PUNTOS (fórmula de Haversine)
// Calcula la distancia en km sobre la superficie de la Tierra.
// Se usa para encontrar la sucursal más cercana.
// a y b son objetos { latitud, longitud }.
// ---------------------------------------------------------------------
function calcularDistanciaKm(a, b) {
  const RADIO_TIERRA_KM = 6371;
  const aRadianes = (grados) => grados * Math.PI / 180;

  const dLat = aRadianes(b.latitud - a.latitud);
  const dLon = aRadianes(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aRadianes(a.latitud)) * Math.cos(aRadianes(b.latitud)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
