"""Paladin per-class skin generator (patch 0432).

Reads public/heroes/<class>/original/*.png and writes public/heroes/<class>/paladin/*.png.
Needs: pip install pillow numpy scipy.   Run from anywhere:  python tools/skin-gen/paladin/run.py [class ...] [--anims idle,walk,run|all]
  track.py   - head tracking (template match vs a hand-picked head box on idle frame 0, mirrored too)
  paladin.py - shared effects: halo, aura, sparkles, palette ramps
  classes.py - per-class colour-role maps and hooks (knight plume removal, pauldrons, shield cross, emblems...)
"""
import sys,json,os
import numpy as np
from PIL import Image
from paladin import *
from classes import CLASSES
from track import H
OUTDIR=os.environ.get('OUT_DIR',H)
def build(c,anims=None,save=True):
    cfg=CLASSES[c]; fw,fh=M[c]['frameW'],M[c]['frameH']
    x0,y0,x1,y1=HEAD[c]; hw,hh=x1-x0,y1-y0
    res={}
    for a in (anims or M[c]['animations']):
        fr=frames(c,a); tr=track(c,fr,a)
        # bad matches -> previous good
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
            if cfg.get('post'): o=cfg['post'](o,g,head,i,a)
            al=1.0
            if a=='death':
                al=max(0.0,1-(i/(n-1))**1.5) if n>1 else 1
                if tr[i][2]>200: al*=0.4
            hp=cfg['halo']
            L=np.zeros((fh,fw,4),float)
            L=over(L,aura(o,0.8*max(al,0.35)))
            if al>0.05:
                L=over(L,halo(o.shape,hx+hw/2+(-hp['dx'] if fl else hp['dx']),hy+hh/2+hp['dy'],hp['r'],i,alpha=al,rays=hp.get('rays',True),cross=hp.get('cross',True),cut=hp.get('cut',0.35)))
            L=over(L,o.astype(float))
            L=over(L,sparkles(o.shape,bbox_of(f),i,cfg.get('spark',3),sum(map(ord,c))+len(a),alpha=al))
            outs.append(np.clip(L,0,255).astype('uint8'))
        sheet=np.concatenate(outs,1)
        res[a]=sheet
        if save:
            os.makedirs(f'{OUTDIR}/{c}/paladin',exist_ok=True)
            Image.fromarray(sheet,'RGBA').save(f'{OUTDIR}/{c}/paladin/{a}.png')
    return res
if __name__=='__main__':
    # python run.py [class ...] [--anims idle,walk,run]   (defaults: all classes, the animations the game uses)
    args=sys.argv[1:]; anims=['idle','walk','run']
    if '--anims' in args:
        k=args.index('--anims'); anims=None if args[k+1]=='all' else args[k+1].split(','); args=args[:k]+args[k+2:]
    for c in (args or list(CLASSES)):
        build(c,[a for a in M[c]['animations'] if anims is None or a in anims]); print('built',c)
