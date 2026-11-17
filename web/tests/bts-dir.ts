// The checkout of bt-synergy the app is built and tested with (web/tsconfig.json paths, build.py's BTS): bt-synergy at the
// commit in bt-synergy.ref. Not a test file, so a test can import it without running another file's tests.
// ../bts-client3 while ms/obsimg-v3 is a branch (../bts-client2 is shared by the other Mini worktrees, still at the older
// ref); back to ../bts-client2 in the merge that moves it to this ref.
import { resolve } from 'node:path'

export const BTS_DIR = resolve(import.meta.dir, '../../../bts-client3')
