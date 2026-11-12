// The language packs ship inside the app (assets/packs/<lang>/): a read-only store over fetch, for language-pack-client.
import { createClient, type PackReader, type BlobStore } from '@bt-synergy/language-pack-client'
import { trustedKeys } from './shared'

const BASE = './packs'
/** The pack lists change when the app is rebuilt: never take them from the browser cache. */
const NOCACHE: RequestInit = { cache: 'no-store' }
let index: { langs: string[] } | null = null
async function idx() {
  return (index ??= await (await fetch(`${BASE}/index.json`, NOCACHE)).json())
}
export async function installedLangs(): Promise<string[]> {
  return (await idx()).langs
}
export async function hasLang(lang: string): Promise<boolean> {
  return (await idx()).langs.includes(lang)
}

const ID_RE = /^[0-9a-f]{64}$/
function assetStore(lang: string): BlobStore {
  const dir = `${BASE}/${lang}`
  let ids: string[] | null = null
  const ro = async () => { throw new Error('read-only pack store') }
  return {
    async has(id) { return ID_RE.test(id) && (await this.ids()).includes(id) },
    async get(id) {
      if (!ID_RE.test(id)) return undefined
      const r = await fetch(`${dir}/seg/${id.slice(0, 2)}/${id}`)
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined
    },
    put: ro, delete: ro, setState: ro,
    async ids() { return (ids ??= await (await fetch(`${dir}/ids.json`, NOCACHE)).json()) },
    async getState() { const r = await fetch(`${dir}/state.json`, NOCACHE); return r.ok ? r.json() : undefined },
  }
}

const noNetwork = { fetch: async () => { throw new Error('offline') } } as any
const open = new Map<string, Promise<PackReader>>()
export function openLang(lang: string): Promise<PackReader> {
  if (!open.has(lang)) {
    const client = createClient({ store: assetStore(lang), source: noNetwork, trust: { trustedKeys: trustedKeys() } })
    open.set(lang, client.open(lang))
  }
  return open.get(lang)!
}
