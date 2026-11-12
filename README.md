# BT Servant Mini (Android, sin conexión)

App de prueba: preguntas en lenguaje natural (inglés, español, francés, indonesio, hindi) respondidas con las ayudas de traducción
de los paquetes de idioma formato 3 (tc-language-packs) que lleva dentro, sin internet. Trabajo de unfoldingWord, fase de prueba.

## Cómo funciona
- `MainActivity.java`: un WebView muestra el chat (`assets/www`) y arranca `llama-server` (llama.cpp b12318, Android arm64) desde la
  carpeta de bibliotecas nativas, escuchando solo en 127.0.0.1. La primera vez copia el modelo (291 MB) fuera del APK.
- Modelo: FunctionGemma 270M afinado (LoRA, fase 0) en q8_0. Escribe la «ficha» de la pregunta en JSON (intención, libro, capítulo,
  versículos, término, frase, idioma).
- `web/src/sheet.ts`: ficha -> consulta (nombres de libros en 5 idiomas, figuras retóricas, glosario de 190 términos clave fr/id/hi).
- `web/src/answer.ts`: las recetas de la fase 0 sobre `language-pack-client` (pasaje, notas, preguntas, palabras clave, artículos,
  conteos, recursos, consejo de traducción), con plantillas en los 5 idiomas.
- Paquetes incluidos (12 nov): `en` con los 66 libros (25 MB) y `es-419` con los 6 libros que publica el servidor de staging.
  Si un libro no está en español, responde con el paquete en inglés.

## Conversación (v0.2)
- Cada respuesta: una frase que presenta lo encontrado (`web/src/converse.ts`, armada con los datos reales, en 5 idiomas), la
  información de los paquetes debajo y botones para seguir (notas, preguntas, texto, versículo siguiente), que no pasan por el modelo.
- «¿Y el versículo 4?» usa el libro y capítulo de la pregunta anterior. Hasta 3 conversaciones guardadas (localStorage), borrables.
- La frase no la escribe un modelo: Qwen3 0.6B, Llama 3.2 1B y Gemma 3 1B inventaron conteos, versículos y definiciones al
  intentarlo (12 nov). Un modelo de 3-4B sería el siguiente intento.

## Preguntas abiertas (v0.3)
- «¿En qué versículo Abraham sacrifica a Isaac?», «Where is Jonah swallowed by a fish?» -> `web/src/search.ts`.
- Palabras con contenido de la pregunta (sin palabras vacías de los 5 idiomas). Las que nombran un artículo de Palabras de
  Traducción (nombres y términos clave; por nombre exacto, raíz común o el glosario fr/id/hi; personas con nombre de libro en los
  5 idiomas) se vuelven conceptos; se buscan los versículos cuyos enlaces de palabras los tienen, en ventanas de 7 versículos,
  primero los pasajes donde varios versículos los nombran juntos. Las otras palabras suben el puntaje si están en el texto inglés.
  Si no hay conceptos, búsqueda de texto del cliente (todas las palabras, luego menos).
- Límite: en fr/id/hi solo los nombres cruzan de idioma; «pez» o «poisson» no se comparan con el texto inglés. Orden imperfecto:
  para Abraham e Isaac, Génesis 22:6 sale cuarto (Éxodo 3:15 primero).
- Si el modelo no saca una referencia escrita («Rut 1:16»), el código la lee de la pregunta.

## Continuar después de una búsqueda (v0.4)
- La conversación guarda los versículos encontrados (`found`) y el último versículo mostrado (`last`).
- «el segundo», «the first one» -> ese resultado; «ese versículo», «that verse» o solo «¿y las preguntas?» -> el último mostrado.
- «Notas sobre Abraham sacrificando a Isaac» busca y muestra directo las notas del mejor versículo, con los demás como botones.
- Un libro solo cuenta si su nombre está escrito en la pregunta (el modelo a veces inventa uno). En español, las palabras de la
  pregunta se comparan también con el texto español cuando el paquete tiene el libro.

## Construir e instalar
```
python -I -X utf8 web/build.py                # bundle + paquetes en app/src/main/assets/www (necesita bun y ../lp3-mcp, ../fase0-mini-servant/packs)
<gradle 8.14.3> assembleDebug                 # APK en app/build/outputs/apk/debug/app-debug.apk (~315 MB)
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
No están en git (pesados): `app/src/main/jniLibs/arm64-v8a/` (binarios de llama.cpp, renombrados `libllamaserver.so` y
`lib*.so`, pasados por `llvm-strip`) y `app/src/main/assets/model/ms-all-q8.gguf`.

## Límites (honestos)
- El modelo entiende bien unas 5 de cada 12 preguntas nuevas en la medición de la fase 0; pasajes y artículos van mejor que conteos.
- Sin paquetes en francés, indonesio ni hindi: el contenido sale en inglés (o español), solo las frases fijas van en el idioma.
- Las plantillas y el glosario en fr/id/hi los escribió un modelo; nadie que hable esos idiomas los revisó.
- Medido en un Galaxy A56 (12 GB): ~640 MB de RAM, 1-3 s por respuesta. No probado en un teléfono de 2-3 GB.
