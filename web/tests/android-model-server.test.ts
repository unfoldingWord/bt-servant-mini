import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

// Java has no unit tests here: this guards what 0.13.0 added after «Modelo: Problema: server stopped: 1»
// (Nov 18: the model download had stopped halfway, so llama-server exited 1 with no clue).
const java = readFileSync(new URL('../../app/src/main/java/org/unfoldingword/btservantmini/MainActivity.java', import.meta.url), 'utf8')

describe('MainActivity says why the model did not start', () => {
  test('a file that is not a whole GGUF model is reported before llama-server is started', () => {
    expect(java).toMatch(/if \(!looksLikeModel\(model\)\) \{\s*state = "error";/)
    expect(java).toMatch(/h\[0\] == 'G' && h\[1\] == 'G' && h\[2\] == 'U' && h\[3\] == 'F'/)
  })
  test('when llama-server stops, the error carries the last line of its log', () => {
    expect(java).toMatch(/"server stopped: " \+ server\.exitValue\(\) \+ \(tail\.isEmpty/)
  })
})
