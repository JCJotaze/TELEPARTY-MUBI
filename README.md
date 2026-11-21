# Mubi Sync

Extensión estilo Teleparty para sincronizar la reproducción de Mubi entre dos
personas conectadas desde PCs distintas. Cada persona usa **su propia cuenta**
de Mubi; la extensión solo sincroniza los comandos de play, pausa y avance —
no transmite video ni audio.

## Cómo funciona
1. Un pequeño servidor (`server/`) recibe conexiones WebSocket y las agrupa
   por "sala" (un código de texto que ustedes eligen).
2. La extensión de Chrome (`extension/`) detecta el reproductor de video en
   la página de Mubi y, cuando alguien le da play/pausa o adelanta la
   película, avisa al servidor, que se lo reenvía a la otra persona.
3. Cada 5 segundos también se envía un "latido" con el tiempo actual, para
   corregir pequeños desfases (por ejemplo, si a uno le carga más lento).

## 1. Desplegar el servidor
Necesitas alojar `server/` en algún lugar accesible por internet (no puede
quedarse solo en tu PC, salvo que uses algo como ngrok). La opción más simple
y gratuita es Render:

1. Crea una cuenta en https://render.com
2. "New +" → "Web Service" → sube la carpeta `server/` (puedes subirla a un
   repositorio de GitHub primero, o usar "Deploy from a public Git repo").
3. Configura:
   - Build command: `npm install`
   - Start command: `npm start`
4. Al desplegar, Render te da una URL tipo `https://mubi-sync.onrender.com`.
   Para la extensión usa la versión WebSocket segura, cambiando `https://`
   por `wss://`, ejemplo: `wss://mubi-sync.onrender.com`.

Alternativas igual de válidas: Railway.app, Fly.io, o tu propio VPS con
`node server.js` detrás de un proxy con HTTPS/WSS.

Para probar rápido en la misma red o con ngrok sin desplegar nada:
```
cd server
npm install
npm start
# en otra terminal:
ngrok http 8080
```
Y usa la URL que te da ngrok (cambiando a `wss://`).

## 2. Instalar la extensión en Chrome (cada persona, en su PC)
1. Abre `chrome://extensions`
2. Activa "Modo de desarrollador" (arriba a la derecha)
3. Clic en "Cargar descomprimida" ("Load unpacked")
4. Selecciona la carpeta `extension/`
5. Verás el ícono de Mubi Sync en la barra de extensiones

## 3. Usarla
1. Ambas personas abren la **misma película** en Mubi y la dejan pausada
   en el inicio.
2. Ambas abren el popup de la extensión y completan:
   - **Servidor**: la URL `wss://...` del paso 1 (la misma para ambas)
   - **Código de sala**: cualquier palabra que acuerden, ej. `viernes-cine`
     (debe ser exactamente igual en ambas)
   - **Nombre**: opcional
3. Clic en "Conectar" en ambos navegadores.
4. Cuando el popup diga "2 personas en la sala", ¡ya está sincronizado!
   Al darle play, pausa o adelantar en un lado, se refleja en el otro.

## Notas
- Si Mubi cambia la estructura de su reproductor, puede que el content
  script necesite ajustarse (busca el `<video>` de la página).
- El servidor no guarda nada en disco; si se reinicia, solo hay que volver
  a conectar desde el popup.
- Esto no evita ni modifica ninguna protección de Mubi: cada persona
  reproduce el contenido normalmente con su propia suscripción.
