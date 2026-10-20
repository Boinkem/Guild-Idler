import numpy as np, math
from paladin import mask_of, dilate, put, over

# the default packs' own palette
STEEL=[(199,207,221),(146,161,185),(101,115,146),(66,76,110),(42,47,78)]
GOLD=[(255,200,37),(255,162,20),(237,118,20)]
RED=[(234,50,60),(196,36,48),(137,30,43),(87,28,39)]
KRED=[(198,69,36),(142,37,29)]
WHITE=(255,255,255)
OUT=(27,27,27)
OUTS=[(27,27,27),(19,19,19),(15,15,15)]

def outline_new(o,newmask):
    """outline transparent pixels touching newly added pixels"""
    edge=dilate(newmask,1,False)&(o[...,3]==0)
    o[edge]=(*OUT,255)
    return o

def gold_rims(o,f,cols,top_only=True,ymax=None,ymin=0):
    """armour pixels whose upper neighbour is outline/air -> gold rim (rows ymin..ymax)"""
    m=mask_of(f,cols)
    yy=np.mgrid[:f.shape[0],:f.shape[1]][0]
    m&=(yy>=ymin)&(yy<=(ymax if ymax is not None else f.shape[0]))
    air=(f[...,3]==0)|mask_of(f,OUTS)
    up=np.zeros_like(m); up[1:]=air[:-1]
    rim=m&up
    if not top_only:
        side=np.zeros_like(m); side[:,1:]|=air[:,:-1]; side[:,:-1]|=air[:,1:]; rim|=m&side
    light=mask_of(f,cols[:1])
    o[rim]=(*GOLD[1],255); o[rim&light]=(*GOLD[0],255)
    return o

