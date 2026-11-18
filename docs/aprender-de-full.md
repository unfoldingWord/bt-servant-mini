# Qué puede aprender Mini de BT Servant (Full)

Ideas para Mini sacadas de comparar el código de los dos (18 nov 2026). Mini y BT Servant Full son hermanos:
el mismo objetivo (que el traductor entienda el texto y traduzca mejor con los recursos de unfoldingWord), cada una donde
sirve mejor. No compiten. Esto es una lista de ideas para elegir, no un plan aprobado: cada una se decide antes de construir.

Rutas: `W:` = `unfoldingWord/bt-servant-worker`; `origin/main:` = la rama `main` de ese repo; `bt-servant-admin-portal` es
su portal. Las rutas sin prefijo (`web/src/...`, `worker/src/...`, `app/src/...`) son de este repo. Números de línea de
la fecha de arriba.

## La regla para elegir

La regla para elegir es esta: tomar de Full **lo que da a la persona**, sin tomar **cómo lo hace**. Lo valioso de Mini es que el código manda, que funciona sin red y que casi no cuesta. Una idea de Full sirve solo si respeta eso.

## Ideas que encajan bien con Mini

**1. Voz de entrada y de salida.**
- Full recibe notas de voz (`W:src/services/audio/cloudflare-stt.ts`:5) y puede contestar con audio (`W:src/services/audio/openai-tts.ts`:12-13).
- Mini no tiene nada de voz. Una búsqueda de `SpeechRecognition`, `TextToSpeech`, `MediaRecorder` y `getUserMedia` en `web/src` y `app/src` no encontró nada.
- Por qué importa: muchos traductores de campo trabajan en culturas orales, o leen con esfuerzo en su idioma puente.
- Cómo hacerlo al estilo de Mini:
  - **Salida:** leer en voz alta la respuesta y las ayudas con el TTS del sistema. En Android funciona sin conexión, sin costo y sin modelo nuevo. Es lo más barato de esta lista.
  - **Entrada:** dictar con el reconocimiento del sistema donde funcione sin conexión. Si no, mandar el audio al Whisper de Workers AI con la IA en línea activa: es la misma cuenta de Cloudflare que ya usa `bt-servant-mini-ai`. En los dos casos, el texto resultante entra al camino normal, y el código sigue mandando.

**2. Una memoria de las decisiones del traductor, en el teléfono.**
- Full guarda por persona una memoria de «conclusiones y decisiones», hasta 128 KB (`W:src/services/memory/types.ts`:13; `origin/main:src/types/prompt-overrides.ts`, ranura `memory_instructions`).
- Mini guarda marcadores y notas sueltas (`web/src/saved.ts`). No tiene un registro estructurado de decisiones: una búsqueda de «glossary» y «decision» no encontró nada de eso.
- La idea: un glosario del proyecto («para *gracia* uso X», «para *pacto* uso Y»), guardado solo en el teléfono.
  - Mini lo mostraría junto a las palabras clave del paquete cuando aparecen en un pasaje.
  - Si la persona lo permite, lo sumaría a las ayudas que van a la IA en línea.
- Esto respeta las dos reglas de Mini: lo arma el código y no sale del teléfono sin permiso. Además ayuda a la consistencia, que es un problema real de toda traducción.

**3. Modos y guías que se publican sin sacar otra versión de la app.**
- En Full, cada organización escribe sus modos como documentos y los publica desde el portal (`bt-servant-admin-portal/src/types/prompt-override.ts`:59-80). Lo mismo hace con guías por idioma (`W:src/types/languages.ts`:1-9).
- En Mini, los modos están fijos en el código (`web/src/modes.ts`:41).
- Cómo hacerlo al estilo de Mini: que el paquete (o el catálogo común) traiga definiciones de modos guiados y una guía corta por idioma. Ejemplos de guía: cómo nombrar a Dios, qué registro usar, términos ya decididos por la iglesia local.
- El código de Mini las recorrería igual que hoy. Llegarían firmadas, con el mismo mecanismo de los paquetes. Un socio podría adaptar Mini a su programa sin tocar la app.

**4. Que el texto en línea aparezca mientras se escribe.**
- Full manda la respuesta por SSE, con eventos de progreso (`W:src/index.ts`:186-196).
- El `/v1/answer` de Mini devuelve todo de una vez (`web/src/online.ts`:118; `worker/src/index.ts`:341). Una búsqueda de «stream» en el worker de Mini no encontró nada.
- Con señal débil, ver el texto mientras llega (Workers AI permite `stream: true`) hace que la espera de varios segundos se sienta menor. La respuesta del teléfono ya está en pantalla, así que esto solo mejora la parte en línea.
- Es un cambio pequeño en el worker y en `online.ts`.

