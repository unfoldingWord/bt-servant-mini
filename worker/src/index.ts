// BT Servant Mini — online helper (level 3). POST /v1/answer { question, lang, helps, history? } -> { text, model }.
// The app sends the question and the translation helps it already found on the phone; the model answers from them only,
// in the person's language, and names its sources. It does not search, keep anything, or see other conversations.

export interface Env {
  AI: { run(model: string, input: unknown): Promise<any> }
  MODEL: string
  MAX_CONTEXT: string
}

const LANGS: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic' }
const CORS = {
  'Access-Control-Allow-Origin': '*', // the app's pages come from https://appassets.androidplatform.net; nothing here is private
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

function system(lang: string): string {
  const name = LANGS[lang] ?? 'the language of the question'
  return [
    'You are BT Servant, a warm and careful assistant for Bible translators, answering inside the BT Servant Mini app.',
    `Answer in ${name}.`,
    'Use ONLY the translation helps given below (Bible texts, translation notes, comprehension questions, key terms, articles).',
    'Explain and paraphrase them simply so a translator can act on them; when you give a suggestion, base it on a note or an article.',
    'Name the resource you use (for example: the ULT, a translation note, the Translation Words article "grace").',
    'If the helps do not answer the question, say so in one sentence and suggest how to ask (a reference, a word, a phrase in quotes).',
    'Never invent verses, notes, numbers or facts that are not in the helps. Do not preach.',
    'Be brief: at most about 180 words. Use short paragraphs or a short list; you may use **bold** for key words.',
  ].join(' ')
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (url.pathname === '/health') return json({ ok: true, model: env.MODEL })
    if (url.pathname !== '/v1/answer' || req.method !== 'POST') return json({ error: 'not found' }, 404)

    let body: { question?: unknown; lang?: unknown; helps?: unknown; history?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'bad json' }, 400)
    }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 600) : ''
    const lang = typeof body.lang === 'string' ? body.lang : 'en'
    const max = Number(env.MAX_CONTEXT) || 7000
    const helps = typeof body.helps === 'string' ? body.helps.slice(0, max) : ''
    if (!question) return json({ error: 'no question' }, 400)

    const history = Array.isArray(body.history)
      ? (body.history as { role?: string; text?: string }[])
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
          .slice(-4)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text!.slice(0, 800) }))
      : []
    const messages = [
      { role: 'system', content: system(lang) },
      ...history,
      { role: 'user', content: `Question: ${question}\n\nTranslation helps found on the phone:\n${helps || '(none found)'}` },
    ]
    try {
      const out = await env.AI.run(env.MODEL, { messages, max_tokens: 450, temperature: 0.3 })
      const text = String(out?.response ?? '').trim()
      if (!text) return json({ error: 'empty answer' }, 502)
      return json({ text, model: env.MODEL })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502)
    }
  },
}
