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
- Paquetes incluidos: `en` (Rut, Salmos, Jonás, Juan, Tito, más los artículos) y `es-419` (Rut, Tito). Si un libro no está en
  español, responde con el paquete en inglés.

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
