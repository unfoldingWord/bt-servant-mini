// Time per keystroke, measured so that a busy machine does not fail the build (build.py runs these tests on every build): one
// warm-up pass (JIT, regexes, caches), then `runs` passes of `rounds` rounds over the calls; each pass gives its median and its
// slowest 5 %, and the best of the passes counts. Another program on the machine slows a pass; slow code slows all of them.

export type Timing = { p50: number; p95: number; passes: { p50: number; p95: number; max: number }[]; calls: number }

/** `calls`: one function per keystroke (each sets what it needs, env.nav too). */
export function keystrokes(calls: (() => unknown)[], rounds = 20, runs = 3): Timing {
  for (const f of calls) f()
  const passes: Timing['passes'] = []
  for (let r = 0; r < runs; r++) {
    const times: number[] = []
    for (let k = 0; k < rounds; k++)
      for (const f of calls) {
        const t0 = performance.now()
        f()
        times.push(performance.now() - t0)
      }
    times.sort((a, b) => a - b)
    passes.push({ p50: times[times.length >> 1]!, p95: times[Math.floor(times.length * 0.95)]!, max: times[times.length - 1]! })
  }
  return { p50: Math.min(...passes.map((p) => p.p50)), p95: Math.min(...passes.map((p) => p.p95)), passes, calls: rounds * calls.length }
}
/** "median 0.61 ms, p95 1.90 ms (best of 3 passes of 320 calls; p95 per pass 1.90, 2.40, 14.20)" */
export const timingLine = (t: Timing): string =>
  `median ${t.p50.toFixed(2)} ms, p95 ${t.p95.toFixed(2)} ms (best of ${t.passes.length} passes of ${t.calls} calls; p95 per pass ${t.passes.map((p) => p.p95.toFixed(2)).join(', ')})`
