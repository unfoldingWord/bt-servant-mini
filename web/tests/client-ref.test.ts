// The language-pack client the app is built and tested with: bt-synergy at the commit in bt-synergy.ref, checked out in
// ../bts-client (web/tsconfig.json paths). The other tests mean nothing against another commit; build.py checks the same.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../..')
const BTS = resolve(ROOT, '../bts-client')

test('../bts-client is at bt-synergy.ref', () => {
  const ref = readFileSync(resolve(ROOT, 'bt-synergy.ref'), 'utf8').trim()
  const r = Bun.spawnSync(['git', '-C', BTS, 'rev-parse', 'HEAD'])
  const head = r.success ? r.stdout.toString().trim() : '(no git checkout there)'
  if (head !== ref)
    throw new Error(`${BTS} is at ${head}, not at bt-synergy.ref (${ref}). Fix: git -C <bt-synergy clone> worktree add --detach ${BTS} ${ref}` +
      ` (or git -C ${BTS} checkout --detach ${ref}), then bun install --frozen-lockfile --filter @bt-synergy/language-pack-client` +
      ` --filter @bt-synergy/language-pack-v3 in it`)
  expect(head).toBe(ref)
})
