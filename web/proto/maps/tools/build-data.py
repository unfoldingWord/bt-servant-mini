"""Build the prototype basemap + relief from Natural Earth 10m (public domain) and AWS terrain tiles.
usage: python -I -X utf8 build-data.py <raw_dir> <dem_dir> <pylib_dir> <out_dir>
Needs pyshp, shapely, numpy, pillow (pylib_dir holds pyshp+shapely).
Output layout follows basemap-v1 (diseno-mapas.md 3.2): layer / count / x / y with deltas, deflate-raw,
without the CBOR wrapper (about +60 bytes). scale = degrees * scale (100 for v1; 1000 for the fine level)."""
import sys, os, zlib, struct, math, json
raw, dem, pylib, out = sys.argv[1:5]
sys.path.insert(0, pylib)
import shapefile
from shapely.geometry import shape, box, Polygon, LineString
from shapely.ops import unary_union
import numpy as np
from PIL import Image

W, S, E, N = 8.0, 22.0, 52.0, 43.0
BB = box(W, S, E, N)
LAKES = {'Sea of Galilee', 'Dead Sea', 'Lake Van', 'Lake Urmia'}
RIVERS = {'Jordan', 'Nile', 'Rosetta Branch', 'Damietta Branch', 'Tigris', 'Dicle', 'Euphrates', 'Firat',
          'Al Furat', 'Shatt al-Arab', 'Ceyhan', 'Kızılırmak', 'Büyük Menderes', 'Murat'}

def read(name, keep=None):
    r = shapefile.Reader(f'{raw}/{name}/{name}')
    for sr in r.iterShapeRecords():
        d = sr.record.as_dict()
        if keep and d.get('name') not in keep: continue
        g = shape(sr.shape.__geo_interface__)
        g = g.intersection(BB)
        if not g.is_empty: yield g

def polys(g):
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for x in g.geoms for p in polys(x)]
    return []
def lines(g):
    if g.geom_type == 'LineString': return [g]
    if g.geom_type in ('MultiLineString', 'GeometryCollection'):
        return [l for x in g.geoms for l in lines(x)]
    return []

def varint(n):
    b = bytearray()
    while True:
        c = n & 0x7f; n >>= 7
        if n: b.append(c | 0x80)
        else: b.append(c); return bytes(b)
def zz(n): return (n << 1) ^ (n >> 63)

def build(tol, scale, minarea):
    paths = []  # (layer, pts)
    land = unary_union([p for g in read('ne_10m_land') for p in polys(g)])
    for p in polys(land):
        if p.area < minarea: continue
        s = p.simplify(tol, preserve_topology=True)
        for q in polys(s):
            paths.append((1, list(q.exterior.coords)[:-1]))   # holes of land (inland seas) skipped; lakes layer covers
    for g in read('ne_10m_lakes', LAKES):
        for p in polys(g):
            s = p.simplify(tol, preserve_topology=True)
            for q in polys(s): paths.append((2, list(q.exterior.coords)[:-1]))
    for g in read('ne_10m_rivers_lake_centerlines', RIVERS):
        for l in lines(g):
            s = l.simplify(tol, preserve_topology=False)
            if len(s.coords) >= 2: paths.append((3, list(s.coords)))
    layer = bytearray(); count = bytearray(); xs = []; ys = []
    for ly, pts in paths:
        q = [(round(x * scale), round(y * scale)) for x, y in pts]
        d = [q[0]] + [q[i] for i in range(1, len(q)) if q[i] != q[i-1]]
        if len(d) < (3 if ly < 3 else 2): continue
        layer += varint(ly); count += varint(len(d))
        xs += [p[0] for p in d]; ys += [p[1] for p in d]
    def deltas(v):
        b = bytearray(); prev = 0
        for a in v: b += varint(zz(a - prev)); prev = a
        return bytes(b)
    body = struct.pack('<4i', *[round(c * scale) for c in (W, S, E, N)]) + b''.join(
        struct.pack('<I', len(s)) + bytes(s) for s in (layer, count, deltas(xs), deltas(ys)))
    c = zlib.compressobj(9, zlib.DEFLATED, -15); z = c.compress(body) + c.flush()
    return z, len(paths), len(xs)

