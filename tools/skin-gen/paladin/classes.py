import numpy as np
from paladin import *

RED_L=(198,69,36); RED_D=(142,37,29)
SH=[(93,44,40),(87,28,39),(57,31,33)]
STEEL=[(199,207,221),(146,161,185),(101,115,146),(66,76,110),(42,47,78)]
OUTS=[(27,27,27),(19,19,19)]

def cleanup_removed(orig,o,removed):
    """after making `removed` transparent: re-outline exposed body, drop orphaned outline"""
    body=(o[...,3]>0)&~mask_of(o,OUTS)
    # orphan outline pixels: outline with no body neighbour (8-conn)
    outl=(o[...,3]>0)&mask_of(o,OUTS)
    orphan=outl&~dilate(body,1,True)
    o[orphan,3]=0
    # exposed body edges -> outline on the removed side
    edge=removed&dilate(body,1,False)&(o[...,3]==0)
    o[edge]=(27,27,27,255)
    return o

def knight_pre(f,head,i,anim):
    hx,hy,hw,hh=head
    o=f.copy()
    red=mask_of(f,[RED_L,RED_D])
    yy,xx=np.mgrid[:f.shape[0],:f.shape[1]]
    plume=(red&(yy<hy+7)&(xx<=hx+hw//2+1))|(red&(yy<hy+11)&(xx<hx+1))
    # also take any red connected strand above the helmet top
    plume|=red&(yy<hy+2)
    o[plume,3]=0
    o=cleanup_removed(f,o,plume)
    # scarf at the neck -> gold gorget (marked with sentinel colours, mapped later)
    neck=red&~plume&(yy>=hy+hh-3)&(yy<=hy+hh+2)&(xx>=hx+2)&(xx<=hx+hw)
    o[neck&mask_of(f,[RED_L])]=(1,2,3,255)
    o[neck&mask_of(f,[RED_D])]=(1,2,4,255)
    return o

def knight_post(o,f,head,i,anim):
    hx,hy,hw,hh=head
    # shield: gold rim + gold cross
    sh=mask_of(f,SH)
    st=mask_of(f,STEEL)
    rim=st&dilate(sh,1,False)
    o[rim&mask_of(f,[(199,207,221)])]=(*G[0],255)
    o[rim&mask_of(f,[(146,161,185)])]=(*G[1],255)
    o[rim&mask_of(f,[(101,115,146),(66,76,110),(42,47,78)])]=(*G[2],255)
    from scipy import ndimage
    lab,n=ndimage.label(sh)
    for k in range(1,n+1):
        ys,xs=np.where(lab==k)
        if len(xs)<14: continue
        x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
        if x1-x0<3 or y1-y0<6: continue
        cx=(x0+x1+1)//2; cy=y0+(y1-y0)//3+1
        for y in range(y0+2,y1-1):
            if lab[y,cx]==k: o[y,cx,:3]=G[1] if y!=cy else G[0]
        for x in range(x0+1,x1):
            if lab[cy,x]==k and x!=cx: o[cy,x,:3]=G[1]
    # gold pauldron on the near shoulder
    plate=mask_of(f,STEEL[:4])
    yy,xx=np.mgrid[:f.shape[0],:f.shape[1]]
    pc=((xx-(hx-0.5))**2+(yy-(hy+hh+3.5))**2)<=3.2**2
    for src,dst in zip(STEEL[:4],[G[0],G[1],G[2],G[3]]):
        o[pc&mask_of(f,[src])]=(*dst,255)
    # chest: blue cross on plate, below the helm
    cx=hx+hw//2-2; cy=hy+hh+4
    pts=[(cx,cy-1),(cx,cy),(cx,cy+1),(cx,cy+2),(cx-1,cy),(cx+1,cy)]
    plate=mask_of(f,STEEL[:3])
    if all(0<=y<f.shape[0] and 0<=x<f.shape[1] and plate[y,x] for x,y in pts):
        for x,y in pts: o[y,x,:3]=B[1]
        o[cy,cx,:3]=B[0]
    return o

CLASSES={
 'knight':dict(
   cmap={(199,207,221):P[0],(146,161,185):P[1],(101,115,146):P[2],(66,76,110):P[3],(42,47,78):P[4],(186,198,212):P[0],
         RED_L:C[0],RED_D:B[1],(93,44,40):B[1],(87,28,39):B[2],(57,31,33):B[3],
         (246,202,159):P[0],(230,156,105):P[1],(191,111,74):P[2],(0,152,220):(34,34,46),
         (255,255,255):WARM,(1,2,3):G[1],(1,2,4):G[2]},
   halo=dict(r=8,dx=-1,dy=-3.5),pre=knight_pre,post=knight_post,spark=3),
}

ST={ (199,207,221):P[0],(146,161,185):P[1],(101,115,146):P[2],(66,76,110):P[3],(42,47,78):P[4],(255,255,255):WARM }
STG={ (199,207,221):G[0],(146,161,185):G[1],(101,115,146):G[2],(66,76,110):G[3],(42,47,78):G[4],(255,255,255):WARM }
def mk(*ds):
    o={}
    for d in ds: o.update(d)
    return o

def centaur_pre(f,head,i,anim):
    hx,hy,hw,hh=head
    o=f.copy(); yy,xx=np.mgrid[:f.shape[0],:f.shape[1]]
    low=(yy>=hy+27)|((yy>=hy+17)&(xx<hx-3))
    for src,dst in [((191,111,74),(9,9,1)),((138,72,54),(9,9,2))]:
        o[low&mask_of(f,[src])]=(*dst,255)
    return o

CLASSES.update({
 'huge_knight':dict(cmap=mk(ST,{(250,254,253):WARM,(252,247,251):WARM,(255,245,255):WARM,
     (196,34,47):B[1],(137,27,41):B[2],(137,30,43):B[2],(87,25,37):B[3],(87,28,39):B[3]}),
   halo=dict(r=17,dx=-1,dy=-8),spark=5),
 'adventurer':dict(cmap={(217,87,99):B[0],(171,67,67):B[1],(173,59,59):B[1],(143,50,50):B[2],
     (132,126,135):C[1],(107,105,112):C[2],(89,86,82):C[3],(85,84,89):C[3],
     (58,69,66):B[3],(45,56,53):B[4],(46,57,54):B[4],
     (214,235,255):P[0],(203,219,252):P[0],(165,174,234):P[1],(155,173,183):P[1],(133,144,159):P[2],
     (235,198,89):G[0],(217,160,102):G[1],(179,153,50):G[2],(105,91,39):G[3],(82,64,30):G[4]},
   halo=dict(r=5.5,dx=0,dy=-2.5),spark=2),
 'gladiator':dict(cmap=mk(ST,{(0,105,170):B[1],(0,57,109):B[2],(12,46,68):B[3],
     (93,44,40):G[3],(88,56,40):G[3],(57,31,33):G[4],(87,28,39):B[3]}),
   halo=dict(r=6,dx=0,dy=-2),spark=2),
 'samurai':dict(cmap={(98,36,97):(250,226,140),(59,20,67):(204,150,66),
     (199,207,221):C[0],(146,161,185):C[1],(101,115,146):C[2],
     (66,76,110):B[1],(42,47,78):B[2],(26,25,50):B[3],
     (137,30,43):G[2],(87,28,39):G[3],(90,197,79):B[0],(255,255,255):WARM},
   halo=dict(r=7,dx=0,dy=-3),spark=3),
 'witch':dict(cmap={(147,56,143):C[0],(98,36,97):C[1],(59,20,67):B[3],
     (133,133,133):G[1],(93,93,93):G[2],(61,61,61):G[3],(180,180,180):G[0],
     (153,230,95):G[0],(90,197,79):G[1],(51,152,75):G[2],(3,25,63):B[4],(255,255,255):WARM},
   halo=dict(r=9.5,dx=0,dy=-3),spark=3),
 'pyromancer':dict(cmap={(234,50,60):C[0],(196,36,48):C[1],(137,30,43):C[2],(87,28,39):B[3],
     (199,207,221):G[0],(146,161,185):G[1],(101,115,146):G[2],
     (129,4,0):G[3],(127,9,0):G[3],(255,255,255):WARM,
     (138,72,54):B[2],(93,44,40):B[3],(57,31,33):B[4]},
   halo=dict(r=9.5,dx=0,dy=-3),spark=3),
 'lizardman':dict(cmap=mk(ST,{(191,111,74):C[1],(138,72,54):C[2],(93,44,40):B[3],
     (237,171,80):G[1],(224,116,56):G[2],(142,37,29):B[2]}),
   halo=dict(r=9,dx=-1,dy=-3),spark=4),
 'wizard':dict(cmap={(0,152,220):C[0],(0,105,170):C[1],(0,57,109):C[2],(3,25,63):B[3],
     (138,72,54):G[2],(93,44,40):G[3],(66,76,110):B[2],
     (146,161,185):P[1],(199,207,221):P[0]},
   halo=dict(r=13,dx=0,dy=-2),spark=4),
 'dwarf':dict(cmap=mk(ST,{(196,36,48):B[0],(137,30,43):B[1],(87,28,39):B[2],
     (0,152,220):C[0],(0,105,170):C[1],(0,57,109):C[2]}),
   halo=dict(r=9,dx=-1,dy=-3),spark=4),
 'kobold':dict(cmap=mk(ST,{(138,72,54):C[0],(93,44,40):C[1],(57,31,33):C[2],(28,18,28):B[3],(52,24,39):B[3]}),
   halo=dict(r=13,dx=0,dy=-3),spark=4),
 'minotaur':dict(cmap=mk(STG,{(61,61,61):B[2],(93,93,93):B[1],(133,133,133):B[0],(39,39,39):B[3],(28,18,28):B[3],
     (87,47,17):G[2],(196,36,48):G[0]}),
   halo=dict(r=14,dx=0,dy=-4),spark=5),
 'werewolf':dict(cmap={(39,39,39):(104,112,148),(61,61,61):(150,158,190),(93,93,93):(198,204,226),(27,27,27):(70,76,110),
     (255,255,255):WARM,(146,161,185):G[1],(199,207,221):G[0],(195,202,220):G[0],(130,134,169):G[2],(196,36,48):G[0]},
   halo=dict(r=13,dx=0,dy=-4),spark=5),
 'centaur':dict(cmap=mk(ST,{(9,9,1):C[0],(9,9,2):C[1],(93,44,40):C[2],(57,31,33):C[3],
     (93,93,93):G[1],(61,61,61):G[2],(39,39,39):G[3],(180,180,180):P[0],(133,133,133):P[2],
     (30,111,80):B[2],(90,197,79):B[1],(153,230,95):B[0]}),
   pre=centaur_pre,halo=dict(r=9,dx=0,dy=-3),spark=4),
})

def gold_zones(o,f,head,zones,src=None):
    """recolour steel inside circles (relative to head centre) to the gold ramp"""
    hx,hy,hw,hh=head; cx,cy=hx+hw/2,hy+hh/2
    yy,xx=np.mgrid[:f.shape[0],:f.shape[1]]
    src=src or STEEL
    ramp=[G[0],G[1],G[2],G[3],G[4]]
    for dx,dy,r in zones:
        z=((xx-(cx+dx))**2+(yy-(cy+dy))**2)<=r*r
        for s_,d_ in zip(src,ramp): o[z&mask_of(f,[s_])]=(*d_,255)
    return o

def emblem(o,f,head,dx,dy,allow,col='blue',big=False):
    hx,hy,hw,hh=head; cx,cy=int(round(hx+hw/2+dx)),int(round(hy+hh/2+dy))
    if big: pts=[(cx,cy+k) for k in range(-3,6)]+[(cx+k,cy) for k in (-2,-1,1,2)]
    else: pts=[(cx,cy-1),(cx,cy),(cx,cy+1),(cx,cy+2),(cx-1,cy),(cx+1,cy)]
    ok=mask_of(f,allow)
    H,W=f.shape[:2]
    if not all(0<=y<H and 0<=x<W and ok[y,x] for x,y in pts): return o
    ramp=B if col=='blue' else G
    for x,y in pts: o[y,x,:3]=ramp[1]
    o[cy,cx,:3]=ramp[0]
    if big:
        for x,y in pts:
            if x==cx and y>cy: o[y,x,:3]=ramp[2]
    return o

def pyro_pre(f,head,i,anim):
    from scipy import ndimage
    o=f.copy()
    fire=mask_of(f,[(234,50,60),(196,36,48),(137,30,43),(87,28,39),(255,200,37),(255,255,255),(129,4,0),(127,9,0)])
    outl=mask_of(f,[(19,19,19),(4,7,22),(7,4,0),(7,0,12),(14,7,0),(25,12,6),(15,5,6),(15,11,25)])
    robe=ndimage.binary_fill_holes(outl)
    flame=fire&~robe
    for src,dst in [((234,50,60),G[0]),((196,36,48),G[1]),((137,30,43),G[2]),((87,28,39),G[3]),((255,200,37),WARM),((129,4,0),G[3]),((127,9,0),G[3])]:
        o[flame&mask_of(f,[src])]=(*dst,254)   # alpha 254 marks "already mapped"
    return o

def post_chain(*fns):
    def p(o,f,head,i,anim):
        for fn in fns: o=fn(o,f,head)
        return o
    return p

SKIN=[(246,202,159),(230,156,105),(249,230,207)]
CLASSES['huge_knight']['post']=post_chain(
    lambda o,f,h: gold_zones(o,f,h,[(-18,17,12.5),(21,16,8.5)]),
    lambda o,f,h: emblem(o,f,h,7,23,STEEL[:3],'blue',big=True))
CLASSES['gladiator']['cmap'].update({(138,72,54):(138,72,54),(93,44,40):(93,44,40),(57,31,33):B[3],(88,56,40):G[3]})
CLASSES['gladiator']['post']=post_chain(lambda o,f,h: gold_zones(o,f,h,[(0,-4,4)]))
CLASSES['werewolf']['cmap'].update({(199,207,221):(238,240,250),(146,161,185):(204,210,230),(195,202,220):(238,240,250),(130,134,169):(170,178,204)})
CLASSES['pyromancer']['pre']=pyro_pre
CLASSES['lizardman']['post']=post_chain(lambda o,f,h: emblem(o,f,h,2,17,SKIN,'gold'))
CLASSES['minotaur']['post']=post_chain(lambda o,f,h: emblem(o,f,h,-2,22,[(191,111,74),(230,156,105),(138,72,54)],'gold',big=True))
CLASSES['centaur']['post']=post_chain(lambda o,f,h: emblem(o,f,h,0,15,SKIN+[(191,111,74)],'gold'))
CLASSES['adventurer']['post']=post_chain(lambda o,f,h: emblem(o,f,h,-1,10,[(132,126,135),(107,105,112)],'blue'))
CLASSES['kobold']['post']=post_chain(lambda o,f,h: emblem(o,f,h,-6,22,[(138,72,54),(93,44,40),(57,31,33)],'blue'))
CLASSES['dwarf']['post']=post_chain(lambda o,f,h: emblem(o,f,h,0,22,[(0,152,220),(0,105,170),(0,57,109)],'gold'))
CLASSES['wizard']['post']=post_chain(lambda o,f,h: emblem(o,f,h,8,26,[(0,152,220),(0,105,170),(0,57,109)],'gold',big=True))
CLASSES['witch']['post']=post_chain(lambda o,f,h: emblem(o,f,h,0,22,[(98,36,97),(147,56,143),(59,20,67)],'gold',big=True))
CLASSES['pyromancer']['post']=post_chain(lambda o,f,h: emblem(o,f,h,1,22,[(234,50,60),(196,36,48),(137,30,43)],'gold',big=True))
CLASSES['samurai']['post']=post_chain(lambda o,f,h: emblem(o,f,h,0,11,[(199,207,221),(146,161,185)],'blue'))

CLASSES['adventurer']['halo']=dict(r=5,dx=-1,dy=0,cross=False)
CLASSES['gladiator']['halo']=dict(r=5.5,dx=-1.5,dy=0.5,cross=False)
CLASSES['wizard']['halo']=dict(r=16,dx=-1,dy=0)
