# 🧭 RUMBO — Geolocalización Consciente y Reutilizable

**Alumno:** Angel Daniel Ocampo Martinez
**Asignatura:** Desarrollo de Aplicaciones Web Progresivas (PWA) — Tema 6.3
**Demo:** https://angelocampom.github.io/pwa-geo-modular/

PWA que obtiene la ubicación del dispositivo con un **módulo reutilizable** (`geo-helper.js`), pide permiso con un flujo de **Pre-Permiso ético** y nunca deja bloqueado al usuario gracias a un **Plan B manual**.

- 100 % JavaScript Vanilla, sin librerías.
- Asincronía construida con `new Promise()` y consumida solo con `.then()` y `.catch()`.
- Desplegada en GitHub Pages (HTTPS), con `./geo-helper.js` en el precaché del Service Worker.

## Estructura

```
pwa-geo-modular/
├── index.html      # Interfaz: reporte, sucursales, pre-permiso y plan B
├── styles.css      # Diseño estilo HUD (misma línea visual que LENTE.pwa), mobile-first
├── geo-helper.js   # Módulo reutilizable de geolocalización (Promesas)
├── app.js          # UI, flujo de pre-permiso y consumo del helper
├── sw.js           # Service Worker Cache First (incluye ./geo-helper.js)
├── manifest.json   # Instalabilidad con rutas relativas
└── icons/          # icon-192.png y icon-512.png
```

`index.html` carga **`geo-helper.js` antes que `app.js`**, porque app.js usa sus funciones.

## 1. Geolocation API

| Método | Uso | Consumo |
| --- | --- | --- |
| `getCurrentPosition(exito, error, opciones)` | Lectura **única**: etiquetar un reporte, registrar asistencia | Bajo ✅ (el que usamos) |
| `watchPosition(exito, error, opciones)` | Canal **continuo**: navegación giro a giro. Devuelve un `watchId` que se cierra con `clearWatch(watchId)` | Alto |

**Respuesta (`GeolocationPosition`):** `timestamp` y `coords` (`latitude`, `longitude`, `accuracy` en metros con 95 % de confianza; `altitude`, `heading` y `speed` solo con GPS y en movimiento, `null` en escritorio).

**Opciones (`PositionOptions`):**
- `enableHighAccuracy`: pide máxima precisión (chip GPS si existe).
- `timeout`: ms máximos antes del error TIMEOUT (código 3).
- `maximumAge`: 0 obliga a una lectura nueva; un valor mayor permite reutilizar la caché del sistema.

## 2. `geo-helper.js` (módulo reutilizable)

| Función | Qué hace |
| --- | --- |
| `obtenerUbicacionActual(opciones)` | Envuelve `getCurrentPosition` en `new Promise`. Mezcla opciones con `Object.assign` y **normaliza** la salida: `{ latitud, longitud, precisionMetros, timestamp }` |
| `traducirErrorGeolocalizacion(error)` | Código 1 → permiso denegado · 2 → posición no disponible · 3 → timeout |
| `consultarEstadoPermisoGeo()` | Permissions API → `'granted'` / `'denied'` / `'prompt'`. Si no existe o falla, devuelve `'prompt'` |
| `clasificarPrecision(metros)` | < 30 m → "Precisión GPS Alta" · ≥ 30 m → "Ubicación Aproximada (Wi-Fi / IP)" |
| `calcularDistanciaKm(a, b)` | Fórmula de Haversine para la sucursal más cercana |

**¿Por qué un módulo?** La API nativa usa callbacks (como IndexedDB). Al envolverla una sola vez, cualquier parte de la app la usa con `obtenerUbicacionActual().then(...)` sin repetir callbacks ni conocer `navigator.geolocation`.

**Dos usos del mismo helper en `app.js`:**
1. **Reporte técnico:** alta precisión y lectura nueva (`maximumAge: 0`).
2. **Sucursal más cercana:** `enableHighAccuracy: false` y `maximumAge: 60000` (rápido y de bajo consumo).

## 3. Pre-Permiso UX (3 estados)

Al tocar **"Adjuntar mi ubicación"** se llama a `consultarEstadoPermisoGeo().then((estado) => ...)`:

| Estado | Acción |
| --- | --- |
| `granted` | Lee la ubicación directamente |
| `prompt` | Muestra la tarjeta explicativa; el botón **"Compartir mi ubicación"** dispara la lectura real (y el diálogo nativo) |
| `denied` | Muestra el selector manual y las instrucciones para reactivar el permiso |

**¿Por qué?** Si el diálogo aparece sin contexto, el usuario lo bloquea por instinto y, una vez en `PERMISSION_DENIED`, **JavaScript no puede volver a abrirlo**.

## 4. Plan B obligatorio (degradación elegante)

Si el usuario rechaza, ocurre un TIMEOUT o no hay señal, se habilita el **selector manual de zona** (con coordenadas aproximadas de cada ciudad) y una referencia opcional. La app **nunca se queda bloqueada**: el reporte y la búsqueda de sucursales funcionan con la zona elegida.

- Error **1 (denied)** → instrucciones para reactivar el permiso; se oculta "Reintentar" (el diálogo ya no puede aparecer).
- Errores **2 y 3** → se muestra "Reintentar ubicación".

## 5. Comportamiento por plataforma

| | Android | iPhone (iOS) | Laptop sin GPS |
| --- | --- | --- | --- |
| Fuente | GPS + celular + Wi-Fi | CoreLocation (GPS + Wi-Fi + Bluetooth) | Wi-Fi (MAC/BSSID) o IP |
| `accuracy` típico | 3–15 m exterior | 5–20 m exterior | 30–300 m Wi-Fi · 1–10 km IP |
| Regla especial | Precisa o Aproximada (Android 12+) | Solo desde un **clic directo**; Safari y la PWA instalada tienen **permisos separados** | `enableHighAccuracy: true` solo alarga el escaneo Wi-Fi → TIMEOUT |

**Cómo lo resuelve la app:**
- `detectarPlataforma()` muestra el diagnóstico y ajusta opciones: en escritorio usa `enableHighAccuracy: false` y `timeout: 12000`.
- La lectura siempre nace de un **clic** del usuario (requisito de iOS).
- Cuando el estado es `prompt`, el botón de confirmación llama a `getCurrentPosition` dentro de ese mismo clic.

## 6. Indicador de calidad de señal

Se muestra `precisionMetros` con la etiqueta de `clasificarPrecision()` y una **escala logarítmica** (1 m GPS → 300 m Wi-Fi → 10 km IP). Así se compara en vivo la laptop contra el teléfono.

## 7. Pruebas

1. **Laptop:** "Adjuntar mi ubicación" → aviso → Compartir → insignia **Aproximada (Wi-Fi / IP)** con un margen grande.
2. **Teléfono en exteriores:** el mismo flujo → **Precisión GPS Alta** (< 30 m).
3. **Bloquear el permiso** → Plan B con instrucciones → elegir zona → generar reporte.
4. DevTools → Application → **Cache Storage**: `rumbo-static-v2` contiene `geo-helper.js`.
5. DevTools → Sensors → **Location**: permite simular coordenadas o "Location unavailable".
