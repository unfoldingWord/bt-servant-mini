#!/usr/bin/env bun
// Copies the language packs (format 3) and the phone model from the server the app used until 0.9.9 (the translation-helps
// v2 preview, read-only over HTTPS) into Mini's own bucket, byte for byte: the catalogs keep the staging signature the app
// already trusts, and the segments keep their ids.
//
//   bun sync.mjs --dry-run            what would be copied into the local bucket (counts and MB), nothing written
//   bun sync.mjs --local              into the R2 bucket `wrangler dev` uses (.wrangler/state, miniflare): never the cloud
//   bun sync.mjs --dir <folder>       into a folder, as <folder>/v3/catalog/<lang>.seg and <folder>/v3/seg/<id>.seg
//   bun sync.mjs --remote             into the real bucket with `wrangler r2 object put --remote` (needs Abel's OK; checks
//                                     what is there through the deployed worker, --target-url)
// Options: --from <url> (default the preview server), --langs en,id (default every language the app offers, plus the
// catalogs they require), --no-model, --concurrency 6, --rpm 400 (requests a minute to the source), --bucket <name>.
//
// Each catalog is read and its signature checked with the app's trusted keys before anything is copied; then only the segments
// the target does not have are fetched (each checked against its size in the catalog; the model against its SHA-256) and
// written, and the catalog last, so a catalog never names a segment the target lacks. Running it again copies only what
// changed, so a cut run is resumed by running it again.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, createReadStream, createWriteStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { verifyCatalogFile } from '@bt-synergy/language-pack-client'
import { MINI_SERVER, PREVIEW_SERVER, trustedKeys } from '../web/src/shared.ts'
import { CANDIDATES } from '../web/src/packs.ts'
import models from '../web/src/data/models.json'

const HERE = import.meta.dir
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def
}
const FROM = opt('from', PREVIEW_SERVER).replace(/\/+$/, '')
const DRY = flag('dry-run')
const BUCKET = opt('bucket', 'bt-servant-mini-packs')
const CONCURRENCY = Number(opt('concurrency', '6'))
const RPM = Number(opt('rpm', '400'))
const LANGS = opt('langs', CANDIDATES.join(',')).split(',').filter(Boolean)
const BIG = 32 << 20 // larger objects go through a file (with Range resume), not memory
const CACHE = join(HERE, '.sync-cache')
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const mb = (n) => (n / 1048576).toFixed(1)
const segKey = (id) => `v3/seg/${id}.seg`
const catKey = (name) => `v3/catalog/${name}.seg`

// ------------------------------------------------------------------------------------------------------------ source

let lastStart = 0
/** Spaces the requests to the source (the preview limits segment requests a minute per address) and retries 429/5xx. */
async function fromSource(path, init = {}, tries = 6) {
  for (let attempt = 1; ; attempt++) {
    const gap = 60000 / RPM
    const wait = Math.max(0, lastStart + gap - Date.now())
    lastStart = Math.max(Date.now(), lastStart + gap)
    if (wait) await new Promise((r) => setTimeout(r, wait))
    let res
    try {
      res = await fetch(`${FROM}${path}`, init)
    } catch (e) {
      if (attempt >= tries) throw e
      await new Promise((r) => setTimeout(r, 1000 * attempt))
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const after = Number(res.headers.get('Retry-After'))
      await res.body?.cancel()
      await new Promise((r) => setTimeout(r, (Number.isFinite(after) && after > 0 ? after : 2 * attempt) * 1000))
      continue
    }
    return res
  }
}

/** A segment's bytes, checked: its length against the catalog, the model's SHA-256 against its id. */
async function fetchSegment(id, size, sha) {
  const res = await fromSource(`/v3/packs/seg/${id}`)
  if (!res.ok) throw new Error(`segment ${id}: HTTP ${res.status}`)
  const b = new Uint8Array(await res.arrayBuffer())
  if (b.length !== size) throw new Error(`segment ${id}: got ${b.length} bytes, the catalog says ${size}`)
  if (sha && createHash('sha256').update(b).digest('hex') !== sha) throw new Error(`segment ${id}: SHA-256 differs`)
  return b
}

