// node build.mjs  -> dist/ (bundles via bun build --minify, sizes.json with raw / gzip / brotli per file)
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { gzipSync, brotliCompressSync } from 'node:zlib'
rmSync('dist', { recursive: true, force: true }); mkdirSync('dist/data', { recursive: true })
const sizes = {}
for (const v of ['base', 'svg', 'three', 'maplibre']) {
  execSync(`bun build ${v}.ts --minify --target browser --outdir dist`, { stdio: 'inherit' })
  cpSync(`${v}.html`, `dist/${v}.html`)
}
cpSync('style.css', 'dist/style.css'); cpSync('data', 'dist/data', { recursive: true })
for (const f of readdirSync('dist')) if (/\.(js|css)$/.test(f)) {
  const b = readFileSync('dist/' + f)
  sizes[f] = { raw: b.length, gzip: gzipSync(b, { level: 9 }).length, br: brotliCompressSync(b).length }
}
writeFileSync('dist/sizes.json', JSON.stringify(sizes, null, 1)); console.log(sizes)
