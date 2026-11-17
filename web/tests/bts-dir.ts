// The checkout of bt-synergy the app is built and tested with (web/tsconfig.json paths, build.py's BTS): bt-synergy at the
// commit in bt-synergy.ref. Not a test file, so a test can import it without running another file's tests.
import { fileURLToPath } from 'node:url'

export const BTS_DIR = fileURLToPath(new URL('../../../bts-client2', import.meta.url))
