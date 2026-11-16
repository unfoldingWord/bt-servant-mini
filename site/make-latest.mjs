// Writes site/latest.json for a release, which the Android app reads to say there is a new version (web/src/update.ts).
//   node site/make-latest.mjs v0.12.0-alpha        (needs gh; run after the release's two APKs are uploaded)
// The version and the APKs' urls, sha256 and sizes come from the GitHub release; the versionCode from app/build.gradle.
// Then deploy the site (npx wrangler deploy -c site/wrangler.toml) so the apps see it.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'unfoldingWord/bt-servant-mini'
const here = dirname(fileURLToPath(import.meta.url))
const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error('usage: node site/make-latest.mjs v0.12.0-alpha')
  process.exit(1)
}
const version = tag.match(/^v(\d+\.\d+\.\d+)/)[1]
const gradle = readFileSync(join(here, '..', 'app', 'build.gradle'), 'utf8')
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1])
const versionName = gradle.match(/versionName\s+'([^']+)'/)?.[1] ?? ''
if (!versionCode) throw new Error('no versionCode in app/build.gradle')
if (versionName.split('-')[0] !== version) throw new Error(`app/build.gradle says ${versionName}, the tag says ${version}: build the release first`)

const rel = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'assets,url'], { encoding: 'utf8' }))
const apks = rel.assets.filter((a) => a.name.endsWith('.apk'))
const pick = (lite) => {
  const a = apks.find((x) => x.name.endsWith('-lite.apk') === lite)
  if (!a) throw new Error(`no ${lite ? 'lite' : 'full'} APK in ${tag}`)
  const sha256 = String(a.digest ?? '').replace(/^sha256:/, '')
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`no sha256 for ${a.name}`)
  return { url: a.url, sha256, bytes: a.size }
}
const latest = { version, versionCode, notes_url: rel.url, full: pick(false), lite: pick(true) }
writeFileSync(join(here, 'latest.json'), JSON.stringify(latest, null, 2) + '\n')
console.log(`site/latest.json: ${version} (versionCode ${versionCode})`)
