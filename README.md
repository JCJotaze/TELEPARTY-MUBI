# Watch Party for MUBI

Extensión de Chrome para ver películas de MUBI **sincronizadas con tus amigos**, estilo Teleparty.
Cada persona usa **su propia cuenta** de MUBI; la extensión solo sincroniza play, pausa,
saltos y el minuto actual — no transmite video ni audio.

> No afiliado, patrocinado ni respaldado por MUBI.

## Qué incluye

- **Perfiles**: nombre + avatar, guardados en Chrome y sincronizados con tu cuenta de Google de Chrome.
- **Salas con código aleatorio** (`abc-123`) y **enlace de invitación**: tu amigo abre el enlace y entra solo.
- **Servidor fijo**: los usuarios no tienen que pegar ninguna URL (hay un campo avanzado opcional).
- **Avisos en pantalla**: "🐱 Ana pausó", "Luis se unió"… también en pantalla completa.
- **Quien llega tarde se pone al día** automáticamente con el minuto del anfitrión.
- **Reconexión automática** si se corta internet o el servidor de Render se reinicia/despierta.
- **Anfitrión**: solo él manda las correcciones periódicas, para que no haya saltos.
- Servidor endurecido: solo acepta conexiones desde la extensión, valida todo, máx. 10 personas
  por sala, límite de mensajes por segundo y limpieza de conexiones muertas.

## Estructura

```
extension/   Extensión de Chrome (Manifest V3)
  config.js    ← URL del servidor por defecto (EDITAR ANTES DE PUBLICAR)
server/      Servidor WebSocket (Node.js) — se despliega en Render
  privacy.html ← política de privacidad, servida en /privacy
docs/        Textos para la ficha de Chrome Web Store
```

## 1. Servidor en Render

1. **New + → Web Service** → elige este repositorio.
2. **Root Directory**: `server` · **Build**: `npm install` · **Start**: `npm start`.
3. (Recomendado tras publicar) en **Environment** añade
   `ALLOWED_EXTENSION_IDS` = el ID de tu extensión en la Chrome Web Store
   (varios separados por coma). Así nadie más puede usar tu servidor.
4. Comprueba que funciona abriendo `https://TU-SERVICIO.onrender.com/` (debe decir `ok`).
   La política de privacidad queda en `https://TU-SERVICIO.onrender.com/privacy`.

> En el plan gratis Render duerme el servidor tras un rato sin uso. La extensión muestra
> "Despertando el servidor…" y se conecta sola en cuanto despierta (puede tardar ~1 min).

## 2. Poner tu servidor en la extensión

Edita `extension/config.js`:

```js
const DEFAULT_SERVER_URL = "wss://TU-SERVICIO.onrender.com";
```

(Es la URL de Render cambiando `https://` por `wss://`.)

## 3. Probar la extensión

1. Abre `chrome://extensions` y activa **Modo de desarrollador**.
2. **Cargar descomprimida** → carpeta `extension/`.
3. Abre el ícono de la extensión, crea tu perfil y pulsa **Crear sala**.
4. Abre la película en MUBI, pulsa **Copiar enlace** y envíaselo a tu amigo.

## 4. Publicar en la Chrome Web Store

Sigue la guía paso a paso en [`docs/PUBLICAR.md`](docs/PUBLICAR.md).

## Pruebas del servidor

```bash
cd server
npm install
npm test
```

## Licencia

[MIT](LICENSE)
