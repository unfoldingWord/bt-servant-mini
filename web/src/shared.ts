/** The article units every language pack shares: Translation Words, and the four Translation Academy manuals. */
export const SHARED_UNITS = ['art:tw:kt', 'art:tw:names', 'art:tw:other', 'art:ta:translate', 'art:ta:checking', 'art:ta:intro', 'art:ta:process']

// ------------------------------------------------------------------------------------------------------- publisher keys

/** The staging publisher key (language-pack-v3/keys/78d2e6299a2de4d0.pub): signs every pack the servers have today. */
export const STAGING_KEYS = '78d2e6299a2de4d0:c2057cec32b948452849e7fcba6af323961a091ea82645eb297bb368e1c8d911'
/**
 * The production publisher key, `<key id>:<public key hex>` (comma-separated for several), when Abel has made it: then the
 * packs may be signed with it and this version already accepts them. Only the public half ever goes here.
 */
export const PRODUCTION_KEYS = ''
/** Every key a pack may be signed with, comma-separated: production first, staging while packs signed with it exist. */
export const TRUSTED_KEYS = [PRODUCTION_KEYS, STAGING_KEYS].filter((k) => k.trim() !== '').join(',')
export function trustedKeys(list: string = TRUSTED_KEYS): Record<string, Uint8Array> {
  const keys: Record<string, Uint8Array> = {}
  for (const e of list.split(',')) {
    const [id, hex] = e.trim().split(':')
    if (!id || !hex || !/^([0-9a-f]{2})+$/i.test(hex)) continue
    keys[id] = Uint8Array.from(hex.match(/../g)!, (p) => parseInt(p, 16))
  }
  return keys
}

// ------------------------------------------------------------------------------------------------------- packs servers

/** Mini's own packs server (packs-server/ in this repo, R2 bucket bt-servant-mini-packs on unfoldingWord's account). */
export const MINI_SERVER = 'https://bt-servant-mini-packs.unfoldingword.workers.dev'
/** The translation-helps v2 preview: the only server of versions up to 0.9.9, kept as the fallback. */
export const PREVIEW_SERVER = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'
/** @deprecated the old name of PREVIEW_SERVER */
export const STAGING_SERVER = PREVIEW_SERVER
/**
 * Where the packs and the model are downloaded from, in order: the next one is tried when one fails (no answer, a server
 * error, or no catalog for that language). They serve the same bytes: a segment is named by its content, so any of them can
 * finish a download another one started.
 */
export const PACKS_SERVERS: readonly string[] = [MINI_SERVER, PREVIEW_SERVER]