/** A large segment into a file in .sync-cache, resumed with Range when a run was cut; checked like fetchSegment. */
async function fetchSegmentToFile(id, size, sha) {
  mkdirSync(CACHE, { recursive: true })
  const done = join(CACHE, `${id}.seg`)
  const part = `${done}.part`
  if (!existsSync(done)) {
    let have = existsSync(part) ? statSync(part).size : 0
    if (have > size) {
      rmSync(part)
      have = 0
    }
    if (have < size) {
      const res = await fromSource(`/v3/packs/seg/${id}`, have ? { headers: { Range: `bytes=${have}-` } } : {})
      if (res.status !== 200 && res.status !== 206) throw new Error(`segment ${id}: HTTP ${res.status}`)
      const out = createWriteStream(part, { flags: res.status === 206 ? 'a' : 'w' })
      let got = res.status === 206 ? have : 0
      let shown = 0
      for await (const chunk of res.body) {
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
        got += chunk.length
        if (got - shown > 32 << 20) {
          shown = got
          console.log(`  ${id.slice(0, 12)}… ${mb(got)} / ${mb(size)} MB`)
        }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())))
    }
    renameSync(part, done)
  }
  const n = statSync(done).size
  if (n !== size) {
    rmSync(done)
    throw new Error(`segment ${id}: got ${n} bytes, expected ${size}`)
  }
  if (sha) {
    const h = createHash('sha256')
    for await (const chunk of createReadStream(done)) h.update(chunk)
    if (h.digest('hex') !== sha) {
      rmSync(done)
      throw new Error(`segment ${id}: SHA-256 differs`)
    }
  }
  return done
}

// ------------------------------------------------------------------------------------------------------------ targets

/** Where the copy goes: has(key, size) → present; get(key) → bytes or null (catalogs); put(key, bytes | {file}). */
async function openTarget() {
  if (flag('remote')) {
    if (flag('local') || opt('dir')) throw new Error('one target: --local, --dir or --remote')
    const base = opt('target-url', MINI_SERVER).replace(/\/+$/, '')
    const path = (key) => key.replace(/^v3\/catalog\/(.+)\.seg$/, '/v3/packs/$1/catalog').replace(/^v3\/seg\/(.+)\.seg$/, '/v3/packs/seg/$1')
    const wrangler = join(HERE, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.exe' : 'wrangler')
    return {
      name: `R2 bucket ${BUCKET} (remote; read through ${base})`,
      async has(key, size) {
        const r = await fetch(`${base}${path(key)}`, { method: 'HEAD' })
        if (r.status === 404) return false
        if (!r.ok) throw new Error(`${base}${path(key)}: HTTP ${r.status} (is the worker deployed?)`)
        return Number(r.headers.get('Content-Length')) === size
      },
      async get(key) {
        const r = await fetch(`${base}${path(key)}`)
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`${base}${path(key)}: HTTP ${r.status} (is the worker deployed?)`)
        return new Uint8Array(await r.arrayBuffer())
      },
      async put(key, data) {
        let file = data.file
        if (!file) {
          mkdirSync(CACHE, { recursive: true })
          file = join(CACHE, key.replace(/\//g, '_'))
          writeFileSync(file, data)
        }
        const bin = existsSync(wrangler) ? wrangler : 'wrangler'
        const r = spawnSync(bin, ['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', 'application/octet-stream', '--remote'], {
          cwd: HERE, encoding: 'utf8', shell: process.platform === 'win32',
        })
        if (r.status !== 0) throw new Error(`wrangler r2 object put ${key}: ${(r.stderr || r.stdout || '').trim().slice(-400)}`)
        if (!data.file) rmSync(file, { force: true })
      },
    }
  }
  const dir = opt('dir')
  if (dir) {
    const root = resolve(dir)
    return {
      name: `folder ${root}`,
      async has(key, size) {
        const f = join(root, key)
        return existsSync(f) && statSync(f).size === size
      },
      async get(key) {
        const f = join(root, key)
        return existsSync(f) ? new Uint8Array(readFileSync(f)) : null
      },
      async put(key, data) {
        const f = join(root, key)
        mkdirSync(dirname(f), { recursive: true })
        writeFileSync(`${f}.tmp`, data.file ? readFileSync(data.file) : data)
        renameSync(`${f}.tmp`, f)
      },
    }
  }
  // --local (and the default for --dry-run): the bucket `wrangler dev` reads, through miniflare. Never the cloud.
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({ configPath: join(HERE, 'wrangler.toml'), persist: { path: join(HERE, '.wrangler', 'state', 'v3') }, remoteBindings: false })
  const bucket = proxy.env.PACKS
  return {
    name: `local R2 bucket ${BUCKET} (wrangler dev, ${join(HERE, '.wrangler', 'state')})`,
    async has(key, size) {
      const h = await bucket.head(key)
      return !!h && h.size === size
    },
    async get(key) {
      const o = await bucket.get(key)
      return o ? new Uint8Array(await o.arrayBuffer()) : null
    },
    async put(key, data) {
      const bytes = data.file ? new Uint8Array(readFileSync(data.file)) : data
      await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } })
    },
    dispose: () => proxy.dispose(),
  }
}

