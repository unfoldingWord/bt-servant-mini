export const SHARED_UNITS = ['art:tw:kt', 'art:tw:names', 'art:tw:other', 'art:ta:translate']
/** The staging publisher key (language-pack-v3/keys/78d2e6299a2de4d0.pub). */
export const STAGING_KEYS = '78d2e6299a2de4d0:c2057cec32b948452849e7fcba6af323961a091ea82645eb297bb368e1c8d911'
export const STAGING_SERVER = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'
export function trustedKeys(): Record<string, Uint8Array> {
  const keys: Record<string, Uint8Array> = {}
  for (const e of STAGING_KEYS.split(',')) {
    const [id, hex] = e.split(':')
    keys[id!] = Uint8Array.from(hex!.match(/../g)!, (p) => parseInt(p, 16))
  }
  return keys
}
