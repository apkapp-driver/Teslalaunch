# MiDash Web

Versión **web (PWA)** del dashboard, pensada para correr en el **navegador del
Tesla** o alojarse gratis en **GitHub Pages**. Incluye:

- **Reloj** y **accesos directos** editables.
- **Mapa** de calles reales (**OpenFreeMap**, sin clave) con modo **día/noche** (auto por
  hora + botón ☀️/🌙/🌓 abajo a la izquierda) y cuatro **vistas** (columna a la derecha):
  **Compass** (norte arriba, plano) · **Track** (rumbo arriba, plano) · **Tilt** (inclinado) ·
  **Cityscape** (inclinado + **edificios 3D**). La cámara sigue al coche con **zoom
  automático según la velocidad** (más cerca al parar, más lejos a 120 km/h, y se acerca al
  llegar a un giro). Si arrastras el mapa se pausa; **◎ Recentrar** lo retoma.
- **Líneas de carril** discontinuas sobre las carreteras principales (aproximación: los tiles
  no traen la geometría real de cada carril).
- **Coche 3D** (`model-viewer`) — por defecto `assets/car.glb`; cambia a
  `assets/tesla.glb` en `app.js` (`CAR_MODEL`).
- **Tesla**: batería, autonomía y carga vía el proxy Fleet API (ver `tesla-proxy`).
- **Radares**: 6.400+ puntos en el mapa y **aviso de proximidad** (banner con los
  metros y el límite) cuando te acercas a menos de 600 m.
- **Señales**: STOP / ceda / semáforos sobre el mapa (al acercar el zoom) y
  **aviso por voz** al acercarte (a <90 m; `SIGN_WARN_M` en `app.js`).
