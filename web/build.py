"""Builds the page into app/src/main/assets/www: the JS bundle, index.html and the language packs (with ids.json and index.json).
   python -I -X utf8 web/build.py        (from the repo root; needs bun)"""
import json, re, shutil, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / 'app' / 'src' / 'main' / 'assets' / 'www'
PACKS = ROOT.parent / 'fase0-mini-servant' / 'packs'
shutil.rmtree(WWW, ignore_errors=True)
WWW.mkdir(parents=True)
# the app's version, for the installable web app's About (the Android app asks the APK)
VERSION = re.search(r"versionName '([^']+)'", (ROOT / 'app' / 'build.gradle').read_text(encoding='utf-8')).group(1).replace('-mini', '')
(ROOT / 'web' / 'src' / 'data' / 'version.json').write_text(json.dumps({'version': VERSION}) + '\n', encoding='utf-8')
r = subprocess.run(['bun', 'build', 'src/main.ts', '--outdir', str(WWW), '--target', 'browser', '--minify', '--sourcemap=none'],
                   cwd=ROOT / 'web', capture_output=True, text=True, shell=sys.platform == 'win32')
print(r.stdout[-800:], r.stderr[-2000:])
if r.returncode:
    raise SystemExit('bun build failed')
import hashlib
v = hashlib.sha256((WWW / 'main.js').read_bytes()).hexdigest()[:10]
(WWW / 'index.html').write_text((ROOT / 'web' / 'index.html').read_text(encoding='utf-8').replace('./main.js', f'./main.js?v={v}'), encoding='utf-8')
# The packs go only into the full build; the light build ships an empty list (packs are added from the app).
FULL = ROOT / 'app' / 'src' / 'full' / 'assets' / 'www' / 'packs'
LITE = ROOT / 'app' / 'src' / 'lite' / 'assets' / 'www' / 'packs'
shutil.rmtree(FULL, ignore_errors=True)
shutil.rmtree(LITE, ignore_errors=True)
LITE.mkdir(parents=True)
(LITE / 'index.json').write_text(json.dumps({'langs': []}), encoding='utf-8')
langs = []
for d in sorted(PACKS.iterdir()):
    if not (d / 'state.json').exists():
        continue
    out = FULL / d.name
    shutil.copytree(d, out)
    ids = sorted(p.name for p in (out / 'seg').rglob('*') if p.is_file())
    (out / 'ids.json').write_text(json.dumps(ids), encoding='utf-8')
    langs.append(d.name)
(FULL / 'index.json').write_text(json.dumps({'langs': langs}), encoding='utf-8')
# desktop testing: the page plus the full packs, outside the APK's assets
DESK = ROOT / 'web' / 'desktop'
shutil.rmtree(DESK, ignore_errors=True)
shutil.copytree(WWW, DESK)
shutil.copytree(FULL, DESK / 'packs')
print('packs', langs, 'www', sum(f.stat().st_size for f in WWW.rglob('*') if f.is_file()) // 1024, 'KB')

# The iOS app (ios/): the same page as the Android app, without packs (they are added from the app, like the light build).
# It is kept in the repository so that CI can build the app without this machine's sources of the page.
IOS = ROOT / 'ios' / 'BTServantMini' / 'www'
shutil.rmtree(IOS, ignore_errors=True)
shutil.copytree(WWW, IOS)
(IOS / 'packs').mkdir()
(IOS / 'packs' / 'index.json').write_text(json.dumps({'langs': []}), encoding='utf-8')

# The installable web app (iPhone and any browser): site/app, served at /app/ on the landing page. Same page as the Android
# app, built with __PWA__ (the model runs in the browser through wllama), no packs inside (they are added from the menu, like
# the light build), plus the web-app manifest, icons and a service worker that keeps the app's files for offline use.
APP = ROOT / 'site' / 'app'
PWA = ROOT / 'web' / 'pwa'
shutil.rmtree(APP, ignore_errors=True)
APP.mkdir(parents=True)
r = subprocess.run(['bun', 'build', 'src/main.ts', '--outdir', str(APP), '--target', 'browser', '--minify', '--sourcemap=none',
                    '--define', '__PWA__=true'], cwd=ROOT / 'web', capture_output=True, text=True, shell=sys.platform == 'win32')
if r.returncode:
    print(r.stdout[-800:], r.stderr[-2000:])
    raise SystemExit('bun build (web app) failed')
va = hashlib.sha256((APP / 'main.js').read_bytes()).hexdigest()[:10]
head = """<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#262624">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="BT Servant">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" href="icons/icon-192.png">
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'))</script>
</head>"""
page = (ROOT / 'web' / 'index.html').read_text(encoding='utf-8').replace('./main.js', f'./main.js?v={va}').replace('</head>', head, 1)
(APP / 'index.html').write_text(page, encoding='utf-8')
shutil.copy(ROOT / 'web' / 'node_modules' / '@wllama' / 'wllama' / 'esm' / 'wasm' / 'wllama.wasm', APP / 'wllama.wasm')
shutil.copy(PWA / 'manifest.json', APP / 'manifest.json')
shutil.copytree(PWA / 'icons', APP / 'icons')
(APP / 'packs').mkdir()
(APP / 'packs' / 'index.json').write_text(json.dumps({'langs': []}), encoding='utf-8')
files = ['./', f'./main.js?v={va}', './wllama.wasm', './manifest.json', './packs/index.json'] +         [f'./icons/{p.name}' for p in sorted((APP / 'icons').iterdir())]
sw = (PWA / 'sw.js').read_text(encoding='utf-8').replace("'__BUILD__'", json.dumps(va)).replace('__FILES__', json.dumps(files))
(APP / 'sw.js').write_text(sw, encoding='utf-8')
print('web app', VERSION, sum(f.stat().st_size for f in APP.rglob('*') if f.is_file()) // 1024, 'KB')