// ------------------------------------------------------------------------------------------------------------ run

async function pool(items, n, f) {
  let i = 0
  const errors = []
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      try {
        await f(item)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  }))
  return errors
}

async function main() {
  if (!flag('local') && !flag('remote') && !opt('dir') && !DRY) {
    console.log('Say where: --dry-run, --local, --dir <folder> or --remote (see the top of sync.mjs).')
    process.exit(2)
  }
  const trust = { trustedKeys: trustedKeys() }
  const target = await openTarget()
  console.log(`from ${FROM}\ninto ${target.name}${DRY ? ' (dry run: nothing is written)' : ''}\n`)

  // 1. the catalogs: every language asked for that the source has, and every catalog they require (common)
  const catalogs = new Map() // name → { bytes, verified }
  const missingLangs = []
  const queue = [...LANGS]
  while (queue.length) {
    const name = queue.shift()
    if (catalogs.has(name)) continue
    const res = await fromSource(`/v3/packs/${encodeURIComponent(name)}/catalog`)
    if (res.status === 404) {
      missingLangs.push(name)
      await res.body?.cancel()
      continue
    }
    if (!res.ok) throw new Error(`catalog ${name}: HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    // only what the app would accept is copied: signed with a key it trusts
    const verified = await verifyCatalogFile(bytes, trust, { from: 'network' })
    catalogs.set(name, { bytes, verified })
    for (const [req] of verified.catalog.requires ?? []) if (!catalogs.has(req)) queue.push(req)
  }

  // 2. the segments they list (all of them: any book or unit a phone may ask for) and the model
  const segs = new Map() // id → { size, sha?, of: Set<name> }
  for (const [name, { verified }] of catalogs) {
    for (const s of verified.catalog.segments) {
      const id = hex(s.id)
      if (!segs.has(id)) segs.set(id, { size: s.size, of: new Set() })
      segs.get(id).of.add(name)
    }
  }
  if (!flag('no-model')) {
    for (const m of models.models) {
      const id = m.path.split('/').pop()
      segs.set(id, { size: m.bytes, sha: m.sha256.toLowerCase(), of: new Set([`model ${m.name}`]) })
    }
  }

  // 3. what the target lacks
  const ids = [...segs.keys()]
  const lacking = []
  const errors = await pool(ids, 16, async (id) => {
    if (!(await target.has(segKey(id), segs.get(id).size))) lacking.push(id)
  })
  if (errors.length) throw new Error(`reading the target: ${errors[0]}`)
  const catChanges = []
  for (const [name, { bytes }] of catalogs) {
    const now = await target.get(catKey(name))
    const same = !!now && now.length === bytes.length && now.every((b, i) => b === bytes[i])
    if (!same) catChanges.push({ name, state: now ? 'changed' : 'new' })
  }

  // the report
  const rows = [...catalogs].map(([name, { verified }]) => {
    const mine = verified.catalog.segments.map((s) => hex(s.id))
    const lack = mine.filter((id) => lacking.includes(id))
    const ch = catChanges.find((c) => c.name === name)
    return {
      catalog: name, revision: verified.revision, signedBy: verified.signedBy ?? '-', catalogIs: ch ? ch.state : 'same',
      segments: mine.length, MB: mb(mine.reduce((n, id) => n + segs.get(id).size, 0)),
      toCopy: lack.length, MBtoCopy: mb(lack.reduce((n, id) => n + segs.get(id).size, 0)),
    }
  })
  for (const m of flag('no-model') ? [] : models.models) {
    const id = m.path.split('/').pop()
    const lack = lacking.includes(id)
    rows.push({ catalog: `model ${m.name}`, revision: '-', signedBy: 'sha256', catalogIs: '-', segments: 1, MB: mb(m.bytes), toCopy: lack ? 1 : 0, MBtoCopy: mb(lack ? m.bytes : 0) })
  }
  console.table(rows)
  const allBytes = ids.reduce((n, id) => n + segs.get(id).size, 0) + [...catalogs.values()].reduce((n, c) => n + c.bytes.length, 0)
  const copyBytes = lacking.reduce((n, id) => n + segs.get(id).size, 0) + catChanges.reduce((n, c) => n + catalogs.get(c.name).bytes.length, 0)
  console.log(`not on the source (skipped): ${missingLangs.join(', ') || '-'}`)
  console.log(`objects: ${ids.length + catalogs.size} (${catalogs.size} catalogs, ${ids.length} segments), ${mb(allBytes)} MB`)
  console.log(`to copy: ${lacking.length + catChanges.length} objects (${catChanges.length} catalogs, ${lacking.length} segments), ${mb(copyBytes)} MB`)
  if (DRY) return target.dispose?.()

  // 4. copy: segments first (small ones in parallel, the model through a file), the catalogs last
  const t0 = Date.now()
  let copied = 0
  const small = lacking.filter((id) => segs.get(id).size < BIG)
  const big = lacking.filter((id) => segs.get(id).size >= BIG)
  const failed = await pool(small, CONCURRENCY, async (id) => {
    const s = segs.get(id)
    await target.put(segKey(id), await fetchSegment(id, s.size, s.sha))
    if (++copied % 50 === 0) console.log(`  ${copied} / ${lacking.length} segments`)
  })
  for (const id of big) {
    try {
      const s = segs.get(id)
      const file = await fetchSegmentToFile(id, s.size, s.sha)
      await target.put(segKey(id), { file })
      rmSync(file, { force: true })
      copied++
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e))
    }
  }
  let catsWritten = 0
  for (const { name } of catChanges) {
    const mine = catalogs.get(name).verified.catalog.segments.map((s) => hex(s.id))
    // a catalog goes in only when every segment it names is there
    const still = []
    for (const id of mine) if (!(await target.has(segKey(id), segs.get(id).size))) still.push(id)
    if (still.length) {
      failed.push(`catalog ${name} not written: ${still.length} of its segments are missing`)
      continue
    }
    await target.put(catKey(name), catalogs.get(name).bytes)
    catsWritten++
  }
  console.log(`\ncopied ${copied} segments and ${catsWritten} catalogs, ${mb(copyBytes)} MB planned, in ${Math.round((Date.now() - t0) / 1000)} s`)
  await target.dispose?.()
  if (failed.length) {
    console.log(`${failed.length} failed (run again to resume):\n  ${failed.slice(0, 20).join('\n  ')}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
