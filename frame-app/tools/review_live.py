"""Draws each living piece's motion zones over its image (water band, glow, sunbeam, stars) so they can be checked by eye.
   python tools/review_live.py OUT_DIR [id …]"""
import json, os, re, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'web', 'catalog.js'), encoding='utf-8').read()
catalog = json.loads(re.search(r'window\.CATALOG\s*=\s*(\[.*?\]);', src, re.S).group(1))
out = sys.argv[1]
only = set(sys.argv[2:])
os.makedirs(out, exist_ok=True)
for p in catalog:
    if not p.get('live') or (only and p['id'] not in only): continue
    im = Image.open(os.path.join(ROOT, 'web', 'art', p['id'] + '.jpg')).convert('RGB')
    k = 900 / im.width
    im = im.resize((900, round(im.height * k)))
    W, H = im.size
    d = ImageDraw.Draw(im)
    for fx in p['live']:
        if fx['fx'] == 'shimmer':
            box = (fx.get('x0', 0) * W, fx['y0'] * H, fx.get('x1', 1) * W, fx.get('y1', 1) * H)
            d.rectangle(box, outline=(0, 255, 255), width=3)
        if fx['fx'] == 'glow':
            x, y, r = fx['at'][0] * W, fx['at'][1] * H, fx.get('r', .15) * W
            d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 0, 255), width=3)
            d.line((x - 10, y, x + 10, y), fill=(255, 0, 255), width=3); d.line((x, y - 10, x, y + 10), fill=(255, 0, 255), width=3)
        if fx['fx'] == 'motes':
            d.polygon([(u * W, v * H) for u, v in fx['poly']], outline=(255, 255, 0), width=3)
        if fx['fx'] == 'twinkle':
            for u, v, r in fx['stars']:
                d.ellipse((u * W - 8, v * H - 8, u * W + 8, v * H + 8), outline=(255, 60, 60), width=2)
    # a light grid every 10% to read coordinates from
    for i in range(1, 10):
        d.line((i * W / 10, 0, i * W / 10, 8), fill=(255, 255, 255)); d.line((0, i * H / 10, 8, i * H / 10), fill=(255, 255, 255))
        d.text((i * W / 10 + 2, 8), f'.{i}', fill=(255, 255, 255)); d.text((10, i * H / 10 - 6), f'.{i}', fill=(255, 255, 255))
    im.save(os.path.join(out, p['id'] + '.jpg'), quality=80)
print('ok')
