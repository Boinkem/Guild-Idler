"""Void per-class skin generator (patch 0434).

Reads public/heroes/<class>/original/{idle,walk,run}.png, writes public/heroes/<class>/void/.
Reuses the Paladin generator's head tracker and helpers (../paladin), so keep both folders.
Needs: pip install pillow numpy scipy.   Run:  python tools/skin-gen/void/run.py [class ...]
  void.py      - void plate / violet glow / tendril ramps, tendrils, third eye, visor bars, motes
  vclasses.py  - per-class colour maps and hooks
"""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','paladin'))
import numpy as np
from PIL import Image
from paladin import remap, over, bbox_of
from track import M, HEAD, frames, track, H
from void import tendrils, aura, motes, third_eye
from vclasses import VCLASSES
FACES_LEFT={'dwarf','wizard','witch'}   # HeroSprite's HERO_REVERSED_FACING: art drawn facing left
OUTDIR=os.environ.get('OUT_DIR',H)
def build(c,anims=None):
    cfg=VCLASSES[c]; fw,fh=M[c]['frameW'],M[c]['frameH']
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
            fl = fl != (c in FACES_LEFT)
            g=f.copy()
            if cfg.get('pre'): g=cfg['pre'](g,head,i,a)
            o=remap(g,cfg['cmap']); o[o[...,3]==254,3]=255
            if cfg.get('post'): o=cfg['post'](o,g,head,i,a,n)
            ep=cfg.get('eye')
            if ep:
                dx=-ep['dx'] if fl else ep['dx']
                o=third_eye(o,hx+hw/2+dx,hy+hh/2+ep['dy'],i,n,big=ep.get('big',False))
            L=np.zeros((fh,fw,4),float)
            tp=cfg.get('tendrils')
            if tp:
                dirx=1 if fl else -1
                ox=hx+hw*(1-tp['ox'] if fl else tp['ox']); oy=hy+hh*tp['oy']
                L=over(L,tendrils(o.shape,ox,oy,dirx,tp['length'],tp['count'],i,n,tp.get('spread',0),tp.get('width',2.0),seed=sum(map(ord,c)),span=tp.get('span'),angles=tp.get('angles',(-0.35,0.9))))
            L=over(L,aura(o))
            L=over(L,o.astype(float))
            L=over(L,motes(o.shape,bbox_of(f),i,n,cfg.get('motes',4),sum(map(ord,c))+len(a)))
            outs.append(np.clip(L,0,255).astype('uint8'))
        os.makedirs(f'{OUTDIR}/{c}/void',exist_ok=True)
        Image.fromarray(np.concatenate(outs,1),'RGBA').save(f'{OUTDIR}/{c}/void/{a}.png')
if __name__=='__main__':
    for c in (sys.argv[1:] or list(VCLASSES)): build(c); print('built',c)
