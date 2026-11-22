// Variant (c): drawMap = DOM-free function that returns SVG text (as designed in diseno-mapas 5.6),
// pan/zoom by CSS transform, full redraw at gesture end. Styled to get close to a Google-Maps look.
import { type Api, type Ctx, type Lang, type Path, type Scene, type View, BBOX, esc, fit, layout, mount, px, unpx } from './common'

export function drawMap(paths: Path[], scene: Scene, v: View, lang: Lang, o: { margin: number; reliefUrl?: string }): string {
  const m = o.margin, W = v.w + 2 * m, H = v.h + 2 * m
  const d = { 1: '', 2: '', 3: '' } as Record<number, string>
  for (const p of paths) {
    // cull: path bbox against the (margin) frame
    let a = 1e9, b = -1e9, c = 1e9, e = -1e9
    for (let i = 0; i < p.lon.length; i++) { const l = p.lon[i], t = p.lat[i]; if (l < a) a = l; if (l > b) b = l; if (t < c) c = t; if (t > e) e = t }
    const [x0, y1] = px(v, a, c), [x1, y0] = px(v, b, e)
    if (x1 < -m || x0 > v.w + m || y1 < -m || y0 > v.h + m) continue
    let s = '', lx = 1e9, ly = 1e9, n = 0
    for (let i = 0; i < p.lon.length; i++) {
      const [x, y] = px(v, p.lon[i], p.lat[i])
      if (Math.abs(x - lx) + Math.abs(y - ly) < 0.8 && i < p.lon.length - 1) continue // simplify to the scale
      s += (n++ ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); lx = x; ly = y
    }
    d[p.layer] += s + (p.layer < 3 ? 'Z' : '')
  }
  const L = layout(scene, v, lang, m)
  let out = `<svg xmlns="http://www.w3.org/2000/svg" role="img" lang="${lang}" aria-label="${esc(scene.aria[lang])}" width="${W}" height="${H}" viewBox="${-m} ${-m} ${W} ${H}" direction="${lang === 'ar' ? 'rtl' : 'ltr'}" font-family="system-ui,sans-serif" font-size="12">`
  out += `<rect x="${-m}" y="${-m}" width="${W}" height="${H}" fill="var(--sea)"/>`
  if (d[1]) {
    out += `<path d="${d[1]}" fill="none" stroke="var(--shore)" stroke-width="6" stroke-linejoin="round" opacity=".55"/>` // soft glow on the sea side
    out += `<path d="${d[1]}" fill="rgba(0,0,0,.14)" transform="translate(0 1.6)"/>`                                        // cheap drop shadow
    out += `<path d="${d[1]}" fill="var(--land)" stroke="var(--coast)" stroke-width="1" stroke-linejoin="round"/>`
  }
  if (o.reliefUrl) {
    const [x0, y0] = px(v, BBOX.w, BBOX.n), [x1, y1] = px(v, BBOX.e, BBOX.s)
    out += `<image href="${esc(o.reliefUrl)}" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" preserveAspectRatio="none"/>`
  }
  if (d[2]) out += `<path d="${d[2]}" fill="var(--sea)" stroke="var(--coast)" stroke-width=".8"/>`
  if (d[3]) out += `<path d="${d[3]}" fill="none" stroke="var(--river)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
  if (L.line.length) out += `<polyline points="${L.line.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--line)" stroke-width="2.2" stroke-dasharray="7 5" stroke-linecap="round"/>`
  for (const k of L.dots) {
    const x = k.x.toFixed(1), y = k.y.toFixed(1)
    if (k.cluster) out += `<circle cx="${x}" cy="${y}" r="14" fill="var(--dot)" stroke="#fff" stroke-width="2"/><text x="${x}" y="${(k.y + 4).toFixed(1)}" text-anchor="middle" fill="#fff" font-weight="600">${esc(k.cluster)}</text>`
    else if (k.num) out += `<circle cx="${x}" cy="${y}" r="9" fill="${k.hollow ? 'var(--land)' : 'var(--line)'}" stroke="${k.hollow ? 'var(--line)' : '#fff'}" stroke-width="2"/><text x="${x}" y="${(k.y + 4).toFixed(1)}" text-anchor="middle" fill="${k.hollow ? 'var(--label)' : '#fff'}" font-size="11" font-weight="600">${esc(k.num)}</text>`
    else if (k.hollow) out += `<circle cx="${x}" cy="${y}" r="5" fill="var(--land)" stroke="var(--dot)" stroke-width="2"/>`
    else out += `<circle cx="${x}" cy="${y}" r="${k.main ? 7 : 5}" fill="${k.ref ? 'var(--ref)' : 'var(--dot)'}" stroke="#fff" stroke-width="2"/>`
  }
  for (const l of L.labels) out += `<text x="${l.x.toFixed(1)}" y="${(l.y + 4).toFixed(1)}" text-anchor="start" fill="var(--label)" stroke="var(--halo)" stroke-width="3" paint-order="stroke" stroke-linejoin="round"${l.main ? ' font-weight="600"' : ''}>${esc(l.text)}</text>`
  return out + '</svg>'
}

const K_MIN = 25, K_MAX = 4000 // px per degree of latitude: whole basemap (~21 deg) down to ~city scale
mount('svg', async (c: Ctx): Promise<Api> => {
  const m = Math.round(c.w / 2) // margin: render 2x the viewport so panning is a pure CSS transform
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform'
  c.box.appendChild(wrap)
  let v = fit(c.scene.pts, c.w, c.h), tx = -m, ty = -m, s = 1, tm: any
  if (c.relief) await new Promise(r => { const i = new Image(); i.onload = i.onerror = r as any; i.src = c.reliefUrl })
  const draw = () => { wrap.innerHTML = drawMap(c.paths, c.scene, v, c.lang, { margin: m, reliefUrl: c.relief ? c.reliefUrl : undefined }); tx = -m; ty = -m; s = 1; wrap.style.transform = `translate(${tx}px,${ty}px)` }
  draw()
  const put = () => (wrap.style.transform = `translate(${tx}px,${ty}px) scale(${s})`)
  const commit = () => {
    if (s === 1 && tx === -m && ty === -m) return
    const [lon, lat] = unpx(v, (c.w / 2 - tx) / s - m, (c.h / 2 - ty) / s - m)
    v = { ...v, lon0: lon, lat0: lat, k: v.k * s }; draw()
  }
  return {
    panBy: (dx, dy) => { tx += dx; ty += dy; put() },
    zoomAt: (f, x, y) => { f = Math.min(Math.max(f, K_MIN / (v.k * s)), K_MAX / (v.k * s)); tx = x - (x - tx) * f; ty = y - (y - ty) * f; s *= f; put(); clearTimeout(tm) },
    commit,
    frame: () => { v = fit(c.scene.pts, c.w, c.h); draw() },
    settle: async () => {},
  }
})
