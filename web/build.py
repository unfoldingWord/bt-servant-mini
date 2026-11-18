"""Builds the page into app/src/main/assets/www: the JS bundle, index.html and the language packs (with ids.json and index.json).
   python -I -X utf8 web/build.py        (from the repo root; needs bun; runs the fast tests in web/tests, --full all of them, --no-tests none; --dev also puts web/src/data/dev in web/desktop/dev, for ?dev=;
   --devapk puts it in app/src/devtest for the dev APK, `gradle assembleFullDevtest`)"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / 'app' / 'src' / 'main' / 'assets' / 'www'
# the packs with all four Translation Academy manuals, else the older ones (the same choice as web/tests/fs-packs.ts)
PACKS = next((p for p in (ROOT.parent / 'lp3-ta-packs', ROOT.parent / 'fase0-mini-servant' / 'packs') if p.is_dir()), ROOT.parent / 'fase0-mini-servant' / 'packs')
# PACKS_DIR=<dir> ships other packs (as in web/tests/fs-packs.ts), e.g. ../mini-obs-packs, the packs with Open Bible Stories
if os.environ.get('PACKS_DIR'):
    PACKS = Path(os.environ['PACKS_DIR']).resolve()
    assert PACKS.is_dir(), f'PACKS_DIR {PACKS} is not a folder'
# The language-pack client (web/tsconfig.json paths): bt-synergy at the commit in bt-synergy.ref, checked out in ../bts-client2
# (as Servos does). Built against another commit, the app would read the packs with a client it was not tested with.
REF = (ROOT / 'bt-synergy.ref').read_text(encoding='utf-8').strip()
BTS = ROOT.parent / 'bts-client2'
_head = subprocess.run(['git', '-C', str(BTS), 'rev-parse', 'HEAD'], capture_output=True, text=True)
if _head.returncode or _head.stdout.strip() != REF:
    raise SystemExit(f"""{BTS} is not at bt-synergy.ref ({REF[:12]}): {'no git checkout there' if _head.returncode else 'it is at ' + _head.stdout.strip()[:12]}.
Fix it with one of:
  git -C <your bt-synergy clone> worktree add --detach {BTS} {REF}
  git -C {BTS} fetch && git -C {BTS} checkout --detach {REF}
then: cd {BTS} && bun install --frozen-lockfile --filter @bt-synergy/language-pack-client --filter @bt-synergy/language-pack-v3""")
_dirty = subprocess.run(['git', '-C', str(BTS), 'status', '--porcelain'], capture_output=True, text=True).stdout.strip()
if _dirty:
    raise SystemExit(f"""{BTS} has local changes (the client must be bt-synergy.ref as committed):
{_dirty[:800]}
Undo them before building (git -C {BTS} status shows them).""")
if not (BTS / 'packages' / 'language-pack-client' / 'node_modules').is_dir():
    raise SystemExit(f'{BTS} has no node_modules: cd {BTS} && bun install --frozen-lockfile --filter @bt-synergy/language-pack-client --filter @bt-synergy/language-pack-v3')
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
# web/src/data/dev/ (the dev fixtures) is read with fetch, never imported, so no bundle has any of it (they are checked by their
# content, not by the file name, which dev.ts names); it goes only into web/desktop with --dev (see below)
DEV_TEXT = 'Where did everything in the universe come from?'
def no_dev(out):
    assert DEV_TEXT not in (out / 'main.js').read_text(encoding='utf-8'), f'a dev fixture got into {out}/main.js'
    assert not any('obs5m' in f.name for f in out.rglob('*') if f.is_file()), f'a dev fixture file is in {out}'
no_dev(WWW)
# the answer tests (web/tests) on every build: a fast part by default (under a minute), all of them with --full (about 4
# minutes, with the scores against web/tests/baseline.json); --no-tests skips them
if '--no-tests' not in sys.argv:
    import os
    env = dict(os.environ, **({} if '--full' in sys.argv else {'ANSWERS': 'fast'}))
    t = subprocess.run(['bun', 'test', '--timeout', '120000'], cwd=ROOT / 'web', env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', shell=sys.platform == 'win32')
    print(t.stdout[-1500:], t.stderr[-3000:])
    if t.returncode:
        raise SystemExit('bun test failed (python -I -X utf8 web/build.py --no-tests to build anyway)')
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
# the dev fixtures (--dev) go only here, the local preview outside the APK and iOS assets; a build without --dev leaves none
if '--dev' in sys.argv:
    shutil.copytree(ROOT / 'web' / 'src' / 'data' / 'dev', DESK / 'dev')
# the dev APK (--devapk): the dev fixtures go into app/src/devtest, the assets of the `devtest` build type only (app id
# ….btservantmini.dev, named "BT Servant DEV", opens the page with ?dev=<DEV_SWITCH> when set); the debug APK never has them
DEVAPK = ROOT / 'app' / 'src' / 'devtest' / 'assets' / 'www' / 'dev'
shutil.rmtree(DEVAPK, ignore_errors=True)
if '--devapk' in sys.argv:
    shutil.copytree(ROOT / 'web' / 'src' / 'data' / 'dev', DEVAPK)
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
no_dev(APP)
va = hashlib.sha256((APP / 'main.js').read_bytes()).hexdigest()[:10]
head = """<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#262624">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="BTS mini">
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
