import numpy as np, math
from paladin import mask_of, dilate, put, over

VD=[(104,96,118),(72,66,86),(50,45,62),(34,30,44),(20,18,28)]        # void plate
VG=[(255,214,255),(238,128,255),(192,72,236),(128,40,178),(76,22,110)] # violet glow
TN=[(170,74,214),(124,46,168),(84,28,120),(50,16,78)]                  # tendril purple
EYE=(255,72,112)
OUTL=(12,8,18)

def glow_col(i,n,x,y):
    p=0.5+0.5*math.sin(2*math.pi*(i/n)+(x*0.6+y*0.5))
    return VG[2] if p>0.5 else VG[3]

def pulse(o,mask,i,n):
    ys,xs=np.where(mask)
    for y,x in zip(ys,xs): o[y,x,:3]=glow_col(i,n,x,y)
    return o

def tendrils(shape,ox,oy,dirx,length,count,i,n,spread,width=2.0,seed=1,span=None,angles=(-0.35,0.9)):
    """writhing hair-like tentacles rooted along the back (ox, oy..oy+span), streaming
    towards dirx (-1 = left) and drooping; loops cleanly over n frames"""
    L=np.zeros(shape[:2]+(4,),float)
    rng=np.random.RandomState(seed)
    span=length*0.5 if span is None else span
    for k in range(count):
        f=k/max(1,count-1)
        ang=angles[0]+(angles[1]-angles[0])*f + rng.uniform(-0.12,0.12)
        rx=ox-dirx*rng.uniform(0,1.5); ry=oy+span*f
        ln=length*rng.uniform(0.75,1.1)*(1.0-0.25*f); ph=rng.uniform(0,6.28)
        amp=length*0.14*rng.uniform(0.8,1.3)
        steps=int(ln*4)+2
        for s_ in range(steps+1):
            t=s_/steps
            bx=rx+dirx*math.cos(ang)*ln*t
            by=ry+math.sin(ang)*ln*t + ln*0.18*t*t
            wav=amp*math.sin(2*math.pi*(i/n)+t*6.5+ph)*(0.25+t)
            x=bx; y=by+wav
            w=max(1.0,width*(1-t*0.8))
            col=TN[3] if t<0.15 else (TN[2] if t<0.45 else (TN[1] if t<0.8 else TN[0]))
            a=255 if t<0.8 else 255*(1-(t-0.8)/0.2*0.5)
            r=w/2
            for yy in range(int(math.floor(y-r)),int(math.ceil(y+r))+1):
                for xx in range(int(math.floor(x-r)),int(math.ceil(x+r))+1):
                    d=math.hypot(xx-x,yy-y)
                    if d<=r+0.25:
                        c=col if d<r*0.55 or r<1 else (TN[min(3,TN.index(col)+1)])
                        if 0<=yy<L.shape[0] and 0<=xx<L.shape[1] and L[yy,xx,3]<a: L[yy,xx]=(*c,a)
            if abs(((i/n)+ph/6.28)%1.0-t)<0.05: put(L,x,y,VG[1],220)
    a=L[...,3]>0
    rim=dilate(a,1,False)&~a
    L[rim]=(*OUTL,140)
    return L

def third_eye(o,x,y,i,n,big=False):
    H,W=o.shape[:2]
    def p(x_,y_,c):
        if 0<=x_<W and 0<=y_<H and o[y_,x_,3]>0: o[y_,x_,:3]=c
    x,y=int(round(x)),int(round(y))
    open_=math.sin(2*math.pi*i/n)>-0.85
    p(x-1,y,VG[1]); p(x+1,y,VG[1]); p(x,y-1,VG[2]); p(x,y+1,VG[2])
    p(x,y,EYE if open_ else VG[3])
    if big:
        p(x-2,y,VG[2]); p(x+2,y,VG[2]); p(x-1,y-1,VG[3]); p(x+1,y-1,VG[3]); p(x-1,y+1,VG[3]); p(x+1,y+1,VG[3])
    return o

def aura(f,alpha=1.0):
    a=f[...,3]>0
    r1=dilate(a,1,False)&~a
    L=np.zeros(f.shape[:2]+(4,),float)
    L[r1]=(190,80,255,int(42*alpha))
    return L

def motes(shape,bbox,i,n,count,seed):
    L=np.zeros(shape[:2]+(4,),float)
    x0,y0,x1,y1=bbox
    rng=np.random.RandomState(seed)
    for k in range(count):
        cx=rng.uniform(x0-4,x1+4); cy=rng.uniform(y0,y1); r=rng.uniform(2,5); off=rng.uniform(0,1)
        t=(i/n+off)%1.0
        x=cx+r*math.cos(2*math.pi*t); y=cy+r*0.6*math.sin(2*math.pi*t)-t*3
        bright=math.sin(math.pi*t)
        put(L,x,y,VG[1] if bright>0.7 else VG[3],255*(0.35+0.65*bright))
        if bright>0.9:
            for dx,dy in((1,0),(-1,0),(0,1),(0,-1)): put(L,x+dx,y+dy,VG[2],140)
    return L

def visor_bars(o,facemask,i,n):
    ys,xs=np.where(facemask)
    if len(xs)<3: return o
    x0=xs.min()
    g=VG[1] if math.sin(2*math.pi*i/n)>-0.4 else VG[2]
    for y,x in zip(ys,xs):
        o[y,x,:3]=g if (x-x0)%2==0 else VD[4]
    return o
