# Servidor de paquetes de BT Servant Mini

Un Worker de Cloudflare pequeño, **solo de lectura**, que entrega a la app los paquetes de idiomas (formato 3) y el modelo del
teléfono desde el bucket R2 `bt-servant-mini-packs` (cuenta de unfoldingWord). Es la opción C de
`handoff/mini-servant/servidor-paquetes.md`.

- Dirección: `https://bt-servant-mini-packs.unfoldingword.workers.dev` (todavía no desplegado).
- Responde exactamente lo que pide la app, igual que el servidor viejo (el preview de translation-helps v2):
  - `GET|HEAD /v3/packs/<idioma>/catalog` y `/v3/packs/common/catalog`: el catálogo firmado (se revalida con `If-None-Match`).
  - `GET|HEAD /v3/packs/seg/<sha256>`: un segmento (inmutable, con `Range`; el modelo de 291 MB es uno de ellos).
  - CORS abierto (`*`), errores en el mismo formato (`{"error":"catalog not found"}`).
- No escribe, no lista y no construye nada. Los archivos los copia `sync.mjs`, byte por byte, así que las firmas siguen valiendo
  con la llave de staging que la app ya conoce.

## Probar en local

```sh
cd packs-server
bun install
bun test                         # pruebas del worker (R2 simulado)
bun sync.mjs --dry-run           # qué copiaría al bucket local: cuántos archivos y cuántos MB
bun sync.mjs --local             # copia al R2 local que usa wrangler dev (nunca a la nube)
npx wrangler dev --local         # sirve en http://127.0.0.1:8787
```

`sync.mjs` copia los idiomas que ofrece la app (`CANDIDATES` en `web/src/packs.ts`; hoy el servidor viejo tiene en, es-419, id,
hi y ar), el catálogo `common` que piden (Translation Words y los cuatro manuales de Translation Academy) y el modelo de
`web/src/data/models.json`. Revisa la firma de cada catálogo antes de copiar, copia solo lo que falta y deja los catálogos para
el final. Si se corta, se vuelve a correr y sigue. Opciones: `--langs en,id`, `--no-model`, `--from <url>`, `--dir <carpeta>`.

## Desplegar (para Abel o el coordinador; cada paso con el OK de Abel)

```sh
cd packs-server
bun install
npx wrangler login                                   # con una cuenta que tenga acceso a unfoldingWord
npx wrangler r2 bucket create bt-servant-mini-packs  # 1. el bucket
npx wrangler deploy                                  # 2. el worker (lee el bucket; vacío responde 404)
bun sync.mjs --remote --dry-run                      # 3. qué falta subir (lo pregunta al worker desplegado)
bun sync.mjs --remote                                # 4. subir (unos 333 MB, unos 810 archivos)
curl -I https://bt-servant-mini-packs.unfoldingword.workers.dev/v3/packs/en/catalog   # 5. comprobar: 200
```

`--remote` sube cada archivo con `wrangler r2 object put --remote` (varios a la vez, `--concurrency`) y pregunta al worker
desplegado qué ya está, así que el worker va antes que el sync.

**Después de cada publicación hay que volver a correr el paso 4** (sube solo lo nuevo). tc-study publica en el servidor viejo, no
aquí. Si este bucket se queda atrás, un teléfono que ya tiene una revisión más nueva de un idioma (bajada del servidor viejo)
recibiría de aquí una más vieja, y el cliente la rechaza (`E_DOWNGRADE`). La app de esta versión en adelante lo evita: si el
catálogo de un servidor es más viejo que el que tiene el teléfono, pregunta al siguiente. Aun así, mientras el bucket esté
atrás, los teléfonos nuevos reciben la versión vieja.

El script escribe los catálogos al final y en orden: primero `common` y después los idiomas que lo piden. No escribe un catálogo
si falta alguno de sus segmentos o si el `common` que pide no quedó en el bucket. Cada segmento se comprueba antes de subirlo,
como lo comprueba la app (su id es el SHA-256 de su contenido).

## La llave de producción (más adelante)

Cuando Abel cree la llave de producción, se pone **solo la parte pública** en `PRODUCTION_KEYS` de `web/src/shared.ts`
(`<id>:<hex>`, separadas por comas si son varias) y se publica una versión de la app. Esa versión acepta paquetes firmados
con la de producción y con la de staging. Solo después se pueden subir aquí paquetes firmados con la nueva llave. La llave privada
nunca entra en este repo.

## Instalaciones viejas (0.9.9 o antes)

Esas versiones solo conocen el servidor viejo (`translation-helps-mcp-v2-preview`) y la llave de staging. Desde esta versión la
app pide primero a este servidor y, si falla (sin respuesta, error del servidor o sin catálogo de ese idioma), al viejo.
Por eso **el servidor viejo tiene que seguir funcionando, con sus paquetes y el modelo, hasta que casi todos los teléfonos se
hayan actualizado**. Si se apaga antes, una app vieja no podrá bajar idiomas nuevos ni el modelo (lo ya instalado sigue
funcionando, y se puede importar un `.tcpack`).
