import numpy as np, json, math, os, sys
from PIL import Image
from track import M, HEAD, frames, track

G=[(255,244,176),(255,214,82),(232,166,44),(176,108,30),(112,62,22)]
B=[(120,170,255),(64,110,222),(40,74,176),(26,46,122),(16,26,74)]
C=[(255,253,244),(236,230,214),(204,192,168),(152,138,120),(100,88,84)]
P=[(250,250,252),(218,222,234),(170,178,204),(120,126,160),(74,78,110)]
WARM=(255,252,236)
OUT=(19,19,19)

def remap(f,cmap):
    o=f.copy()
    for src,dst in cmap.items():
        m=(f[...,0]==src[0])&(f[...,1]==src[1])&(f[...,2]==src[2])&(f[...,3]>0)
        if dst is None: o[m,3]=0
        else: o[m,:3]=dst
    return o

def mask_of(f,cols):
    m=np.zeros(f.shape[:2],bool)
    for c in cols: m|=(f[...,0]==c[0])&(f[...,1]==c[1])&(f[...,2]==c[2])&(f[...,3]>0)
    return m

def dilate(m,n=1,diag=True):
    for _ in range(n):
        o=m.copy()
        o[1:]|=m[:-1]; o[:-1]|=m[1:]; o[:,1:]|=m[:,:-1]; o[:,:-1]|=m[:,1:]
        if diag:
            o[1:,1:]|=m[:-1,:-1]; o[:-1,:-1]|=m[1:,1:]; o[1:,:-1]|=m[:-1,1:]; o[:-1,1:]|=m[1:,:-1]
        m=o
    return m

def put(layer,x,y,col,a=255):
    h,w=layer.shape[:2]
    x,y=int(round(x)),int(round(y))
    if 0<=x<w and 0<=y<h:
        # alpha-over onto layer
        sa=a/255; da=layer[y,x,3]/255
        oa=sa+da*(1-sa)
        if oa<=0: return
        for k in range(3): layer[y,x,k]=(col[k]*sa+layer[y,x,k]*da*(1-sa))/oa
        layer[y,x,3]=oa*255

def over(dst,src):
    """alpha composite src over dst (float arrays)"""
    sa=src[...,3:4]/255; da=dst[...,3:4]/255
    oa=sa+da*(1-sa)
    rgb=np.where(oa>0,(src[...,:3]*sa+dst[...,:3]*da*(1-sa))/np.maximum(oa,1e-6),0)
    return np.concatenate([rgb,oa*255],-1)

def halo(shape,cx,cy,r,i,alpha=1.0,rays=True,cross=True,cut=0.35):
    L=np.zeros(shape[:2]+(4,),float)
    h,w=shape[:2]
    R=int(r+4)
    for y in range(int(cy-R),int(cy+R)+1):
        for x in range(int(cx-R),int(cx+R)+1):
            d=math.hypot(x-cx,y-cy)
            if y>cy+r*cut: continue
            if abs(d-r)<0.75:
                ang=math.atan2(y-cy,x-cx)
                # shimmer: a bright spot travelling round the ring
                sh=math.cos(ang-(i*0.9))
                col=G[0] if sh>0.85 else (G[1] if y<=cy else G[2])
                put(L,x,y,col,255*alpha)
            elif r-0.75-1<=d<r-0.75 and y<cy:
                put(L,x,y,G[3],170*alpha)
    if rays:
        for k in range(8):
            ang=-math.pi/2+k*math.pi/4
            if k in (3,4,5): continue   # no rays under the chin
            ln=2 if k%2==0 else 1
            if k==0: continue
            if (k+i)%4==0: ln+=1
            for t in range(1,ln+1):
                put(L,cx+math.cos(ang)*(r+t),cy+math.sin(ang)*(r+t),G[1] if t==1 else G[0],255*alpha*(1 if t<ln else .75))
    if cross:
        tx,ty=round(cx),round(cy-r)
        for t in range(2,6): put(L,tx,ty-t,WARM if t==4 else G[1],255*alpha)
        put(L,tx-1,ty-4,G[1],255*alpha); put(L,tx+1,ty-4,G[1],255*alpha)
    return L

def aura(f,alpha=1.0):
    a=f[...,3]>0
    r1=dilate(a,1,False)&~a
    r2=dilate(a,2,True)&~a&~r1
    L=np.zeros(f.shape[:2]+(4,),float)
    L[r1]=(255,232,140,int(50*alpha))
    return L

def sparkles(shape,bbox,i,n,seed,alpha=1.0):
    L=np.zeros(shape[:2]+(4,),float)
    x0,y0,x1,y1=bbox
    rng=np.random.RandomState(seed)
    for k in range(n):
        px=rng.uniform(x0-3,x1+3); py=rng.uniform(y0-2,y1-4); ph=rng.randint(0,6); drift=rng.uniform(0.6,1.4)
        t=(i+ph)%6
        y=py-t*drift
        if t in (0,5): put(L,px,y,G[1],160*alpha)
        elif t in (1,4): put(L,px,y,WARM,230*alpha); 
        else:
            put(L,px,y,WARM,255*alpha)
            for dx,dy in((1,0),(-1,0),(0,1),(0,-1)): put(L,px+dx,y+dy,G[1],200*alpha)
            if t==3:
                for dx,dy in((2,0),(-2,0),(0,2),(0,-2)): put(L,px+dx,y+dy,G[0],110*alpha)
    return L

def bbox_of(f):
    ys,xs=np.where(f[...,3]>0)
    if len(xs)==0: return (0,0,1,1)
    return xs.min(),ys.min(),xs.max(),ys.max()
