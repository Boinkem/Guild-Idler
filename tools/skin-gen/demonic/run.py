"""Demonic per-class skin generator (patch 0433).

Reads public/heroes/<class>/original/{idle,walk,run}.png, writes public/heroes/<class>/demonic/.
Reuses the Paladin generator's head tracker and helpers (../paladin), so keep both folders.
Needs: pip install pillow numpy scipy.   Run:  python tools/skin-gen/demonic/run.py [class ...]
  demonic.py  - charred/lava/red ramps, horns, molten seams + cracks, T-visor, embers
  dclasses.py - per-class colour maps and hooks
"""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','paladin'))
import numpy as np
from PIL import Image
from paladin import remap, over, bbox_of
from track import M, HEAD, frames, track, H
from demonic import horns, aura, embers
from dclasses import DCLASSES
OUTDIR=os.environ.get('OUT_DIR',H)
def build(c,anims=None):
    cfg=DCLASSES[c]; fw,fh=M[c]['frameW'],M[c]['frameH']
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
            hx,hy,fl=fixed[i]; head=(hx,hy,hw,hh)
            g=f.copy()
            if cfg.get('pre'): g=cfg['pre'](g,head,i,a)
            o=remap(g,cfg['cmap']); o[o[...,3]==254,3]=255
            if cfg.get('post'): o=cfg['post'](o,g,head,i,a,n)
            L=np.zeros((fh,fw,4),float)
            L=over(L,aura(o))
            hp=cfg.get('horns')
            hl=None
            if hp:
                dx=-hp['dx'] if fl else hp['dx']
                hl=horns(o.shape,hx+hw/2+dx,hy+hp['ty'],hw*hp['half'],hp['size'],i,n,thick=hp.get('thick'))
                if hp.get('behind'): L=over(L,hl)
            L=over(L,o.astype(float))
            if hp and not hp.get('behind'): L=over(L,hl)
            L=over(L,embers(o.shape,bbox_of(f),i,n,cfg.get('embers',4),sum(map(ord,c))+len(a)))
            outs.append(np.clip(L,0,255).astype('uint8'))
        os.makedirs(f'{OUTDIR}/{c}/demonic',exist_ok=True)
        Image.fromarray(np.concatenate(outs,1),'RGBA').save(f'{OUTDIR}/{c}/demonic/{a}.png')
if __name__=='__main__':
    for c in (sys.argv[1:] or list(DCLASSES)): build(c); print('built',c)
