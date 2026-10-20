import numpy as np, math
from paladin import mask_of, dilate
from asc import *

SH=[(93,44,40),(87,28,39),(57,31,33)]

def knight_pre(f,head,i,anim,n):
    hx,hy,hw,hh=head
    o=f.copy(); H,W=f.shape[:2]
    yy,xx=np.mgrid[:H,:W]
    red=mask_of(f,KRED)
    # fuller plume: grow the plume up/back by a pixel
    plume=red&(yy<hy+8)&(xx<=hx+hw//2+1)
    o,_=grow_region(o,f,plume,2,lambda x,y: KRED[0] if (x+y)%3 else KRED[1],limit=(yy<hy+8))
    # longer cape (not plume, not the neck scarf)
    cape=red&(yy>=hy+hh+1)
    ground=int(np.where(f[...,3]>0)[0].max())
    o,_=extend_down(o,f,cape,5,ground)
    return o

def knight_post(o,f,head,i,anim,n):
    hx,hy,hw,hh=head
    from scipy import ndimage
    o=gold_rims(o,f,STEEL[:3],ymin=hy,ymax=hy+hh+7)
    # silver shield, gold rim, red star
    sh=mask_of(f,SH); st=mask_of(f,STEEL)
    for src,dst in zip(SH,[STEEL[0],STEEL[1],STEEL[2]]): o[mask_of(f,[src])]=(*dst,255)
    rim=st&dilate(sh,1,False); o[rim]=(*GOLD[1],255)
    lab,k=ndimage.label(sh)
    for j in range(1,k+1):
        ys,xs=np.where(lab==j)
        if len(xs)<14: continue
        x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
        if x1-x0<3 or y1-y0<6: continue
        cx=(x0+x1+1)//2; cy=(y0+y1)//2
        for dy in range(-2,3):
            if lab[cy+dy,cx]==j: o[cy+dy,cx,:3]=RED[1]
        for dx in (-1,1):
            if lab[cy,cx+dx]==j: o[cy,cx+dx,:3]=RED[1]
        o[cy,cx,:3]=RED[0]
    o=crown(o,hx+hw/2+0.5,hy+1,hw*0.62,i,n)
    return o

ACLASSES={
 'knight':dict(pre=knight_pre,post=knight_post),
}

SKIN=[(246,202,159),(230,156,105),(249,230,207),(244,201,156)]
def band(f,head,y0,y1,x0,x1):
    hx,hy,hw,hh=head; H,W=f.shape[:2]
    yy,xx=np.mgrid[:H,:W]
    return (yy>=hy+y0)&(yy<hy+y1)&(xx>=hx+x0)&(xx<hx+x1)
def ground_of(f): return int(np.where(f[...,3]>0)[0].max())

def cape_layer(dx,dy,length=None,width=8,cols=None,to_ground=True,anchor_top=False):
    """behind-layer: new cape from a shoulder point (head-relative), flaring away from facing.
    anchor_top: hang it from the top of the body at that x instead (for hunched/crawling poses)"""
    def lay(o,f,head,i,a,n,fl):
        hx,hy,hw,hh=head
        dirx=1 if fl else -1
        sx=hx+hw/2+(-dx if fl else dx); sy=hy+hh+dy
        if anchor_top:
            xi=int(min(max(sx,0),f.shape[1]-1)); col=np.where(f[:,xi,3]>0)[0]
            if len(col): sy=col.min()+2
        ln=(ground_of(f)-sy-1) if to_ground and length is None else length
        return back_cape(o.shape,sx,sy,dirx,ln,width,i,n,cols)
    return lay
def crown_post(dy,wf,spikes=3,dx=0):
    def p(o,f,head,i,a,n):
        hx,hy,hw,hh=head
        return crown(o,hx+hw/2+dx,hy+dy,hw*wf,i,n,spikes=spikes)
    return p
def rims_post(cols,y0,y1):
    def p(o,f,head,i,a,n):
        hx,hy,hw,hh=head
        return gold_rims(o,f,cols,ymin=hy+y0,ymax=hy+hh+y1)
    return p
def extend_post(cols,length,ymin_rel=None):
    def p(o,f,head,i,a,n):
        hx,hy,hw,hh=head
        m=mask_of(f,cols)
        if ymin_rel is not None: m&=np.mgrid[:f.shape[0],:f.shape[1]][0]>=hy+ymin_rel
        o,_=extend_down(o,f,m,length,ground_of(f)); return o
    return p
def quilt_post(y0,y1,x0,x1,cols=SKIN):
    def p(o,f,head,i,a,n):
        reg=mask_of(f,cols)&band(f,head,y0,y1,x0,x1)
        if reg.sum()>6: o=quilt(o,reg)
        return o
    return p
def chain(*ps):
    def p(o,f,head,i,a,n):
        for q in ps: o=q(o,f,head,i,a,n)
        return o
    return p

def samurai_band(o,f,head,i,a,n,fl):
    hx,hy,hw,hh=head
    dirx=-1 if fl else 1
    return headband(o,int(round(hx+hw/2+1)),hy+1,hw-2,i,n,dirx,tail=12)

def centaur_post(o,f,head,i,a,n):
    hx,hy,hw,hh=head; H,W=f.shape[:2]
    yy,xx=np.mgrid[:H,:W]
    horse=mask_of(f,[(191,111,74),(138,72,54),(93,44,40),(57,31,33)])&((yy>=hy+27)|((yy>=hy+17)&(xx<hx-3)))
    bard=np.zeros_like(horse)
    for x in np.where(horse.any(0))[0]:
        ys=np.where(horse[:,x])[0]; top=ys.min()
        if top>hy+hh+14: continue    # legs only, no back here
        bard[top:top+6,x]=horse[top:top+6,x]
    if bard.sum()>8:
        o=quilt(o,bard)
    o=quilt_post(1,13,-5,hw-2)(o,f,head,i,a,n)
    return o

def minotaur_post(o,f,head,i,a,n):
    hx,hy,hw,hh=head; H,W=f.shape[:2]
    yy=np.mgrid[:H,:W][0]
    # gold horn tips: horn pixels (white/steel) above the brow
    horn=mask_of(f,[(255,255,255),(199,207,221),(146,161,185)])&(yy<hy+6)&band(f,head,-12,6,-12,hw+12)
    o[horn&mask_of(f,[(255,255,255),(199,207,221)])]=(*GOLD[0],255); o[horn&mask_of(f,[(146,161,185)])]=(*GOLD[1],255)
    allow=mask_of(f,[(191,111,74),(230,156,105),(138,72,54),(93,44,40),(57,31,33)])
    o=strap(o,allow,(hx+hw-2,hy+hh+2),(hx-6,hy+hh+26),width=3)
    return o

def werewolf_post(o,f,head,i,a,n):
    hx,hy,hw,hh=head
    # steel collar with gold rim and studs at the neck
    reg=(f[...,3]>0)&~mask_of(f,OUTS)&band(f,head,hh-2,hh+2,-10,8)
    ys,xs=np.where(reg)
    for y,x in zip(ys,xs):
        r=y-(hy+hh-2)
        o[y,x,:3]=GOLD[1] if r==0 else (STEEL[0] if r==1 else (STEEL[1] if r==2 else GOLD[2]))
        if r==1 and x%4==0: o[y,x,:3]=GOLD[0]
    return o

ACLASSES.update({
 'huge_knight':dict(post=chain(rims_post(STEEL[:3],0,30),crown_post(3,0.75,spikes=5)),
    pre=lambda f,head,i,a,n: grow_region(f.copy(),f,mask_of(f,[(196,34,47),(137,27,41),(87,25,37)])&band(f,head,-12,8,-30,30),3,lambda x,y:(196,34,47) if (x+y)%3 else (137,27,41))[0],
    behind=[cape_layer(-8,4,width=26)]),
 'adventurer':dict(post=chain(rims_post([(214,235,255),(203,219,252),(165,174,234)],0,20),
    extend_post([(217,87,99),(171,67,67),(173,59,59),(143,50,50)],4,ymin_rel=12))),
 'gladiator':dict(post=chain(rims_post(STEEL[:3],-4,2),quilt_post(11,16,-6,8,[(230,156,105),(191,111,74),(138,72,54)])),
    behind=[cape_layer(-3,0,width=7)]),
 'samurai':dict(front=[samurai_band],post=rims_post([(199,207,221)],8,4)),
 'witch':dict(post=chain(crown_post(5,0.55,spikes=3,dx=-1),rims_post([(147,56,143),(98,36,97)],10,16))),
 'pyromancer':dict(post=chain(rims_post([(234,50,60),(196,36,48)],-2,4),rims_post(STEEL[:3],8,24),extend_post([(196,36,48),(137,30,43),(87,28,39),(234,50,60)],3,ymin_rel=30))),
 'wizard':dict(behind=[cape_layer(4,-2,width=14,cols=[(0,105,170),(0,57,109),(3,25,63)])],
    post=extend_post([(255,255,255),(253,253,255),(206,214,255)],3,ymin_rel=14)),
 'dwarf':dict(post=chain(rims_post(STEEL[:3],0,12),crown_post(2,0.62,spikes=3),extend_post([(196,36,48),(137,30,43),(87,28,39)],4,ymin_rel=14))),
 'kobold':dict(behind=[cape_layer(-2,2,width=14)],post=crown_post(4,0.42,spikes=3,dx=3)),
 'lizardman':dict(post=quilt_post(2,22,-8,9),behind=[cape_layer(-1,3,width=14)]),
 'minotaur':dict(post=minotaur_post,behind=[cape_layer(-4,4,width=24)]),
 'werewolf':dict(post=werewolf_post,behind=[cape_layer(-6,2,width=24)]),
 'centaur':dict(post=centaur_post),
})

def pauldron_post(dx,dy,rx,ry):
    def p(o,f,head,i,a,n):
        hx,hy,hw,hh=head
        return pauldron(o,hx+hw/2+dx,hy+hh/2+dy,rx,ry,i,n)
    return p
ACLASSES['werewolf']['post']=pauldron_post(-12,20,7,5)
ACLASSES['minotaur']['post']=chain(minotaur_post,pauldron_post(13,22,7,5))
ACLASSES['lizardman']['post']=chain(quilt_post(2,22,-8,9),pauldron_post(-4,19,4,3))
ACLASSES['adventurer']['post']=chain(rims_post([(214,235,255),(203,219,252),(165,174,234)],0,20),
    extend_post([(217,87,99),(171,67,67),(173,59,59),(143,50,50)],6,ymin_rel=12),pauldron_post(-4,11,3,2))
ACLASSES['kobold']['post']=chain(crown_post(4,0.42,spikes=3,dx=3),pauldron_post(-7,22,5,4))

ACLASSES['werewolf']['behind']=[cape_layer(-20,0,width=22)]
ACLASSES['werewolf']['post']=pauldron_post(-14,16,7,4)
ACLASSES['minotaur']['post']=chain(minotaur_post,pauldron_post(14,18,7,4))
ACLASSES['lizardman']['post']=chain(quilt_post(18,38,-8,9),pauldron_post(-10,14,4,3))
ACLASSES['kobold']['post']=pauldron_post(-8,19,5,3)
ACLASSES['wizard']['behind']=[cape_layer(6,-2,width=18,cols=[(0,105,170),(0,57,109),(3,25,63)])]
_c=centaur_post
def centaur_post2(o,f,head,i,a,n):
    hx,hy,hw,hh=head; H,W=f.shape[:2]
    yy,xx=np.mgrid[:H,:W]
    horse=mask_of(f,[(191,111,74),(138,72,54),(93,44,40),(57,31,33)])&((yy>=hy+27)|((yy>=hy+17)&(xx<hx-3)))
    bard=np.zeros_like(horse)
    for x in np.where(horse.any(0))[0]:
        ys=np.where(horse[:,x])[0]; top=ys.min()
        if top>hy+hh+14: continue
        bard[top:top+6,x]=horse[top:top+6,x]
    if bard.sum()>8: o=quilt(o,bard)
    return quilt_post(hh+1,hh+13,-5,hw-2)(o,f,head,i,a,n)
ACLASSES['centaur']['post']=centaur_post2
ACLASSES['werewolf']['behind']=[cape_layer(-26,-9,width=30)]
def centaur_post3(o,f,head,i,a,n):
    hx,hy,hw,hh=head; H,W=f.shape[:2]
    yy,xx=np.mgrid[:H,:W]
    horse=mask_of(f,[(191,111,74),(138,72,54),(93,44,40),(57,31,33)])&((yy>=hy+27)|((yy>=hy+17)&(xx<hx-3)))
    bard=np.zeros_like(horse)
    for x in np.where(horse.any(0))[0]:
        ys=np.where(horse[:,x])[0]; top=ys.min()
        if top>hy+hh+14: continue
        bard[top:top+6,x]=horse[top:top+6,x]
    if bard.sum()>8: o=quilt(o,bard)
    return pauldron_post(-4,11,4,3)(o,f,head,i,a,n)
ACLASSES['centaur']['post']=centaur_post3
ACLASSES['pyromancer']['post']=chain(ACLASSES['pyromancer']['post'],pauldron_post(-9,12,5,3))
def _cent(o,f,head,i,a,n):
    hx,hy,hw,hh=head; H,W=f.shape[:2]
    yy,xx=np.mgrid[:H,:W]
    horse=mask_of(f,[(191,111,74),(138,72,54),(93,44,40),(57,31,33)])&((yy>=hy+27)|((yy>=hy+17)&(xx<hx-3)))
    bard=np.zeros_like(horse)
    for x in np.where(horse.any(0))[0]:
        ys=np.where(horse[:,x])[0]; top=ys.min()
        if top>hy+hh+14: continue
        bard[top:top+6,x]=horse[top:top+6,x]
    if bard.sum()>8: o=quilt(o,bard)
    return pauldron_post(-9,9,4,3)(o,f,head,i,a,n)
ACLASSES['centaur']['post']=_cent
ACLASSES['werewolf']['behind']=[cape_layer(-26,-9,length=24,width=30,to_ground=False)]
ACLASSES['werewolf']['behind']=[cape_layer(-26,-9,length=24,width=30,to_ground=False,anchor_top=True)]
