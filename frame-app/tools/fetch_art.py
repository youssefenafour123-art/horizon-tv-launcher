"""Downloads the Riwaq collection from Wikimedia Commons and prepares it for the TV.
   python tools/fetch_art.py            fetch what's missing, then rebuild web/art, web/thumbs and web/catalog.js
   Raw downloads are cached in %TEMP%/riwaq/raw. Every file's licence is read from Commons and written to CREDITS.md;
   anything that isn't public domain or CC0 stops the build.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageFilter, ImageOps

sys.path.insert(0, os.path.dirname(__file__))
from pieces import PIECES, SEASONS, VIDEOS
import zellige

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
RAW = os.path.join(os.environ.get('TEMP', '/tmp'), 'riwaq', 'raw')
UA = {'User-Agent': 'RiwaqArtFetch/1.0 (personal TV art display; contact via github.com/youssefenafour123-art)'}
LONG = 1920          # long side of the wall image: the TV's WebView draws 1920x1080
THUMB = (336, 189)   # gallery tile: exactly its size on the TV (168x95 CSS px at 2x)
MID = 720            # the gallery's large preview
OK_LICENSES = re.compile(r'public domain|^pd|cc0|no restrictions|no known', re.I)

os.makedirs(RAW, exist_ok=True)
for d in ('art', 'thumbs', 'mid'):
    os.makedirs(os.path.join(WEB, d), exist_ok=True)


def api(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(dict(params, format='json'))
    for k in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(15 * (k + 1))
    raise RuntimeError('rate limited')


def info(files):
    """imageinfo for many files at once: a 1920px thumbnail URL (a standard, cached size) and the licence"""
    out = {}
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        r = api(dict(action='query', titles='|'.join('File:' + f for f in chunk), prop='imageinfo',
                     iiprop='url|size|extmetadata', iiurlwidth=1920, iiextmetadatafilter='LicenseShortName|Artist|Credit|UsageTerms'))
        norm = {n['to']: n['from'] for n in r['query'].get('normalized', [])}
        for p in r['query']['pages'].values():
            name = norm.get(p['title'], p['title'])[5:]
            if 'imageinfo' not in p:
                out[name] = None; continue
            ii = p['imageinfo'][0]
            meta = {k: re.sub('<[^>]+>', '', v.get('value', '')).strip() for k, v in ii.get('extmetadata', {}).items()}
            out[name] = dict(url=ii.get('thumburl') or ii['url'], w=ii['width'], h=ii['height'], license=meta.get('LicenseShortName', '?'),
                             page=ii.get('descriptionurl'))
        time.sleep(2)
    return out


def download(url, path):
    if os.path.isfile(path) and os.path.getsize(path) > 10000: return
    for k in range(10):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
            open(path + '.part', 'wb').write(data)
            os.replace(path + '.part', path)
            time.sleep(6)          # be gentle with Wikimedia's image servers
            return
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503): raise
            wait = int(e.headers.get('Retry-After') or 0) or 60 * (k + 1)
            print(f'   rate limited, waiting {wait}s', flush=True)
            time.sleep(wait)
    raise RuntimeError('download failed ' + url)


def stars(img, box, n, min_dist):
    """the brightest small highlights inside box (fractions): where twinkles go"""
    w, h = img.size
    small = img.convert('L').resize((w // 4, h // 4))
    sw, sh = small.size
    blur = small.filter(ImageFilter.GaussianBlur(6))
    px, bl = small.load(), blur.load()
    x0, y0, x1, y1 = int(box[0] * sw), int(box[1] * sh), int(box[2] * sw), int(box[3] * sh)
    cands = []
    for y in range(max(2, y0), min(sh - 2, y1), 2):
        for x in range(max(2, x0), min(sw - 2, x1), 2):
            v = px[x, y]
            if v > 150 and v - bl[x, y] > 18:   # bright and brighter than its surroundings
                cands.append((v - bl[x, y] * .5, x / sw, y / sh))
    cands.sort(reverse=True)
    picked = []
    for s, u, v in cands:
        if all((u - a) ** 2 + ((v - b) * h / w) ** 2 > min_dist ** 2 for a, b, _ in picked):
            picked.append((u, v, .012 + min(.012, s / 8000)))
        if len(picked) >= n: break
    return [[round(u, 4), round(v, 4), round(r, 4)] for u, v, r in picked]


def prepare(src, piece):
    im = Image.open(src)
    im = ImageOps.exif_transpose(im).convert('RGB')
    if 'crop' in piece:                       # trim scans with borders/labels: [l, t, r, b] fractions
        l, t, r, b = piece['crop']; W, H = im.size
        im = im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
    k = LONG / max(im.size)
    if k < 1: im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = os.path.join(WEB, 'art', piece['id'] + '.jpg')
    im.save(out, 'JPEG', quality=86, optimize=True, progressive=True)
    fu, fv = piece.get('focus', (.5, .5))
    th = ImageOps.fit(im, THUMB, Image.LANCZOS, centering=(fu, fv))
    th.save(os.path.join(WEB, 'thumbs', piece['id'] + '.jpg'), 'JPEG', quality=84, optimize=True)
    mid = im.copy(); mid.thumbnail((MID, MID), Image.LANCZOS)
    mid.save(os.path.join(WEB, 'mid', piece['id'] + '.jpg'), 'JPEG', quality=84, optimize=True)
    return im


def main():
    files = [p['file'] for p in PIECES if 'file' in p]
    meta = info(files)
    missing = [f for f in files if not meta.get(f)]
    if missing:
        print('NOT FOUND on Commons:', *missing, sep='\n  '); sys.exit(1)
    bad = [(f, meta[f]['license']) for f in files if not OK_LICENSES.search(meta[f]['license'])]
    if bad:
        print('Not public domain / CC0:'); [print('  ', f, '->', l) for f, l in bad]
        if '--allow' not in sys.argv: sys.exit(1)

    catalog, credits = [], []
    for p in PIECES:
        if 'proc' in p:
            src = os.path.join(RAW, p['id'] + '.png')
            zellige.render(p['proc'], src)
            lic, page = 'Drawn for Riwaq', None
        else:
            m = meta[p['file']]
            src = os.path.join(RAW, p['id'] + os.path.splitext(m['url'].split('?')[0])[1].lower())
            print('get', p['id'], m['w'], 'x', m['h'], m['license'], flush=True)
            download(m['url'], src)
            lic, page = m['license'], m['page']
        im = prepare(src, p)
        live = []
        for fx in p.get('live', []):
            fx = dict(fx)
            if 'auto' in fx:
                a = fx.pop('auto'); fx['stars'] = stars(im, a['box'], a['n'], a['min_dist'])
            live.append(fx)
        entry = {k: p[k] for k in ('id', 'title', 'artist', 'year', 'where', 'cols')}
        entry.update(w=im.width, h=im.height)
        if live: entry['live'] = live
        if 'focus' in p: entry['focus'] = p['focus']
        catalog.append(entry)
        credits.append(f"| {p['title']} | {p['artist']}, {p['year']} | {p['where']} | {lic} | {page or ''} |")

    # fireplace loops (built by tools/make_fireplace.py): the poster frame becomes the gallery tile
    for v in VIDEOS:
        poster = os.path.join(WEB, 'video', v['id'] + '.jpg')
        pim = Image.open(poster).convert('RGB')
        ImageOps.fit(pim, THUMB, Image.LANCZOS).save(os.path.join(WEB, 'thumbs', v['id'] + '.jpg'), 'JPEG', quality=84, optimize=True)
        pim.thumbnail((MID, MID), Image.LANCZOS); pim.save(os.path.join(WEB, 'mid', v['id'] + '.jpg'), 'JPEG', quality=84, optimize=True)
        catalog.append({k: v[k] for k in ('id', 'title', 'artist', 'year', 'where')} | dict(cols=['fireplace'], w=1920, h=1080, video='video/' + v['id'] + '.mp4'))
        credits.append(f"| {v['title']} (film) | {v['artist']} | {v['where']} | {v['license']} | {v['page']} |")

    js = '/* generated by tools/fetch_art.py from tools/pieces.py */\nwindow.CATALOG = ' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) \
         + ';\nwindow.SEASONS = ' + json.dumps(SEASONS, ensure_ascii=False) + ';\n'
    open(os.path.join(WEB, 'catalog.js'), 'w', encoding='utf-8').write(js)
    open(os.path.join(ROOT, 'CREDITS.md'), 'w', encoding='utf-8').write(
        '# Artwork credits\n\nEvery artwork in Riwaq is in the public domain (or CC0), taken from museum open-access scans on Wikimedia Commons.\n'
        'The two zellige pieces are drawn by Riwaq itself.\n\n| Work | Artist | Collection | Licence | Source |\n|---|---|---|---|---|\n' + '\n'.join(credits) + '\n')
    total = sum(os.path.getsize(os.path.join(WEB, 'art', f)) for f in os.listdir(os.path.join(WEB, 'art')))
    print(f'{len(catalog)} pieces, art {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
