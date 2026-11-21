# Cómo publicar en la Chrome Web Store

## Antes de empezar

- [ ] `extension/config.js` tiene la URL de **tu** servidor (`wss://...onrender.com`).
- [ ] El servidor responde `ok` en `https://TU-SERVICIO.onrender.com/`.
- [ ] Probaste la extensión con otra persona (o con dos perfiles de Chrome).

## 1. Crear el ZIP

Comprime **el contenido** de la carpeta `extension/` (el `manifest.json` debe quedar en la raíz del ZIP,
no dentro de una subcarpeta).

- Windows: entra en `extension`, selecciona todo → clic derecho → *Comprimir en archivo ZIP*.
- Mac/Linux: `cd extension && zip -r ../watch-party-mubi.zip .`

## 2. Cuenta de desarrollador

1. Entra a https://chrome.google.com/webstore/devconsole con tu cuenta de Google.
2. Paga la cuota única de registro (5 USD) y verifica tu correo.

## 3. Subir y rellenar la ficha

**Nuevo elemento** → sube el ZIP. Luego rellena:

### Ficha de Play Store (pestaña "Store listing")

- **Descripción**: copia el texto de abajo.
- **Categoría**: Entretenimiento. **Idioma**: Español.
- **Ícono**: `extension/icons/icon128.png`.
- **Capturas de pantalla**: al menos 1, de 1280×800 o 640×400. Recomendado: MUBI con un aviso
  "Ana pausó" visible + el popup abierto con la sala.

### Prácticas de privacidad (pestaña "Privacy")

- **Propósito único**: "Sincronizar la reproducción de películas de MUBI entre amigos para verlas juntos."
- **Justificación de `storage`**: "Guardar el perfil del usuario (nombre y avatar) y la sala actual."
- **Justificación de permisos de host (`mubi.com`)**: "Detectar el reproductor de video de MUBI para
  sincronizar play, pausa y el minuto actual entre los participantes de la sala."
- **¿Usa código remoto?** No.
- **Datos que recoges**: marca *Contenido del sitio web* (minuto de la película) e *Información de
  identificación personal* solo si consideras el nombre elegido; certifica que no los vendes ni
  los usas para otros fines.
- **URL de la política de privacidad**: `https://TU-SERVICIO.onrender.com/privacy`

## 4. Enviar a revisión

Suele tardar de 1 a 7 días. Cuando se apruebe:

1. Copia el **ID de la extensión** (32 letras, aparece en la consola).
2. En Render → *Environment* → añade `ALLOWED_EXTENSION_IDS` = ese ID.
   Así tu servidor solo acepta conexiones de tu extensión publicada.
   (Si también quieres seguir probando la versión "descomprimida", añade su ID separado por coma.)

---

## Texto sugerido para la descripción

**Resumen (máx. 132 caracteres):**
Mira películas de MUBI sincronizadas con tus amigos. Play, pausa y saltos al mismo tiempo, cada uno con su cuenta.

**Descripción:**

¿Quieres ver una película de MUBI con alguien que está lejos? Watch Party for MUBI sincroniza la
reproducción para que ambos vean exactamente el mismo momento.

✔ Crea una sala con un clic y comparte el enlace de invitación
✔ Play, pausa y saltos se sincronizan al instante
✔ Si alguien llega tarde, se pone al día automáticamente
✔ Avisos en pantalla: "Ana pausó", "Luis se unió"
✔ Perfiles con nombre y avatar
✔ Hasta 10 personas por sala

Cómo usarla:
1. Instala la extensión y crea tu perfil.
2. Abre una película en MUBI y pulsa "Crear sala".
3. Copia el enlace y envíaselo a tus amigos.

Importante: cada persona necesita su propia suscripción a MUBI. La extensión no transmite video ni
audio, solo sincroniza los controles del reproductor.

Watch Party for MUBI es un proyecto independiente y no está afiliado, patrocinado ni respaldado por MUBI.
