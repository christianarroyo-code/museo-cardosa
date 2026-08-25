# Museo Cardosa

El arte de Isabel Cardosa, catalogado por una IA. Sube una imagen de una obra y el
"comisario" la nombra, le escribe una ficha con humor y la ordena en salas temáticas.

Las obras se guardan en una **base de datos en la nube (Netlify Blobs)**, así que se
ven iguales en TODOS los dispositivos y navegadores. La colección es compartida.

## Desplegar en Netlify (desde GitHub)

Este proyecto usa funciones serverless y almacenamiento en la nube, así que hay que
desplegarlo conectando un repositorio (no vale arrastrar una carpeta).

1. Sube esta carpeta a un repositorio de **GitHub**.
2. Entra en https://app.netlify.com → "Add new site" → "Import an existing project".
3. Elige tu repositorio. Netlify lee `netlify.toml` y configura el build solo
   (build `npm run build`, publish `dist`, functions `netlify/functions`).
4. **Añade tu clave de IA**: en "Site settings → Environment variables", crea:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: tu clave de Anthropic (empieza por `sk-ant-...`), de
     https://console.anthropic.com
5. Pulsa "Deploy". En un par de minutos tendrás el museo online y compartido.

> Netlify Blobs se activa automáticamente, no tienes que configurar ninguna base de
> datos ni añadir más variables.

## Desarrollo local

```bash
npm install
npm install -g netlify-cli
export ANTHROPIC_API_KEY=sk-ant-tu-clave
netlify dev
```

`netlify dev` levanta la web y las funciones (incluido el almacenamiento en la nube)
en local. Con `npm run dev` a secas la app carga, pero las funciones no.

## Notas

- La colección es única y compartida: cualquiera que abra la web ve las mismas obras
  y puede añadir o retirar. Si quieres control de acceso, habría que añadir login.
- El uso de la API de Anthropic tiene coste según tu cuenta.
