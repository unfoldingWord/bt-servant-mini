// A self-test for CI (launch argument --selftest): it goes through the app as a person would, in the simulator, along the
// first use of 0.9.9 and later: it answers the safety question, asks with no language (the question is kept and the language
// picker shows in the chat), downloads English from the picker (the kept question is then answered by itself), downloads the
// reading model from the line offered after the first language, and asks a free question (the model reads it, the pack
// answers). Each step goes to Documents/selftest.json, which CI reads from the simulator; the last step is "done" or "error".
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
        log('bridge', [typeof window.Android, window.Android.platform(), window.Android.status(), window.Android.version(), 'secure context: ' + window.isSecureContext, 'crypto.subtle: ' + !!(window.crypto && crypto.subtle)].join(' | '))
        // the safety question comes first (About no longer opens by itself)
        const safety = await until(() => document.querySelector('#safety'), 30000, 'the safety question')
        for (const b of [...safety.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'No')) b.click()
        await sleep(300)
        button(/^Continue$/, safety)?.click()
        await sleep(800)
        // with no language, the question is kept and the language picker shows in the chat
        log('no-language', await ask('Ruth 1:16'))
        const english = await until(() => button(/^English.*MB/), 60000, 'English in the language picker')
        english.click()
        await sleep(500)
        const t1 = Date.now()
        const go = await until(() => button(/^Download · English/), 10000, 'the download button')
        log('download', go.textContent.trim())
        go.click()
        await until(() => /English/.test(document.querySelector('#packs')?.textContent || ''), 10 * 60000, 'the English pack')
        log('pack', 'English added after ' + Math.round((Date.now() - t1) / 1000) + ' s')
        // the kept question is answered by itself (the "kept" message is replaced by the answer, so look for it, not a count)
        await until(() => [...document.querySelectorAll('.msg.bot:not(.pending)')].some((d) => /Ruth|1:16/.test(d.innerText)), 120000, 'the kept question answered')
        log('kept-answered', [...document.querySelectorAll('.msg.bot:not(.pending)')].at(-1).innerText.slice(0, 600))
        // the reading model, from the line offered after the first language
        const t0 = Date.now()
        const model = await until(() => button(/^Download the model$/), 60000, 'the model line')
        model.click()
        await until(() => /^(ready|error)/.test(window.Android.status()), 20 * 60000, 'the model')
        log('model', window.Android.status() + ' after ' + Math.round((Date.now() - t0) / 1000) + ' s')
        if (!/^ready/.test(window.Android.status())) throw new Error('model: ' + window.Android.status())
        log('question', await ask('Where was Jonah swallowed by the fish?'))
        log('reference', await ask('Ruth 1:16'))
        log('done', 'ok')
      } catch (e) {
        log('error', (e && e.stack) || String(e))
      }
    })()
    """
}