- **Navegación con voz**: busca un destino (Nominatim), calcula ruta (OSRM) y te guía giro a
  giro con **tarjeta de maniobra** (flecha vectorial, distancia, calle y "Después…"),
  **guía de carriles** (cuando OpenStreetMap tiene `turn:lanes`), **barra de llegada**
  (minutos, distancia, hora) y voz estilo *pace notes* (*"En 400 metros, gira a la
  izquierda"* y una llamada corta a ~170 m). El avance se calcula **sobre la ruta**, no en
  línea recta, así que un GPS que corta esquinas no la deja atascada. Si te sales >300 m
  durante 3 lecturas seguidas **recalcula** (con pausa de 30 s). Los avisos de señales
  nunca interrumpen una indicación de navegación.
- **Favoritos**: accesos **editables** (botón ✎ para añadir/quitar). Destinos
  **🏠 Casa / 💼 Trabajo**: tócalos para navegar; si están vacíos, escribe la
  dirección y tócalos para guardarla (clic derecho para borrar).
- Tarjeta de **música** (maqueta; una web no puede leer la música del sistema).

> **Importante:** una web **no puede** ser un launcher de Android real (no puede
> reemplazar la pantalla de inicio, listar apps instaladas ni leer la música del
> sistema). Para eso está el proyecto Android `MiDash`. Esta versión es un panel
> para abrir en el navegador del coche o como "app" PWA.

## Probar en local
No necesita compilar. Solo sírvelo por HTTP (la geolocalización y el service
worker no funcionan abriendo el `index.html` como `file://`):

```bash
# con Python
python -m http.server 8000
# o con Node
npx serve .
```
Abre `http://localhost:8000`.

## Publicar en GitHub Pages
1. Crea un repo en GitHub (p.ej. `midash-web`) y sube estos archivos a la raíz.
   ```bash
   git init
   git add .
   git commit -m "MiDash web"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/midash-web.git
   git push -u origin main
   ```
2. En GitHub: **Settings → Pages → Build and deployment**.
3. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. Espera ~1 min. Tu dashboard quedará en
   `https://TU_USUARIO.github.io/midash-web/`.

El archivo `.nojekyll` evita que GitHub Pages procese los archivos con Jekyll.

## Abrirla en el Tesla
Publica en GitHub Pages y abre `https://TU_USUARIO.github.io/midash-web/` en el
**navegador del Tesla**. Corre en la propia pantalla sin instalar nada. Guárdala
como favorito del navegador.

## Añadir modelos de coche
Hay un **selector** en la tarjeta del coche. Para añadir un modelo:
1. Copia tu `.glb` en `assets/` (p.ej. `assets/modely.glb`).
2. Añade una línea a `assets/cars.json`:
   ```json
   { "id": "modely", "name": "Tesla Model Y", "file": "modely.glb" }
   ```
El selector lo recoge solo y recuerda tu elección (localStorage).

## Personalizar (todo en `app.js`, arriba)
- **Tesla:** pon la URL de tu Worker en `TESLA_PROXY_URL` (ver carpeta `tesla-proxy`).
- **Aviso de radar:** `RADAR_WARN_M` (metros a los que salta el banner).
- **Navegación:** usa los servidores **de demo** de OSRM (rutas) y Nominatim
  (búsqueda), gratis y **para uso ligero**; para uso intensivo cambia las URLs
  en `app.js` por tu propia instancia. (La voz usa Web Speech del navegador.)
- **Probar sin conducir:** en la consola del navegador, `__fix(lon, lat, kmh, rumbo)`
  simula una posición GPS (por ejemplo `__fix(-2.9253, 43.2627, 40, 90)`).
- **Pantallas bajas** (móvil en horizontal): el mapa arranca a pantalla completa; la ✕
  devuelve el resto de paneles.
- **Radares:** algunos de `radares.json` (sobre todo los `movil`) traen en `max` valores que
  no son velocidades (331, 451, 480…). La interfaz solo muestra el límite si está entre 20 y 130.
- **WebGL:** el mapa y el coche 3D necesitan WebGL (Chrome y el navegador del Tesla lo tienen).
- **Accesos directos:** array `SHORTCUTS`. **Centro/zoom del mapa:** `center`, `zoom`.
- **Colores:** variables `:root` en `style.css`.

## Datos (carpeta `assets/`)
- `radares.json` — radares `{lat, lon, max, t}`.
- `senales.json` — señales/semáforos `[lat, lon, tipo, flag]` (s=stop, c=ceda, t=semáforo, p=peatonal).
- `car.glb`, `tesla.glb` — modelos 3D.
> Puedes reemplazar/ampliar estos archivos con tus propios datos cuando quieras.

## Archivos
```
index.html            # estructura
style.css             # tema oscuro de coche
app.js                # reloj, mapa, vistas, radares, señales, tesla, coche 3D
manifest.webmanifest  # PWA (instalable, pantalla completa, horizontal)
sw.js                 # service worker (cachea el shell offline)
icon.svg              # icono
.nojekyll             # para GitHub Pages
assets/               # modelos 3D (.glb) y datos (radares/señales)
```

## Ronda "conducción" (drive.js)
- Lupa arriba a la derecha → panel con autocompletado (Photon), recientes y favoritos (⭐), guardar como 🏠/💼. Chips Casa/Trabajo solo icono bajo la lupa.
- Radares: solo los de delante (cono ±55°), señal redonda con borde rojo parpadeante, pitidos suaves (WebAudio) y halo rojo si vas por encima.
- Abajo a la izquierda: velocidad + límite de la vía (Overpass; `––` si no se conoce). Recentrar encima de pantalla completa.
- Señales con icono propio (STOP, ceda, semáforo, peatones); radares = puntos rojos. Flecha del coche sin círculo.
- Ruta coloreada por tráfico (amarillo/naranja/rojo) con clave gratuita de TomTom en ⚙ Opciones; sin clave queda azul.
- Coche: carriles (2/3) y líneas que se mueven con la velocidad. Opciones: sonido, voz, aviso de radar, tolerancia, viaje.
- No portado: ventanas flotantes con posición/tamaño guardados (el layout web es fijo).
- Depuración: `__fix(lon,lat,kmh,rumbo)`, `__road(limite,carriles,"motorway")`, `__traffic()`.
