# MiDash Web

Versión **web (PWA)** del dashboard, pensada para correr en el **navegador del
Tesla** o alojarse gratis en **GitHub Pages**. Incluye:

- **Reloj** y **accesos directos** editables.
- **Mapa** de calles reales (**OpenFreeMap**, sin clave) con vistas **2D / Seguir / 3D**
  y modo **día/noche** (auto por hora + botón ☀️/🌙/🌓 abajo a la izquierda).
- **Coche 3D** (`model-viewer`) — por defecto `assets/car.glb`; cambia a
  `assets/tesla.glb` en `app.js` (`CAR_MODEL`).
- **Tesla**: batería, autonomía y carga vía el proxy Fleet API (ver `tesla-proxy`).
- **Radares**: 6.400+ puntos en el mapa y **aviso de proximidad** (banner con los
  metros y el límite) cuando te acercas a menos de 600 m.
- **Señales**: STOP / ceda / semáforos sobre el mapa (al acercar el zoom) y
  **aviso por voz** al acercarte (a <90 m; `SIGN_WARN_M` en `app.js`).
- **Navegación con voz**: busca un destino (Nominatim), calcula ruta (OSRM) y te
  guía giro a giro por voz (Web Speech), con la ruta dibujada en el mapa.
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
