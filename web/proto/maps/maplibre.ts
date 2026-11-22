// Variant (b): MapLibre GL JS 4.x with an inline style (no network): GeoJSON sources built from the same decoded
// basemap, an image source for the relief, native circle/line layers. No glyphs/sprite: labels are HTML (see notes).
import maplibregl from 'maplibre-gl/dist/maplibre-gl.js'
import 'maplibre-gl/dist/maplibre-gl.css'
import { type Api, type Cand, type Ctx, type Dot, type Path, BBOX, LabelLayer, css, fit, mount, placeLabels } from './common'

const ring = (p: Path) => { const r: number[][] = []; for (let i = 0; i < p.lon.length; i++) r.push([p.lon[i], p.lat[i]]); if (p.layer < 3) r.push(r[0]); return r }
const fc = (features: any[]) => ({ type: 'FeatureCollection', features })

mount('maplibre', async (c: Ctx): Promise<Api> => {
  const col = css
  const v0 = fit(c.scene.pts, c.w, c.h)
  const cluster = c.scene.pts.length > 200
  const landF = c.paths.filter(p => p.layer === 1).map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(p)] } }))
  const lakeF = c.paths.filter(p => p.layer === 2).map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(p)] } }))
  const rivF = c.paths.filter(p => p.layer === 3).map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(p) } }))
  const ptsF = c.scene.pts.map(p => ({ type: 'Feature', properties: { kind: p.n ? 4 : p.ref ? 2 : p.main ? 1 : 0, hollow: p.hollow ? 1 : 0, v: p.v, name: p[c.lang] }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))
  const routeF = c.scene.route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c.scene.pts.map(p => [p.lon, p.lat]) } }] : []
  const layers: any[] = [
    { id: 'bg', type: 'background', paint: { 'background-color': col('--sea') } },
    { id: 'glow', type: 'line', source: 'land', paint: { 'line-color': col('--shore'), 'line-width': 6, 'line-opacity': .55, 'line-blur': 2 } },
    { id: 'shadow', type: 'fill', source: 'land', paint: { 'fill-color': 'rgba(0,0,0,.14)', 'fill-translate': [0, 1.6] } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': col('--land') } },
  ]
  if (c.relief) layers.push({ id: 'relief', type: 'raster', source: 'relief', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } })
  layers.push(
    { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': col('--sea') } },
    { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': col('--coast'), 'line-width': 1.1 } },
    { id: 'lakeedge', type: 'line', source: 'lakes', paint: { 'line-color': col('--coast'), 'line-width': .9 } },
    { id: 'rivers', type: 'line', source: 'rivers', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': col('--river'), 'line-width': 1.7 } },
  )
  if (c.scene.route) layers.push({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': col('--line'), 'line-width': 2.2, 'line-dasharray': [3, 2.3] } })
  const single = ['!', ['has', 'point_count']]
  layers.push(
    { id: 'clusters', type: 'circle', source: 'pts', filter: ['has', 'point_count'], paint: { 'circle-color': col('--dot'), 'circle-radius': 14, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    { id: 'solid', type: 'circle', source: 'pts', filter: ['all', single, ['!=', ['get', 'hollow'], 1]], paint: {
      'circle-color': ['match', ['get', 'kind'], 4, col('--line'), 2, col('--ref'), col('--dot')],
      'circle-radius': ['match', ['get', 'kind'], 4, 9, 1, 7, 5], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    { id: 'hollow', type: 'circle', source: 'pts', filter: ['all', single, ['==', ['get', 'hollow'], 1]], paint: {
      'circle-color': col('--land'), 'circle-radius': ['match', ['get', 'kind'], 4, 9, 5], 'circle-stroke-color': ['match', ['get', 'kind'], 4, col('--line'), col('--dot')], 'circle-stroke-width': 2 } },
  )
  const style: any = {
    version: 8,
    sources: {
      land: { type: 'geojson', data: fc(landF) }, lakes: { type: 'geojson', data: fc(lakeF) }, rivers: { type: 'geojson', data: fc(rivF) },
      route: { type: 'geojson', data: fc(routeF) }, pts: { type: 'geojson', data: fc(ptsF), cluster, clusterRadius: 44, clusterMaxZoom: 14 },
      ...(c.relief ? { relief: { type: 'image', url: c.reliefUrl, coordinates: [[BBOX.w, BBOX.n], [BBOX.e, BBOX.n], [BBOX.e, BBOX.s], [BBOX.w, BBOX.s]] } } : {}),
    },
    layers,
  }
  const zoomFor = (k: number, lat0: number) => Math.log2(k * Math.cos(lat0 * Math.PI / 180) * 360 / 512)
  const map = new maplibregl.Map({
    container: c.box, style, center: [v0.lon0, v0.lat0], zoom: zoomFor(v0.k, v0.lat0), interactive: false, attributionControl: false,
    fadeDuration: 0, pixelRatio: Math.min(devicePixelRatio || 1, 2), renderWorldCopies: false, trackResize: false,
  })
  const labels = new LabelLayer(c.box)
  const side: 1 | -1 = c.lang === 'ar' ? -1 : 1
  const refresh = () => {
    const dots: Dot[] = [], cand: Cand[] = []
    if (cluster) {
      const seen = new Set<string>()
      for (const f of map.querySourceFeatures('pts') as any[]) {
        const [lo, la] = f.geometry.coordinates, key = lo.toFixed(5) + ',' + la.toFixed(5)
        if (seen.has(key)) continue; seen.add(key)
        const { x, y } = map.project([lo, la])
        if (x < -20 || y < -20 || x > c.w + 20 || y > c.h + 20) continue
        if (f.properties.cluster) dots.push({ x, y, cluster: f.properties.point_count })
        else { dots.push({ x, y }); cand.push({ x, y, text: f.properties.name, v: f.properties.v, r: 5 }) }
      }
    } else for (const p of c.scene.pts) {
      const { x, y } = map.project([p.lon, p.lat])
      dots.push({ x, y, num: p.n, hollow: p.hollow }); cand.push({ x, y, text: p[c.lang], v: p.main ? 1e9 : p.v, main: p.main, r: p.n ? 11 : p.main ? 7 : 5 })
    }
    labels.set(dots, placeLabels(cand, side, c.w, c.h)); labels.offset(0, 0); labels.root.style.opacity = '1'
  }
  await new Promise(r => map.once('load', r))
  const idle = () => new Promise<void>(r => { map.once('idle', () => r()); map.triggerRepaint() })
  await idle(); refresh()
  let ox = 0, oy = 0
  return {
    panBy: (dx, dy) => { map.panBy([-dx, -dy], { animate: false }); ox += dx; oy += dy; labels.offset(ox, oy) },
    zoomAt: (f, x, y) => { labels.root.style.opacity = '0'; map.jumpTo({ zoom: map.getZoom() + Math.log2(f), around: map.unproject([x, y]) }) },
    commit: () => { ox = oy = 0; setTimeout(refresh, 0) },
    frame: () => { map.jumpTo({ center: [v0.lon0, v0.lat0], zoom: zoomFor(v0.k, v0.lat0) }); ox = oy = 0; idle().then(refresh) },
    settle: async () => { await idle(); refresh() },
  }
})
