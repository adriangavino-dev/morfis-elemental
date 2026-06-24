# Morfis Elemental

Chatbot educativo de transformaciones lineales: el usuario pide rotar, escalar,
reflejar, trasladar, cambiar colores o resaltar zonas de una imagen (o de un
polígono de coordenadas), y la app muestra la matriz de cada operación, la
explicación paso a paso y el resultado antes/después.

## Correr en local

```bash
npm install
npm run dev
```

Sin backend, el chatbot usa un intérprete local por palabras clave (entiende
español con o sin tildes). Para lenguaje libre real, configurá Groq (abajo).

## Lenguaje natural con Groq (opcional pero recomendado)

La función `api/interpret.js` llama a Groq (Llama) para entender frases libres.
La API key vive **solo en el servidor**, nunca en el navegador.

1. Sacá una API key gratis en https://console.groq.com
2. En Vercel: Project → Settings → Environment Variables → agregá
   `GROQ_API_KEY` con tu key.
3. Redeploy. Si la variable no está, la app igual funciona con el parser local.

## Desplegar en Vercel

1. Subí TODO este proyecto a un repo de GitHub.
2. En Vercel: Add New → Project → importá el repo.
3. Framework Preset: **Vite** (lo detecta solo). Build: `npm run build`,
   Output: `dist`. La carpeta `/api` se publica sola como serverless function.
4. Agregá `GROQ_API_KEY` en Environment Variables y desplegá.

## Estructura

```
index.html
vite.config.js
package.json
src/
  main.jsx       # punto de entrada React
  App.jsx        # la app (geometría, color, coordenadas, resaltado, chat)
api/
  interpret.js   # serverless: texto libre -> intención {space,type,params}
```
