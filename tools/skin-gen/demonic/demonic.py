import numpy as np, math
from paladin import remap, mask_of, dilate, put, over, bbox_of

CH=[(128,118,122),(90,82,90),(62,56,66),(42,38,46),(26,23,29)]      # charred iron
LV=[(255,236,160),(255,184,56),(246,112,28),(196,54,20),(122,26,16)] # lava
RD=[(232,74,40),(182,38,28),(124,22,24),(72,14,18)]                 # demon red
OUTL=(14,10,12)

def seam_col(i,n,x,y):
    # pulsing molten seams; loops cleanly over n frames
    p=0.5+0.5*math.sin(2*math.pi*(i/n)+ (x*0.7+y*0.45))
    return LV[2] if p>0.55 else LV[3]

def pulse_seams(o,mask,i,n):
    ys,xs=np.where(mask)
    for y,x in zip(ys,xs): o[y,x,:3]=seam_col(i,n,x,y)
    return o

def horns(shape,cx,ty,half,size,i,n,flip=False,thick=None):
    """two thick demon horns: out-and-up from (cx+-half, ty), tips curling inward. RGBA layer"""
    L=np.zeros(shape[:2]+(4,),float)
    base_w=thick or max(2,round(size*0.38))
    H,W=shape[:2]
    cols={}
    for side in (-1,1):
        bx=cx+side*half
        steps=int(size*4)+2
        for k in range(steps+1):
            t=k/steps
            out=size*0.42*(1-(1-min(t/0.6,1))**2)          # sweep outward early
            hook=size*0.22*max(0,(t-0.7)/0.3)**1.5         # tip curls back in
            x=bx+side*(out-hook); y=ty-size*t
            w=max(1,base_w*(1-t)**0.8+0.4)
            for j in range(int(math.ceil(w))):
                px=int(round(x+side*(j-(w-1)/2))); py=int(round(y))
                outer=(j==int(math.ceil(w))-1) if side>0 else (j==0)
                if t>0.86: c=LV[1] if t<0.95 else LV[0]
                elif t>0.62: c=RD[0] if outer else LV[2]
                elif outer: c=RD[0]
                else: c=RD[1] if t>0.25 else RD[2]
                cols[(px,py)]=c
    for (x,y) in list(cols):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            q=(x+dx,y+dy)
            if q not in cols and 0<=q[0]<W and 0<=q[1]<H: L[q[1],q[0]]=(*OUTL,255)
    for (x,y),c in cols.items():
        if 0<=x<W and 0<=y<H: L[y,x]=(*c,255)
    return L

def aura(f,alpha=1.0):
    a=f[...,3]>0
    r1=dilate(a,1,False)&~a
    L=np.zeros(f.shape[:2]+(4,),float)
    L[r1]=(255,80,30,int(40*alpha))
    return L

def embers(shape,bbox,i,n,count,seed,alpha=1.0):
    L=np.zeros(shape[:2]+(4,),float)
    x0,y0,x1,y1=bbox
    rng=np.random.RandomState(seed)
    rise=(y1-y0)*0.9+6
    for k in range(count):
        bx=rng.uniform(x0,x1); off=rng.uniform(0,1); sway=rng.uniform(0.8,2.2); ph=rng.uniform(0,6.28)
        t=(i/n+off)%1.0
        y=y1-2-t*rise; x=bx+math.sin(ph+t*6.28)*sway
        col=LV[0] if t<0.25 else (LV[1] if t<0.5 else (LV[2] if t<0.75 else LV[3]))
        a=255*alpha*(1-t*0.7)
        put(L,x,y,col,a)
        if t<0.3: put(L,x,y+1,LV[2],a*0.5)
    return L

_CRACKS={}
def crack_map(key,w,h,count,seed):
    """jagged crack polylines in head-relative space, generated once per class"""
    if key in _CRACKS: return _CRACKS[key]
    rng=np.random.RandomState(seed); pts=set()
    for _ in range(count):
        x=rng.randint(-w,w); y=rng.randint(0,h)
        L=rng.randint(3,7); dx=rng.choice([-1,1])
        for _ in range(L):
            pts.add((x,y))
            if rng.rand()<0.55: y+=1
            else: x+=dx
            if rng.rand()<0.2: pts.add((x+dx,y))
    _CRACKS[key]=pts; return pts

def apply_cracks(o,allow,head,key,span,count,i,n,seed=7):
    hx,hy,hw,hh=head; cx=hx+hw//2; top=hy+hh
    H,W=o.shape[:2]
    for (dx,dy) in crack_map(key,span[0],span[1],count,seed):
        x,y=cx+dx,top+dy
        if 0<=x<W and 0<=y<H and allow[y,x]:
            o[y,x,:3]=seam_col(i,n,x,y)
    return o

def t_visor(o,facemask,i,n):
    ys,xs=np.where(facemask)
    if len(xs)<3: return o
    y0=ys.min(); x0,x1=xs.min(),xs.max()
    row=[x for x in range(x0,x1+1) if facemask[y0,x]] or [x0]
    glow=LV[1] if math.sin(2*math.pi*i/n)>-0.5 else LV[2]
    for x in row: o[y0,x,:3]=glow
    cx=int(round(np.mean(row)))
    for y in range(y0+1,ys.max()+1):
        if facemask[y,cx]: o[y,cx,:3]=LV[2]
    return o
