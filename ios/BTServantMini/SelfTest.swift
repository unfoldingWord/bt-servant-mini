// A self-test for CI (launch argument --selftest): it goes through the app as a person would, in the simulator. It downloads
// the model from About, answers the safety question, asks with no language (expects the "no language yet" answer), adds
// English from the server, and asks a free question (the model reads it, the pack answers). Each step goes to
// Documents/selftest.json, which CI reads from the simulator; the last step is "done" or "error".
import Foundation

enum SelfTest {
    static let enabled = ProcessInfo.processInfo.arguments.contains("--selftest")
    private static var steps: [[String: String]] = []

    static var file: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("selftest.json")
    }

    static func record(step: String, data: String) {
        steps.append(["step": step, "data": data, "at": ISO8601DateFormatter().string(from: Date())])
        NSLog("SELFTEST %@: %@", step, data)
        if let out = try? JSONSerialization.data(withJSONObject: steps, options: [.prettyPrinted]) { try? out.write(to: file) }
    }

    static let script = """
    (async () => {
      const log = (step, data) => window.webkit.messageHandlers.\(Bridge.handler).postMessage({ op: 'selftest', step, data: String(data ?? '') })
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const until = async (f, ms, what) => {
        const t0 = Date.now()
        while (Date.now() - t0 < ms) { try { const v = f(); if (v) return v } catch {} await sleep(500) }
        throw new Error('timeout: ' + what)
      }
      const button = (re, root) => [...(root || document).querySelectorAll('button')].find((b) => re.test(b.textContent.trim()))
      const ask = async (q) => {
        const n = document.querySelectorAll('.msg.bot:not(.pending)').length
        const i = document.querySelector('#q')
        i.value = q
        i.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('#send').disabled = false
        document.querySelector('#send').click()
        await until(() => document.querySelectorAll('.msg.bot:not(.pending)').length > n, 180000, 'answer to ' + q)
        await sleep(800)
        const d = [...document.querySelectorAll('.msg.bot:not(.pending)')].at(-1)
        d.querySelectorAll('details').forEach((x) => (x.open = true))
        return d.innerText.slice(0, 1500)
      }
      try {
        log('bridge', [typeof window.Android, window.Android.platform(), window.Android.status(), window.Android.version()].join(' | '))
        const about = await until(() => document.querySelector('#about'), 30000, 'About on first launch')
        const t0 = Date.now()
        const dl = button(/^Download \\(/, about)
        if (dl) { dl.click(); log('download', dl.textContent.trim()) }
        await until(() => /^(ready|error)/.test(window.Android.status()), 20 * 60000, 'the model')
        log('model', window.Android.status() + ' after ' + Math.round((Date.now() - t0) / 1000) + ' s')
        button(/^(Start|Close)$/, document.querySelector('#about'))?.click()
        await sleep(800)
        const safety = document.querySelector('#safety')
        if (safety) {
          for (const b of [...safety.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'No')) b.click()
          button(/^Continue$/, safety)?.click()
          await sleep(500)
        }
        log('no-language', await ask('Ruth 1:16'))
        document.querySelector('#menu').click()
        await sleep(500)
        button(/Languages on this phone/)?.click()
        await sleep(500)
        button(/^Look on the server/)?.click()
        const english = await until(() => [...document.querySelectorAll('#panel .row')].find((r) => /^English/.test(r.textContent.trim())), 60000, 'the server list')
        const t1 = Date.now()
        button(/^Download$/, english).click()
        await until(() => /English/.test(document.querySelector('#packs')?.textContent || ''), 10 * 60000, 'the English pack')
        log('pack', 'English added after ' + Math.round((Date.now() - t1) / 1000) + ' s')
        document.querySelector('#panel').classList.remove('show')
        await sleep(500)
        log('question', await ask('Where was Jonah swallowed by the fish?'))
        log('reference', await ask('Ruth 1:16'))
        log('done', 'ok')
      } catch (e) {
        log('error', (e && e.stack) || String(e))
      }
    })()
    """
}
