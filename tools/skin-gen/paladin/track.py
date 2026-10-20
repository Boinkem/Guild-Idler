import numpy as np, json
from PIL import Image
import os
# repo root: python tools/skin-gen/paladin/run.py <class...>  (or set HEROES_DIR)
H=os.environ.get('HEROES_DIR',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','public','heroes'))+os.sep
M=json.load(open(H+'manifest.json'))
HEAD={'knight':(27,11,40,23),'adventurer':(13,3,23,12),'gladiator':(9,3,19,15),'samurai':(15,16,27,28),
'witch':(20,14,37,32),'pyromancer':(18,26,35,43),'dwarf':(39,18,52,33),'wizard':(24,16,50,36),
'kobold':(48,22,74,46),'lizardman':(40,16,54,32),'minotaur':(34,30,56,50),'werewolf':(48,12,80,36),
'centaur':(49,14,64,31),'huge_knight':(108,62,132,92)}
def frames(c,anim,variant='original'):
    fw,fh=M[c]['frameW'],M[c]['frameH']
    im=Image.open(H+f'{c}/{variant}/{anim}.png').convert('RGBA')
    n=im.width//fw
    return [np.array(im.crop((i*fw,0,i*fw+fw,fh))).astype(np.int32) for i in range(n)]
def track(c,fr,anim):
    x0,y0,x1,y1=HEAD[c]
    ref=frames(c,'idle')[0]
    T=ref[y0:y1,x0:x1]; w,h=x1-x0,y1-y0
    Ts=[(T,T[...,3]>0,False),(T[:,::-1],T[:,::-1][...,3]>0,True)]
    out=[]; prev=(x0,y0)
    for i,f in enumerate(fr):
        fh,fw=f.shape[:2]
        R=max(6,int(max(w,h)*(1.6 if i==0 else 0.8)))
        best=None
        for yy in range(max(-h//2,prev[1]-R),min(fh-h//2,prev[1]+R)+1):
            for xx in range(max(-w//2,prev[0]-R),min(fw-w//2,prev[0]+R)+1):
                # crop with padding
                P=np.zeros((h,w,4),np.int32)
                ys0,xs0=max(0,yy),max(0,xx); ys1,xs1=min(fh,yy+h),min(fw,xx+w)
                if ys1<=ys0 or xs1<=xs0: continue
                P[ys0-yy:ys1-yy,xs0-xx:xs1-xx]=f[ys0:ys1,xs0:xs1]
                pm=P[...,3]>0
                for TT,mask,fl in Ts:
                    d=np.abs(P[...,:3]-TT[...,:3]).sum(-1)
                    cost=np.where(mask&pm,d,np.where(mask^pm,300,0)).sum()/mask.sum()
                    cost+=0.5*(abs(xx-prev[0])+abs(yy-prev[1]))+(8 if fl else 0)
                    if best is None or cost<best[0]: best=(cost,xx,yy,fl)
        out.append((best[1],best[2],best[0],best[3]))
        if best[0]<=200: prev=(best[1],best[2])
    return out