**5. Una salida para imprimir o compartir con el grupo de revisión.**
- Full genera PDF (`W:src/services/claude/tools.ts`:181-211) y responde en grupos de chat (`W:src/services/claude/system-prompt.ts`:204-217).
- Mini ya puede compartir una respuesta (`web/src/share.ts`), pero no tiene una salida para imprimir.
- La idea: una hoja de un pasaje con texto, notas y preguntas de comprensión, armada sin conexión desde el paquete, para imprimir o mandar como archivo.
- Le sirve a quien revisa con la comunidad sin teléfono para todos, que es justo el uso de las preguntas de comprensión (tQ).

## Ideas que sirven, pero que hay que decidir antes

**6. Contestar más allá de las ayudas, siempre con una etiqueta.**
- Hoy Mini solo llama a la IA si el teléfono encontró algo (`web/src/main.ts`:1377-1379). Es una decisión buena, tomada tras un reporte del 13 nov en que el modelo respondía de memoria. Por eso quedan sin respuesta preguntas que Full sí atiende: contexto cultural o histórico, y lenguas originales cuando el paquete no tiene la palabra.
- Hay dos caminos:
  - **(a)** Usar más el paquete: el segmento de lenguas originales y el léxico ya existen en el formato (`orig.cddl`, `lex.cddl`). Contestar desde ahí mantiene la regla de que manda el código.
  - **(b)** Con la IA en línea activa, pasar esas preguntas a BT Servant Full por su API, mostrando la respuesta aparte y con una advertencia: «esto no viene de tus recursos; lo respondió BT Servant en línea».
- El camino (b) une los dos productos, pero mezcla dos niveles de confianza en la misma pantalla y trae el costo de Full, que no tiene tope por persona. Lo recomendable es primero (a) y decidir (b) aparte.

**7. Medir el uso con más detalle.**
- Full mide por turno los tokens, las herramientas y la duración (`W:src/services/claude/orchestrator.ts`:575-600).
- Mini solo cuenta el uso si la persona acepta (`web/src/usage.ts`:25), y guarda opiniones (`worker/src/index.ts`:289-291).
- Hoy Mini no sabe con qué frecuencia una pregunta termina en «desconocida», ni en qué idioma. Ese dato serviría para mejorar el modelo de 270M y la gramática de intenciones. Contar solo intención e idioma, sin el texto de la pregunta, mantiene la privacidad.

## Lo que Mini no debería copiar

- **Que el modelo decida y el fundamento dependa solo del prompt.** Full no comprueba sus respuestas en código. Lo mejor de Mini es que sí.
- **El costo sin tope por persona.** Full puede hacer 100 llamadas al modelo por mensaje. Mini tiene topes duros por minuto y por día.
- **Depender de la red para responder.**
- **Configuración ilimitada por organización** (prompts libres de 8000 caracteres por ranura). En Mini cada versión y cada paquete pasan una prueba; con prompts libres eso no se podría garantizar. Lo que se adopte de la idea 3 debería ser estructurado (modos y guías con un esquema fijo), no texto libre para el modelo.

## Orden sugerido

| # | Idea | Valor para el traductor | Costo | Respeta las reglas de Mini |
|---|---|---|---|---|
| 1 | Leer en voz alta con el TTS del sistema | Alto | Bajo | Sí |
| 4 | Ver la respuesta en línea mientras se escribe | Medio | Bajo | Sí |
| 2 | Glosario de decisiones en el teléfono | Alto | Medio | Sí |
| 5 | Hoja de un pasaje para imprimir o compartir | Medio | Medio | Sí |
| 3 | Modos y guías por idioma dentro del paquete | Alto para socios | Medio a alto (toca el formato 3, que es compartido con bt-synergy) | Sí, si es estructurado |
| 1b | Dictado por voz | Alto | Medio | Sí |
| 6a | Contestar desde lenguas originales y el léxico del paquete | Medio | Medio | Sí |
| 7 | Medir intención e idioma sin el texto | Medio (para el equipo) | Bajo | Sí, con permiso |
| 6b | Pasar a Full lo que el paquete no cubre | Alto | Alto (costo y diseño) | Hay que decidirlo |

Aviso: Mini es trabajo de unfoldingWord, pero según la memoria de este workspace, en Mini el código lo escribe Claude (excepción de Abel del 11 nov). La idea 3 toca el formato de paquete de bt-synergy, que es compartido, así que esa parte seguiría la regla de uW.

**Al revés.** Full también podría aprender una cosa de Mini: llamar al modelo para redactar solo cuando una herramienta devolvió algo, y mostrar las fuentes a partir de lo que devolvieron las herramientas, no del texto del modelo. Eso es fundamento comprobado en código, y Full hoy solo lo pide en el prompt.
