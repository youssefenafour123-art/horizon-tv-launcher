"""Builds the Fireplace loops from National Park Service hearth films on Wikimedia Commons.
   Takes only the first minutes of each film (HTTP range), crops onto the fire, and crossfades the end into the start
   so the loop has no seam (picture and crackle). Output: web/video/<id>.mp4 (H.264, hardware-decoded on the TV) and a poster frame.
   python tools/make_fireplace.py"""
import os, subprocess, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from pieces import VIDEOS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'video')
RAW = os.path.join(os.environ.get('TEMP', '/tmp'), 'riwaq', 'fire')
UA = 'RiwaqArtFetch/1.0 (personal TV art display)'
os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)

def poster(mp4, v):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', '8', '-i', mp4, '-frames:v', '1', '-q:v', '3', '-y',
                    os.path.join(OUT, v['id'] + '.jpg')], check=True)
    print(v['id'], f"{os.path.getsize(mp4) / 1e6:.1f} MB")


# filmed fires first (the simulated one borrows their crackle)
for v in sorted(VIDEOS, key=lambda v: bool(v.get('sim'))):
    if v.get('sim'):
        silent = os.path.join(RAW, v['id'] + '-silent.mp4')
        if not os.path.isfile(silent):
            subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'fire_sim.py'), silent, str(v['length'])], check=True)
        mp4 = os.path.join(OUT, v['id'] + '.mp4')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', silent, '-i', os.path.join(OUT, v['sound'] + '.mp4'),
                        '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', '-movflags', '+faststart', '-y', mp4], check=True)
        poster(mp4, v)
        continue
    part = os.path.join(RAW, v['id'] + '-part.webm')
    if not os.path.isfile(part) or os.path.getsize(part) < 1e6:
        req = urllib.request.Request(v['url'], headers={'User-Agent': UA, 'Range': f"bytes=0-{v['bytes']}"})
        open(part, 'wb').write(urllib.request.urlopen(req, timeout=600).read())
    mp4 = os.path.join(OUT, v['id'] + '.mp4')
    s, n, fade = v['start'], v['length'], 2
    flt = (f"[0:v]{v['crop']},scale=1920:1080:flags=lanczos,split[a][b];"
           f"[a]trim={fade}:{n + fade},setpts=PTS-STARTPTS[main];[b]trim=0:{fade},setpts=PTS-STARTPTS[head];"
           f"[main][head]xfade=transition=fade:duration={fade}:offset={n - fade},format=yuv420p[v];"
           # the crackle loops the same way: the last two seconds fade into the first two
           f"[0:a]asplit[aa][ab];[aa]atrim={fade}:{n + fade},asetpts=PTS-STARTPTS[am];[ab]atrim=0:{fade},asetpts=PTS-STARTPTS[ah];"
           f"[am][ah]acrossfade=d={fade}:c1=tri:c2=tri,loudnorm=I=-24:TP=-2,aresample=48000[a]")
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', str(s), '-t', str(n + fade), '-i', part,
                    '-filter_complex', flt, '-map', '[v]', '-map', '[a]', '-c:a', 'aac', '-b:a', '128k', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
                    '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', '-y', mp4], check=True)
    poster(mp4, v)
