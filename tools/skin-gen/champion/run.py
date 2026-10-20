"""Champion per-class skin generator (patch 0435) -- the "upgraded default" set.

Keeps each class's own palette and adds shapes: gold crowns/circlets, gold rims on
helms and pauldrons, fuller plumes, longer capes with gold hems (or new capes drawn
behind), quilted padding / straps / pauldrons on bare areas, the samurai's headband.
Reads public/heroes/<class>/original/{idle,walk,run}.png, writes public/heroes/<class>/champion/.
Reuses the Paladin generator's head tracker and helpers (../paladin), so keep both folders.
Needs: pip install pillow numpy scipy.   Run:  python tools/skin-gen/champion/run.py [class ...]
  asc.py       - crown, gold_rims, extend_down, back_cape, pauldron, quilt, strap, headband...
  aclasses.py  - per-class hooks
"""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','paladin'))
import numpy as np
from PIL import Image
from paladin import over
from track import M, HEAD, frames, track, H
from aclasses import ACLASSES
FACES_LEFT={'dwarf','wizard','witch'}
OUTDIR=os.environ.get('OUT_DIR',H)
def build(c,anims=None):
    cfg=ACLASSES[c]; fw,fh=M[c]['frameW'],M[c]['frameH']
    x0,y0,x1,y1=HEAD[c]; hw,hh=x1-x0,y1-y0
    for a in (anims or [x for x in M[c]['animations'] if x in ('idle','walk','run')]):
        fr=frames(c,a); tr=track(c,fr,a)
        good=[k for k,t in enumerate(tr) if t[2]<=200] or list(range(len(tr)))
        fixed=[]
        for k,(x,y,cost,fl) in enumerate(tr):
            if cost>200:
                j=min(good,key=lambda g:(abs(g-k),g>k)); x,y,fl=tr[j][0],tr[j][1],tr[j][3]
            fixed.append((x,y,fl))
        n=len(fr); outs=[]
        for i,f in enumerate(fr):
            hx,hy,fl=fixed[i]; head=(hx,hy,hw,hh); fl = fl != (c in FACES_LEFT)
            o=f.copy()
            if cfg.get('cmap'):
                from paladin import remap
                o=remap(o,cfg['cmap'])
            if cfg.get('pre'): o=cfg['pre'](o if not cfg.get('cmap') else o,head,i,a,n) if not cfg.get('pre_on_src') else cfg['pre'](f,head,i,a,n)
            if cfg.get('post'): o=cfg['post'](o,f,head,i,a,n)
            L=np.zeros((fh,fw,4),float)
            fronts=[lay(o,f,head,i,a,n,fl) for lay in (cfg.get('front') or [])]   # may draw onto o
            for lay in (cfg.get('behind') or []): L=over(L,lay(o,f,head,i,a,n,fl))
            L=over(L,o.astype(float))
            for fr_ in fronts: L=over(L,fr_)
            outs.append(np.clip(L,0,255).astype('uint8'))
        os.makedirs(f'{OUTDIR}/{c}/champion',exist_ok=True)
        Image.fromarray(np.concatenate(outs,1),'RGBA').save(f'{OUTDIR}/{c}/champion/{a}.png')
if __name__=='__main__':
    for c in (sys.argv[1:] or list(ACLASSES)): build(c); print('built',c)