for name, tol, scale, ma in (('basemap', 0.015, 100, 0.0003), ('basemap-fine', 0.005, 1000, 0.00005)):
    z, np_, npts = build(tol, scale, ma)
    open(f'{out}/{name}.bin', 'wb').write(z)
    print(name, 'bytes', len(z), 'paths', np_, 'points', npts)

# relief: stitch terrarium tiles z5 x16..21 y10..14, shadow-only RGBA
Z = 5; X0, X1, Y0, Y1 = 16, 21, 10, 14
big = np.zeros(((Y1-Y0+1)*256, (X1-X0+1)*256), dtype=np.float32)
for y in range(Y0, Y1+1):
    for x in range(X0, X1+1):
        a = np.asarray(Image.open(f'{dem}/t_{x}_{y}.png').convert('RGB'), dtype=np.float32)
        big[(y-Y0)*256:(y-Y0+1)*256, (x-X0)*256:(x-X0+1)*256] = a[..., 0]*256 + a[..., 1] + a[..., 2]/256 - 32768
n = 2**Z
def lon2px(l): return ((l+180)/360*n - X0) * 256
def lat2px(la):
    r = math.radians(la); return ((1 - math.log(math.tan(r) + 1/math.cos(r))/math.pi)/2*n - Y0) * 256
x0, x1, y0, y1 = lon2px(W), lon2px(E), lat2px(N), lat2px(S)
crop = big[int(y0):int(math.ceil(y1)), int(x0):int(math.ceil(x1))]
print('dem crop', crop.shape, 'min/max', crop.min(), crop.max())
for name, w in (('relief-1', 440), ('relief-2', 880)):
    h = round(w * (N-S) / (E-W) / 1)  # plate carree output (lon/lat linear), reproject rows
    # resample mercator rows -> equirect rows
    yy = np.linspace(N, S, h); rows = (np.array([lat2px(v) for v in yy]) - int(y0)).clip(0, crop.shape[0]-1)
    xx = np.linspace(0, crop.shape[1]-1, w)
    r0 = np.floor(rows).astype(int); r1 = np.minimum(r0+1, crop.shape[0]-1); f = (rows - r0)[:, None]
    line = crop[r0] * (1-f) + crop[r1] * f
    img = np.stack([np.interp(xx, np.arange(crop.shape[1]), line[i]) for i in range(h)])
    img = np.maximum(img, 0)
    # hillshade, light from NW; cell size in metres
    dx = (E-W)/w * 111000 * math.cos(math.radians(33)); dy = (N-S)/h * 111000
    gy, gx = np.gradient(img, dy, dx)
    ex = 4.0   # vertical exaggeration
    slope = np.arctan(ex * np.hypot(gx, gy)); asp = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    hs = np.cos(alt)*np.cos(slope) + np.sin(alt)*np.sin(slope)*np.cos(az - asp)
    shade = np.clip((math.cos(math.pi/2 - alt) - hs) * 1.6, 0, 1)   # only shadow darkens
    elev = np.clip(img / 2500, 0, 1)
    alpha = np.clip(shade*0.55 + elev*0.12, 0, 0.6)
    # land mask (shadow only on land): rasterise land rings x4, box-downsample, dilate one cell
    from PIL import ImageDraw, ImageFilter
    mk = Image.new('L', (w*4, h*4), 0); dr = ImageDraw.Draw(mk)
    for p_ in polys(unary_union([q for g in read('ne_10m_land') for q in polys(g)])):
        dr.polygon([((x-W)/(E-W)*w*4, (N-y)/(N-S)*h*4) for x, y in p_.exterior.coords], fill=255)
    mk = mk.resize((w, h), Image.BILINEAR).filter(ImageFilter.MaxFilter(3))
    alpha = alpha * (np.asarray(mk, dtype=np.float32) / 255)
    a8 = np.round(alpha / 0.6 * 15).astype(np.uint8)    # 16 levels
    pal = Image.fromarray(a8, 'L')
    # palette image: black with alpha level
    p = pal.convert('P'); 
    im = Image.new('P', pal.size); im.putdata(list(a8.flatten()))
    im.putpalette([0]*48)
    tr = bytes(round(i/15*0.6*255) for i in range(16))
    im.save(f'{out}/{name}.png', optimize=True, transparency=tr)
    print(name, w, h, os.path.getsize(f'{out}/{name}.png'))
