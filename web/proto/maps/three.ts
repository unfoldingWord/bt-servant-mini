// Variant (a): three.js (WebGL). Land/lakes triangulated in the browser (earcut inside three), thick strokes as
// vertex-shader quads, hillshade sampled in the land fragment shader, dots as shader points, labels as HTML.
import {
  BufferAttribute, BufferGeometry, ColorManagement, Color, LinearSRGBColorSpace, Mesh, OrthographicCamera, Points,
  Scene as TScene, ShaderMaterial, ShapeUtils, TextureLoader, Vector2, WebGLRenderer, DoubleSide,
} from 'three'
import { type Api, type Ctx, type Path, BBOX, LabelLayer, css, fit, layout, mount, unpx } from './common'

ColorManagement.enabled = false

mount('three', async (c: Ctx): Promise<Api> => {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' })
  renderer.outputColorSpace = LinearSRGBColorSpace
  renderer.setPixelRatio(dpr); renderer.setSize(c.w, c.h)
  renderer.domElement.setAttribute('role', 'img'); renderer.domElement.setAttribute('aria-label', c.scene.aria[c.lang])
  c.box.appendChild(renderer.domElement)
  const labels = new LabelLayer(c.box)
  const col = (n: string) => new Color(css(n))
  renderer.setClearColor(col('--sea'))
  let v = fit(c.scene.pts, c.w, c.h)
  const cosK = v.cos
  const X = (lon: number) => lon * cosK
  const scene = new TScene()
  const cam = new OrthographicCamera(-1, 1, 1, -1, -1, 1)
  const place = () => {
    cam.left = -c.w / 2 / v.k; cam.right = c.w / 2 / v.k; cam.top = c.h / 2 / v.k; cam.bottom = -c.h / 2 / v.k
    cam.position.set(X(v.lon0), v.lat0, 0); cam.updateProjectionMatrix()
    for (const u of widths) u.value = 1 / v.k // 1 px in world units
    for (const u of kks) u.value = v.k
    if (shadow) shadow.position.y = -1.6 / v.k
  }
  const widths: { value: number }[] = [], kks: { value: number }[] = []
  let shadow: Mesh

  // ---- fills: triangulate each ring ----
  function fillGeo(ps: Path[]) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    for (const p of ps) {
      const n = p.lon.length, base = pos.length / 3, ring: Vector2[] = []
      for (let i = 0; i < n; i++) { ring.push(new Vector2(X(p.lon[i]), p.lat[i])); pos.push(X(p.lon[i]), p.lat[i], 0); uv.push((p.lon[i] - BBOX.w) / (BBOX.e - BBOX.w), (BBOX.n - p.lat[i]) / (BBOX.n - BBOX.s)) }
      for (const f of ShapeUtils.triangulateShape(ring, [])) idx.push(base + f[0], base + f[1], base + f[2])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.setIndex(idx); return g
  }
  // ---- strokes: 2 vertices per point, offset in the vertex shader by a width in px ----
  function strokeGeo(ps: Path[]) {
    const pos: number[] = [], nrm: number[] = [], side: number[] = [], dist: number[] = [], idx: number[] = []
    for (const p of ps) {
      const n = p.lon.length, closed = p.layer < 3, base = pos.length / 3
      const xs = Array.from(p.lon, X), ys = Array.from(p.lat)
      let d = 0
      for (let i = 0; i < n; i++) {
        const a = closed ? (i + n - 1) % n : Math.max(i - 1, 0), b = closed ? (i + 1) % n : Math.min(i + 1, n - 1)
        let tx = xs[b] - xs[i], ty = ys[b] - ys[i], ux = xs[i] - xs[a], uy = ys[i] - ys[a]
        const l1 = Math.hypot(tx, ty) || 1, l0 = Math.hypot(ux, uy) || 1
        tx /= l1; ty /= l1; ux /= l0; uy /= l0
        let mx = tx + ux, my = ty + uy; const lm = Math.hypot(mx, my) || 1; mx /= lm; my /= lm
        const nx = -my, ny = mx, miter = Math.min(1 / Math.max(Math.abs(nx * -ty + ny * tx), .5), 2)
        if (i) d += l0
        for (const s of [-1, 1]) { pos.push(xs[i], ys[i], 0); nrm.push(nx * miter, ny * miter); side.push(s); dist.push(d) }
      }
      const m = closed ? n : n - 1
      for (let i = 0; i < m; i++) { const j = (i + 1) % n, a = base + i * 2, b = base + j * 2; idx.push(a, a + 1, b, a + 1, b + 1, b) }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('nrm', new BufferAttribute(new Float32Array(nrm), 2))
    g.setAttribute('side', new BufferAttribute(new Float32Array(side), 1)); g.setAttribute('dist', new BufferAttribute(new Float32Array(dist), 1))
    g.setIndex(idx); return g
  }
  const strokeMat = (color: Color, px: number, opacity = 1, dash = 0) => {
    const w = { value: 1 / v.k }, kk = { value: v.k }; widths.push(w); kks.push(kk)
    return new ShaderMaterial({
      transparent: opacity < 1 || dash > 0, depthTest: false, depthWrite: false, side: DoubleSide,
      uniforms: { hw: w, color: { value: color }, op: { value: opacity }, hf: { value: px / 2 }, dash: { value: dash }, kk },
      vertexShader: 'attribute vec2 nrm;attribute float side;attribute float dist;uniform float hw;uniform float hf;varying float vd;void main(){vec2 p=position.xy+nrm*side*hw*hf;vd=dist;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,0.,1.);}',
      fragmentShader: 'uniform vec3 color;uniform float op;uniform float dash;uniform float kk;varying float vd;void main(){if(dash>0.&&fract(vd*kk/dash)>.58)discard;gl_FragColor=vec4(color,op);}',
    })
  }
  const add = (m: Mesh | Points, order: number) => { (m.material as ShaderMaterial).transparent = true; m.renderOrder = order; m.frustumCulled = false; scene.add(m); return m }

  const land = c.paths.filter(p => p.layer === 1), lakes = c.paths.filter(p => p.layer === 2), rivers = c.paths.filter(p => p.layer === 3)
  const tm0 = performance.now()
  const landG = fillGeo(land), landS = strokeGeo(land)
  const marks: Record<string, number> = ((window as any).__marks = { tri_ms: Math.round(performance.now() - tm0) })
  const relief = c.relief ? await new TextureLoader().loadAsync(c.reliefUrl) : null
  if (relief) relief.flipY = false
  add(new Mesh(landS, strokeMat(col('--shore'), 6, .55)), 1)
  shadow = add(new Mesh(landG, new ShaderMaterial({ transparent: true, depthTest: false, uniforms: {}, vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'void main(){gl_FragColor=vec4(0.,0.,0.,.14);}' })), 2) as Mesh
  add(new Mesh(landG, new ShaderMaterial({
    depthTest: false, uniforms: { land: { value: col('--land') }, tex: { value: relief }, on: { value: relief ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 land;uniform sampler2D tex;uniform float on;varying vec2 vUv;void main(){float a=on>0.?texture2D(tex,vUv).a:0.;gl_FragColor=vec4(mix(land,vec3(0.,0.,0.),a),1.);}',
  })), 3)
  add(new Mesh(landS, strokeMat(col('--coast'), 1.1)), 4)
  if (lakes.length) {
    add(new Mesh(fillGeo(lakes), new ShaderMaterial({ depthTest: false, uniforms: { color: { value: col('--sea') } }, vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 color;void main(){gl_FragColor=vec4(color,1.);}' })), 5)
    add(new Mesh(strokeGeo(lakes), strokeMat(col('--coast'), .9)), 6)
  }
  if (rivers.length) add(new Mesh(strokeGeo(rivers), strokeMat(col('--river'), 1.7)), 7)
  // dashed route (stops in order, straight lines) rebuilt from the scene once: world units, so it never changes
  if (c.scene.route) {
    const r: Path = { layer: 3, lon: Float32Array.from(c.scene.pts, p => p.lon), lat: Float32Array.from(c.scene.pts, p => p.lat) }
    add(new Mesh(strokeGeo([r]), strokeMat(col('--line'), 2.2, 1, 12)), 8)
  }
  // dots
  const dotMat = new ShaderMaterial({
    transparent: true, depthTest: false,
    uniforms: { dpr: { value: dpr }, dot: { value: col('--dot') }, ref: { value: col('--ref') }, line: { value: col('--line') }, land: { value: col('--land') } },
    vertexShader: 'attribute float kind;attribute float hol;varying float vk;varying float vh;uniform float dpr;void main(){vk=kind;vh=hol;float s=kind>2.5?(kind>3.5?20.:30.):(kind>.5&&kind<1.5?16.:12.);gl_PointSize=s*dpr;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 dot;uniform vec3 ref;uniform vec3 line;uniform vec3 land;varying float vk;varying float vh;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 f=vk>3.5?line:(vk>1.5&&vk<2.5?ref:dot);float e=1.-smoothstep(.92,1.,d);vec3 c;if(vh>.5){c=d>.6?f:land;}else{c=d>.78?vec3(1.):f;}gl_FragColor=vec4(c,e);}',
  })
  let dots: Points | null = null
  const refreshDots = () => {
    const lay = layout(c.scene, v, c.lang)
    const pos: number[] = [], kind: number[] = [], hol: number[] = []
    for (const d of lay.dots) {
      const [lon, lat] = unpx(v, d.x, d.y); pos.push(X(lon), lat, 0)
      kind.push(d.cluster ? 3 : d.num ? 4 : d.ref ? 2 : d.main ? 1 : 0); hol.push(d.hollow ? 1 : 0)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('kind', new BufferAttribute(new Float32Array(kind), 1)); g.setAttribute('hol', new BufferAttribute(new Float32Array(hol), 1))
    if (dots) { scene.remove(dots); dots.geometry.dispose() }
    dots = add(new Points(g, dotMat), 9) as Points
    labels.set(lay.dots, lay.labels); labels.offset(0, 0); labels.root.style.opacity = '1'
  }
  const tg = performance.now()
  place(); refreshDots(); renderer.render(scene, cam); marks.firstGL_ms = Math.round(performance.now() - tg)
  let ox = 0, oy = 0
  const render = () => renderer.render(scene, cam)
  return {
    panBy: (dx, dy) => { v.lon0 -= dx / (v.cos * v.k); v.lat0 += dy / v.k; ox += dx; oy += dy; place(); labels.offset(ox, oy); render() },
    zoomAt: (f, x, y) => {
      const [lon, lat] = unpx(v, x, y); v.k *= f
      v.lon0 = lon - (x - c.w / 2) / (v.cos * v.k); v.lat0 = lat + (y - c.h / 2) / v.k
      labels.root.style.opacity = '0'; place(); render()
    },
    commit: () => { ox = oy = 0; refreshDots(); render() },
    frame: () => { v = fit(c.scene.pts, c.w, c.h); ox = oy = 0; place(); refreshDots(); render() },
    settle: async () => {},
  }
})