def crown(o,cx,ty,w,i,n,gem=True,spikes=3):
    """gold circlet (2 rows) with spikes and a red gem, drawn on top of the head"""
    H,W=o.shape[:2]
    pts={}
    x0=int(round(cx-w/2)); x1=int(round(cx+w/2)); ty=int(round(ty))
    for x in range(x0,x1+1): pts[(x,ty)]=GOLD[1]; pts[(x,ty+1)]=GOLD[2]
    sp=[round(x0+(x1-x0)*k/(spikes-1)) for k in range(spikes)] if spikes>1 else [round(cx)]
    for k,sx in enumerate(sp):
        hgt=3 if (spikes%2==1 and k==spikes//2) else 2
        for t in range(1,hgt+1): pts[(sx,ty-t)]=GOLD[0] if t==hgt else GOLD[1]
    if gem:
        glint=math.sin(2*math.pi*i/n)>0.6
        gx=int(round(cx)); pts[(gx,ty)]=RED[0] if glint else RED[1]; pts[(gx,ty+1)]=RED[2]
    for (x,y) in list(pts):
        for dx,dy in ((1,0),(-1,0),(0,-1)):
            q=(x+dx,y+dy)
            if q not in pts and 0<=q[0]<W and 0<=q[1]<H and o[q[1],q[0],3]==0: o[q[1],q[0]]=(*OUT,255)
    for (x,y),c in pts.items():
        if 0<=x<W and 0<=y<H: o[y,x]=(*c,255)
    return o

def extend_down(o,f,mask,length,ground,hem=True):
    """lengthen cloth: each column's lowest cloth pixel continues down over air"""
    H,W=o.shape[:2]; new=np.zeros((H,W),bool)
    cols=np.where(mask.any(0))[0]
    for x in cols:
        ys=np.where(mask[:,x])[0]; yb=ys.max()
        below=yb+1
        # skip the outline pixel under the hem
        if below<H and (o[below,x,3]>0 and tuple(o[below,x,:3]) in OUTS): below+=0
        c=o[yb,x,:3].copy(); c2=o[max(yb-1,ys.min()),x,:3].copy()
        for k in range(length):
            y=yb+1+k
            if y>=min(H,ground): break
            if f[y,x,3]>0 and tuple(f[y,x,:3]) not in OUTS: break
            o[y,x]=(*(c if k%3!=2 else c2),255); new[y,x]=True
    # hem = lowest new pixel per column
    if hem:
        for x in np.where(new.any(0))[0]:
            yb=np.where(new[:,x])[0].max(); o[yb,x,:3]=GOLD[1]
    o=outline_new(o,new)
    return o,new

def back_cape(shape,sx,sy,dirx,length,width,i,n,cols=None,hem=True):
    """a cape hung from the shoulder (sx,sy): narrow at the top, widening and trailing
    away from the facing direction (dirx), vertical folds, waving gold hem. Drawn behind."""
    cols=cols or [RED[1],RED[2],RED[3]]
    L=np.zeros(shape[:2]+(4,),float); H,W=shape[:2]
    m=np.zeros((H,W),bool); fold=np.zeros((H,W),int)
    length=int(max(3,length))
    for k in range(length+1):
        t=k/length
        sway=1.4*math.sin(2*math.pi*i/n+t*2.5)*t
        back=width*(0.25+0.75*t**0.8)+sway
        front=width*0.35*min(1,t*3)
        y=int(round(sy+k))
        x0=sx-dirx*front; x1=sx+dirx*back
        lo,hi=sorted((x0,x1))
        for x in range(int(math.floor(lo)),int(math.ceil(hi))+1):
            if 0<=x<W and 0<=y<H:
                m[y,x]=True
                d=(x-sx)*dirx
                fold[y,x]=int((d+1.5*math.sin(t*3))//3)
    if not m.any(): return L
    ys,xs=np.where(m)
    # ragged/waving hem: trim each column's bottom by 0-1 px
    for x in np.unique(xs):
        col=ys[xs==x]; yb=col.max()
        cut=int(round(0.5+0.5*math.sin(x*0.9+2*math.pi*i/n)))
        for c in range(cut): m[yb-c,x]=False
    ys,xs=np.where(m)
    for y,x in zip(ys,xs):
        fo=fold[y,x]
        L[y,x]=(*cols[0 if fo%2==0 else 1],255)
        if (x-sx)*dirx>width*0.9: L[y,x]=(*cols[1 if fo%2==0 else 2],255)
    if hem:
        for x in np.unique(xs):
            yb=ys[xs==x].max(); L[yb,x]=(*GOLD[1],255)
            if m[yb-1,x] if yb>0 else False: L[yb-1,x]=(*GOLD[2],255)
    edge=dilate(m,1,False)&~m
    L[edge]=(*OUT,255)
    return L

def pauldron(o,cx,cy,rx,ry,i,n):
    """domed steel shoulder plate with two gold-edged lames beneath, drawn over the sprite"""
    H,W=o.shape[:2]; pts={}
    for y in range(int(math.floor(cy-ry)),int(cy)+1):           # dome (top half-ellipse)
        for x in range(int(cx-rx)-1,int(cx+rx)+2):
            d=((x-cx)/rx)**2+((y-cy)/ry)**2
            if d<=1.0:
                hl=(x-cx)/rx+(y-cy)/ry*1.2
                pts[(x,y)]=STEEL[0] if hl<-0.7 else (STEEL[1] if hl<0.35 else STEEL[2])
                if d>0.72 and y<cy-ry*0.3: pts[(x,y)]=GOLD[1]
    for k in range(2):                                           # lames
        w=rx*(0.95-0.18*k); y=int(cy)+1+k*2
        for x in range(int(round(cx-w)),int(round(cx+w))+1):
            pts[(x,y)]=STEEL[1] if k==0 else STEEL[2]
            pts[(x,y+1)]=GOLD[1] if k==0 else GOLD[2]
    for (x,y) in list(pts):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            q=(x+dx,y+dy)
            if q not in pts and 0<=q[0]<W and 0<=q[1]<H: o[q[1],q[0]]=(*OUT,255)
    for (x,y),c in pts.items():
        if 0<=x<W and 0<=y<H: o[y,x]=(*c,255)
    return o

def quilt(o,region,base=None,trim=True):
    """padded gambeson over a region: red cloth with diamond stitching and a gold edge"""
    base=base or RED
    ys,xs=np.where(region)
    for y,x in zip(ys,xs):
        s=((x+y)%4==0) or ((x-y)%4==0)
        o[y,x,:3]=base[3] if s else (base[1] if (x+y)%8<4 else base[2])
    if trim:
        edge=region&dilate(~region,1,False)
        o[edge]=(*GOLD[1],255)
    return o

def strap(o,allow,p0,p1,width=2,col=(93,44,40),stud=True):
    H,W=o.shape[:2]
    n=int(max(abs(p1[0]-p0[0]),abs(p1[1]-p0[1])))+1
    for k in range(n):
        t=k/max(1,n-1); x=p0[0]+(p1[0]-p0[0])*t; y=p0[1]+(p1[1]-p0[1])*t
        for j in range(width):
            X,Y=int(round(x)),int(round(y+j))
            if 0<=X<W and 0<=Y<H and allow[Y,X]:
                o[Y,X,:3]=(GOLD[0] if stud and k%4==1 and j==0 else (col if j else (138,72,54)))
    return o

def headband(o,cx,y,w,i,n,dirx,tail=10,cols=(RED[1],RED[3]),under=None):
    """Kiriko-style band across the forehead, knotted at the back, two thin ribbons
    trailing behind (one higher, one drooping), white tips, waving on a loop"""
    H,W=o.shape[:2]
    xs=range(int(round(cx-w/2)),int(round(cx+w/2))+1)
    for x in xs:
        if 0<=x<W and 0<=y<H and o[y,x,3]>0 and tuple(o[y,x,:3]) not in OUTS: o[y,x,:3]=cols[0]
        if 0<=x<W and 0<=y+1<H and o[y+1,x,3]>0 and tuple(o[y+1,x,:3]) not in OUTS: o[y+1,x,:3]=cols[1]
    L=np.zeros(o.shape[:2]+(4,),float)
    kx=cx-dirx*(w/2+0.5); ky=y+0.5
    put(L,kx,ky,RED[0],255); put(L,kx-dirx,ky+1,RED[1],255)
    for r,(ph,droop,ln) in enumerate(((0.0,0.18,1.0),(1.9,0.55,0.8))):
        steps=int(tail*ln*3)
        for s_ in range(1,steps+1):
            t=s_/steps
            x=kx-dirx*tail*ln*t
            yy=ky+droop*tail*ln*t+1.3*math.sin(2*math.pi*i/n+t*5+ph)*t+r
            put(L,x,yy,WHITE if t>0.88 else (RED[0] if s_%3 else RED[1]),255)
    a=L[...,3]>0; e=dilate(a,1,False)&~a; L[e]=(*OUT,170)
    return L

def grow_region(o,f,region,steps,colfn,limit=None):
    """enlarge a cloth/hair region through its own outline into the air around it"""
    air=f[...,3]==0
    outl=mask_of(f,OUTS)
    body=(f[...,3]>0)&~outl&~region
    cand=dilate(region,steps,True)&(air|outl)&~dilate(body,1,True)
    if limit is not None: cand&=limit
    ys,xs=np.where(cand)
    for y,x in zip(ys,xs): o[y,x]=(*colfn(x,y),255)
    o=outline_new(o,cand)
    return o,cand
