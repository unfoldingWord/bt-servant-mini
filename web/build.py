"""Builds the page into app/src/main/assets/www: the JS bundle, index.html and the language packs (with ids.json and index.json).
   python -I -X utf8 web/build.py        (from the repo root; needs bun)"""
import json, shutil, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / 'app' / 'src' / 'main' / 'assets' / 'www'
PACKS = ROOT.parent / 'fase0-mini-servant' / 'packs'
shutil.rmtree(WWW, ignore_errors=True)
WWW.mkdir(parents=True)
r = subprocess.run(['bun', 'build', 'src/main.ts', '--outdir', str(WWW), '--target', 'browser', '--minify', '--sourcemap=none'],
                   cwd=ROOT / 'web', capture_output=True, text=True, shell=sys.platform == 'win32')
print(r.stdout[-800:], r.stderr[-2000:])
if r.returncode:
    raise SystemExit('bun build failed')
import hashlib
v = hashlib.sha256((WWW / 'main.js').read_bytes()).hexdigest()[:10]
(WWW / 'index.html').write_text((ROOT / 'web' / 'index.html').read_text(encoding='utf-8').replace('./main.js', f'./main.js?v={v}'), encoding='utf-8')
langs = []
for d in sorted(PACKS.iterdir()):
    if not (d / 'state.json').exists():
        continue
    out = WWW / 'packs' / d.name
    shutil.copytree(d, out)
    ids = sorted(p.name for p in (out / 'seg').rglob('*') if p.is_file())
    (out / 'ids.json').write_text(json.dumps(ids), encoding='utf-8')
    langs.append(d.name)
(WWW / 'packs' / 'index.json').write_text(json.dumps({'langs': langs}), encoding='utf-8')
print('packs', langs, 'www', sum(f.stat().st_size for f in WWW.rglob('*') if f.is_file()) // 1024, 'KB')
