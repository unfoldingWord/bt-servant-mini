// node serve.mjs [port] [results.jsonl]  - static server for dist/, POST /result appends a line to the results file
import { createServer } from 'node:http'
import { readFile, appendFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const port = +(process.argv[2] || 8123), out = process.argv[3] || 'results.jsonl'
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.bin': 'application/octet-stream', '.json': 'application/json' }
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (req.method === 'POST' && u.pathname === '/result') {
    let b = ''; for await (const c of req) b += c
    await appendFile(out, b + '\n'); res.end('ok'); return
  }
  try {
    const f = join('dist', normalize(u.pathname).replace(/^(\.\.[\/])+/, ''))
    const buf = await readFile(f); res.writeHead(200, { 'content-type': T[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf)
  } catch { res.writeHead(404); res.end('no') }
}).listen(port, '127.0.0.1', () => console.log('http://localhost:' + port))
