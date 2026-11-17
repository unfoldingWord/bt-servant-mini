"""Builds the Open Bible Stories images pack (bt-servant-mini-obs-images.zip) from Door43's obs-images-360px.zip.
   python -I -X utf8 web/obs_images.py <door43 obs-images-360px.zip> <output folder>      (needs Pillow with WebP)
The pack is a plain zip with every entry stored (WebP is compressed already), in a fixed order with a fixed date, so the same
images give the same bytes: LICENSE.txt, then obs-images/SS-FF.webp. The app accepts only a file whose SHA-256 is in
web/src/data/obsimages.json, which this script writes (see handoff/mini-servant/plan-obs-imagenes.md)."""
import hashlib, io, json, re, struct, sys, zipfile, zlib
from pathlib import Path
from PIL import Image, features

QUALITY = 75
NAME = 'bt-servant-mini-obs-images.zip'
LICENSE = """Open Bible Stories illustrations (c) Sweet Publishing (https://sweetpublishing.com), licensed under
CC BY-SA 3.0 Unported (https://creativecommons.org/licenses/by-sa/3.0/).
Converted to WebP (quality 75, 640x360) for BT Servant Mini from Door43's obs-images-360px.zip
(https://cdn.door43.org/obs/jpg/obs-images-360px.zip). This pack is shared under the same license.
Open Bible Stories: https://openbiblestories.org (unfoldingWord).
"""


def stored_zip(entries):
    """A zip with every entry stored, date 1980-01-01 00:00, no extra fields: the same entries give the same bytes."""
    out, central = io.BytesIO(), io.BytesIO()
    for name, data in entries:
        n = name.encode('utf-8')
        crc = zlib.crc32(data) & 0xFFFFFFFF
        at = out.tell()
        # local header: signature, version 20, flags (bit 11: UTF-8 names), method 0, time 0, date 1980-01-01 (0x21)
        out.write(struct.pack('<IHHHHHIIIHH', 0x04034B50, 20, 0x0800, 0, 0, 0x21, crc, len(data), len(data), len(n), 0))
        out.write(n)
        out.write(data)
        central.write(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014B50, 20, 20, 0x0800, 0, 0, 0x21, crc, len(data), len(data),
                                  len(n), 0, 0, 0, 0, 0, at))
        central.write(n)
    cd = central.getvalue()
    start = out.tell()
    out.write(cd)
    out.write(struct.pack('<IHHHHIIH', 0x06054B50, 0, 0, len(entries), len(entries), len(cd), start, 0))
    return out.getvalue()


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    if not features.check('webp'):
        raise SystemExit('this Pillow has no WebP')
    src, dest = Path(sys.argv[1]), Path(sys.argv[2])
    z = zipfile.ZipFile(src)
    frames = {}
    for info in z.infolist():
        m = re.search(r'(?:^|/)obs-\w+-(\d\d)-(\d\d)\.jpg$', info.filename)
        if m and '__MACOSX/' not in info.filename:
            frames[f'{m.group(1)}-{m.group(2)}'] = info.filename
    if not frames:
        raise SystemExit(f'no obs-xx-SS-FF.jpg in {src}')
    entries = [('LICENSE.txt', LICENSE.encode('utf-8'))]
    for key in sorted(frames):
        b = io.BytesIO()
        Image.open(io.BytesIO(z.read(frames[key]))).convert('RGB').save(b, 'WEBP', quality=QUALITY, method=6)
        entries.append((f'obs-images/{key}.webp', b.getvalue()))
    data = stored_zip(entries)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / NAME).write_bytes(data)
    sha = hashlib.sha256(data).hexdigest()
    meta = {'sha256': sha, 'bytes': len(data), 'count': len(frames), 'quality': QUALITY,
            'source': 'https://cdn.door43.org/obs/jpg/obs-images-360px.zip'}
    (Path(__file__).parent / 'src' / 'data' / 'obsimages.json').write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')
    print(f'{dest / NAME}: {len(frames)} images, {len(data) / 1048576:.1f} MB, sha256 {sha}')


if __name__ == '__main__':
    main()
