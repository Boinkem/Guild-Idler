import numpy as np, math
from paladin import mask_of, dilate
from classes import knight_pre as pal_knight_pre, STEEL, SH, RED_L, RED_D
from void import *

SEAM=(3,3,3)
STV={(199,207,221):VD[0],(146,161,185):VD[1],(101,115,146):VD[2],(66,76,110):SEAM,(42,47,78):VD[4]}

def mk(*ds):
    o={}
    for d in ds: o.update(d)
    return o
def chain(*ps):
    def p(o,f,head,i,anim,n):
        for q in ps: o=q(o,f,head,i,anim,n)
        return o
    return p
def seams(o,f,head,i,anim,n): return pulse(o,mask_of(o,[SEAM]),i,n)
def eyes(pts,col=None):
    def p(o,f,head,i,anim,n):
        hx,hy,hw,hh=head
        for dx,dy in pts:
            x,y=int(round(hx+hw/2+dx)),int(round(hy+hh/2+dy))
            if 0<=y<o.shape[0] and 0<=x<o.shape[1] and o[y,x,3]>0: o[y,x,:3]=col or VG[1]
        return o
    return p

def shield_eye(o,f,head,i,anim,n):
    from scipy import ndimage
    sh=mask_of(f,SH); st=mask_of(f,STEEL)
    rim=st&dilate(sh,1,False)
    o[rim]=(*VG[3],255); o[rim&mask_of(f,[(199,207,221),(146,161,185)])]=(*VG[2],255)
    lab,k=ndimage.label(sh)
    for j in range(1,k+1):
        ys,xs=np.where(lab==j)
        if len(xs)<14: continue
        x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
        if x1-x0<3 or y1-y0<6: continue
        cx=(x0+x1+1)//2; cy=(y0+y1)//2
        for dy in range(-3,4):
            w=0 if abs(dy)==3 else 1
            for dx in range(-w,w+1):
                x,y=cx+dx,cy+dy
                if lab[y,x]==j: o[y,x,:3]=VG[1] if dx==0 and abs(dy)>1 else (VG[2] if dx else VG[0])
        for dy in (-1,0,1):
            if lab[cy+dy,cx]==j: o[cy+dy,cx,:3]=EYE if dy==0 else VD[4]
    return o

def knight_post(o,f,head,i,anim,n):
    hx,hy,hw,hh=head
    o=seams(o,f,head,i,anim,n)
    yy=np.mgrid[:f.shape[0],:f.shape[1]][0]
    o=visor_bars(o,mask_of(f,[(246,202,159),(230,156,105),(0,152,220),(61,61,61)])&(yy<hy+hh),i,n)
    o=shield_eye(o,f,head,i,anim,n)
    # chest rune
    cx=hx+hw//2-2; cy=hy+hh+4
    pts=[(cx,cy-1),(cx,cy),(cx,cy+1),(cx-1,cy-1),(cx+1,cy-1),(cx-1,cy+2),(cx+1,cy+2)]
    plate=mask_of(f,STEEL[:3])
    if all(0<=y<f.shape[0] and 0<=x<f.shape[1] and plate[y,x] for x,y in pts):
        for x,y in pts: o[y,x,:3]=VG[2]
        o[cy,cx,:3]=VG[0]
    return o

VCLASSES={
 'knight':dict(
   cmap=mk(STV,{(186,198,212):VD[0],RED_L:TN[1],RED_D:TN[3],(93,44,40):VD[3],(87,28,39):VD[4],(57,31,33):VD[4],
         (191,111,74):VD[2],(255,255,255):VG[0],(255,162,20):VG[2],(255,200,37):VG[1],(237,118,20):VG[3],
         (1,2,3):VG[3],(1,2,4):VD[3]}),
   pre=pal_knight_pre,post=knight_post,
   eye=dict(dx=0,dy=-3.5),tendrils=dict(ox=0.2,oy=0.25,length=19,count=7,width=3.6,span=15,angles=(-0.4,1.0)),motes=5),
}

def centaur_pre(f,head,i,anim):
    hx,hy,hw,hh=head
    o=f.copy(); yy,xx=np.mgrid[:f.shape[0],:f.shape[1]]
    low=(yy>=hy+27)|((yy>=hy+17)&(xx<hx-3))
    for src,dst in [((191,111,74),(9,9,1)),((138,72,54),(9,9,2))]:
        o[low&mask_of(f,[src])]=(*dst,255)
    return o

def pyro_pre(f,head,i,anim):
    from scipy import ndimage
    o=f.copy()
    fire=mask_of(f,[(234,50,60),(196,36,48),(137,30,43),(87,28,39),(255,200,37),(255,255,255),(129,4,0),(127,9,0)])
    outl=mask_of(f,[(19,19,19),(4,7,22),(7,4,0),(7,0,12),(14,7,0),(25,12,6),(15,5,6),(15,11,25)])
    flame=fire&~ndimage.binary_fill_holes(outl)
    for src,dst in [((234,50,60),VG[1]),((196,36,48),VG[2]),((137,30,43),VG[3]),((87,28,39),VG[4]),((255,200,37),VG[0]),((255,255,255),VG[0]),((129,4,0),VG[4]),((127,9,0),VG[4])]:
        o[flame&mask_of(f,[src])]=(*dst,254)
    return o

GLOWST={(255,255,255):VG[0],(199,207,221):VG[1],(146,161,185):VG[2],(101,115,146):VG[3],(66,76,110):VG[4]}
GOLD={(255,162,20):VG[2],(255,200,37):VG[1],(237,118,20):VG[3],(255,235,87):VG[0]}
def T(**k):
    d=dict(ox=0.2,oy=0.4,count=6,angles=(-0.4,1.0)); d.update(k); return d

VCLASSES.update({
 'huge_knight':dict(cmap=mk(STV,GOLD,{(255,255,255):VG[0],(250,254,253):VG[0],(252,247,251):VG[1],(255,245,255):VG[0],
     (196,34,47):TN[0],(137,27,41):TN[1],(137,30,43):TN[1],(87,25,37):TN[2],(87,28,39):TN[2]}),
   post=seams,eye=dict(dx=0,dy=-6,big=True),tendrils=T(length=42,width=7,span=38,count=8),motes=8),
 'adventurer':dict(cmap=mk(GOLD,{(217,87,99):TN[0],(171,67,67):TN[1],(173,59,59):TN[1],(143,50,50):TN[2],
     (132,126,135):VD[1],(107,105,112):VD[2],(89,86,82):VD[3],(85,84,89):VD[3],(58,69,66):VD[3],(45,56,53):VD[4],(46,57,54):VD[4],
     (214,235,255):VD[0],(203,219,252):VD[0],(165,174,234):VD[1],(155,173,183):VD[1],(133,144,159):VD[2],
     (235,198,89):VG[1],(217,160,102):VG[2],(179,153,50):VG[3],(54,136,153):VG[1]}),
   tendrils=T(length=10,width=2.2,span=8,count=5,oy=0.6),motes=3),
 'gladiator':dict(cmap=mk(STV,{(255,255,255):VG[0],(0,105,170):TN[1],(0,57,109):TN[2],(12,46,68):TN[3],(57,31,33):VD[4],(88,56,40):VD[3]}),
   post=seams,eye=dict(dx=1,dy=-2),tendrils=T(length=12,width=2.6,span=10,count=5,oy=0.5),motes=3),
 'samurai':dict(cmap=mk(GOLD,{(98,36,97):(84,44,124),(59,20,67):(46,24,72),(199,207,221):VD[1],(146,161,185):VD[2],(101,115,146):VD[3],
     (66,76,110):TN[2],(42,47,78):TN[3],(26,25,50):(30,14,46),(137,30,43):VG[2],(87,28,39):VG[3],(90,197,79):VG[1],(255,255,255):VG[0]}),
   eye=dict(dx=1,dy=-4),tendrils=T(length=15,width=2.8,span=10,count=5,oy=0.2),motes=4),
 'witch':dict(cmap={(147,56,143):TN[1],(98,36,97):VD[2],(59,20,67):VD[3],(3,25,63):TN[3],
     (133,133,133):VD[0],(93,93,93):VD[1],(61,61,61):VD[2],(180,180,180):VG[1],
     (153,230,95):VG[0],(90,197,79):VG[1],(51,152,75):VG[2],(255,255,255):VG[0]},
   eye=dict(dx=1,dy=-3),tendrils=T(length=22,width=3.4,span=26,count=7,oy=0.5),motes=5),
 'pyromancer':dict(cmap=mk(STV,{(234,50,60):VD[0],(196,36,48):VD[1],(137,30,43):VD[2],(87,28,39):VD[3],
     (255,255,255):VG[0],(255,200,37):VG[1],(138,72,54):VD[2],(93,44,40):VD[3],(57,31,33):VD[4]}),
   pre=pyro_pre,post=chain(seams,eyes([(-2,2),(1,2)],EYE)),eye=dict(dx=0,dy=-2),
   tendrils=T(length=22,width=3.4,span=26,count=7,oy=0.4),motes=5),
 'wizard':dict(cmap=mk(GOLD,{(0,152,220):TN[0],(0,105,170):TN[1],(0,57,109):TN[2],(3,25,63):TN[3],
     (138,72,54):VD[2],(93,44,40):VD[3],(66,76,110):VD[3],(146,161,185):VD[1],(199,207,221):VD[0],
     (206,214,255):(200,186,222),(253,253,255):(232,222,246),(255,255,255):(240,232,250),(90,197,79):VG[1],
     (180,180,180):VD[0],(133,133,133):VD[1],(93,93,93):VD[2]}),
   eye=dict(dx=4,dy=1),tendrils=T(length=22,width=3.4,span=22,count=7,oy=0.55,ox=0.3),motes=5),
 'dwarf':dict(cmap=mk(STV,GOLD,{(255,255,255):VG[0],(196,36,48):TN[0],(137,30,43):TN[1],(87,28,39):TN[2],
     (0,152,220):VD[1],(0,105,170):VD[2],(0,57,109):VD[3],
     (191,111,74):(120,82,142),(138,72,54):(86,54,108),(93,44,40):(60,36,80),(57,31,33):(38,22,54)}),
   post=seams,eye=dict(dx=0,dy=-3),tendrils=T(length=20,width=3.2,span=18,count=6,oy=0.5),motes=5),
 'kobold':dict(cmap=mk({(0,205,249):VG[1],(0,152,220):(112,58,160),(0,105,170):(74,36,110),(0,57,109):(46,22,70),(12,46,68):(28,14,44),
     (138,72,54):VD[1],(93,44,40):VD[2],(57,31,33):VD[3],(28,18,28):VD[4],(52,24,39):VD[4]},GLOWST),
   eye=dict(dx=2,dy=-4,big=True),tendrils=T(length=22,width=3.4,span=18,count=6,oy=0.5),motes=5),
 'lizardman':dict(cmap=mk({(51,152,75):(92,56,130),(30,111,80):(62,36,96),(19,76,76):(40,22,64),(12,46,68):(26,14,40),
     (249,230,207):(232,214,246),(246,202,159):(206,180,232),(244,201,156):(206,180,232),(230,156,105):(168,136,204),
     (191,111,74):VD[1],(138,72,54):VD[2],(93,44,40):VD[3],(237,171,80):VG[1],(224,116,56):VG[2],(142,37,29):TN[2],
     (0,105,170):EYE,(0,57,109):VG[3]},GLOWST),
   eye=dict(dx=0,dy=-3),tendrils=T(length=22,width=3.4,span=22,count=6,oy=0.5),motes=6),
 'minotaur':dict(cmap=mk(STV,{(255,255,255):VG[0],
     (230,156,105):(150,130,162),(245,163,105):(160,140,172),(253,156,105):(160,140,172),(245,155,105):(160,140,172),(247,159,109):(160,140,172),(246,162,115):(160,140,172),
     (191,111,74):(112,94,126),(138,72,54):(82,66,96),(93,44,40):(58,46,72),(57,31,33):(40,30,52),
     (28,18,28):VD[4],(61,61,61):TN[2],(93,93,93):TN[1],(133,133,133):TN[0],(39,39,39):TN[3],(87,47,17):VG[3],(196,36,48):EYE}),
   post=seams,eye=dict(dx=0,dy=-3,big=True),tendrils=T(length=30,width=4.4,span=30,count=7,oy=0.6),motes=7),
 'werewolf':dict(cmap={(255,255,255):VG[0],(199,207,221):VG[1],(195,202,220):VG[1],(146,161,185):VG[2],(130,134,169):VG[3],
     (93,93,93):(86,62,112),(61,61,61):(54,42,70),(196,36,48):EYE},
   eye=dict(dx=2,dy=-6,big=True),tendrils=T(length=32,width=4.4,span=28,count=7,oy=0.6),motes=7),
 'centaur':dict(cmap=mk(STV,{(255,255,255):VG[0],(9,9,1):VD[1],(9,9,2):VD[2],(93,44,40):VD[3],(57,31,33):VD[4],
     (93,93,93):TN[0],(61,61,61):TN[1],(39,39,39):TN[2],(180,180,180):VG[1],(133,133,133):VG[2],
     (30,111,80):VG[3],(90,197,79):VG[1],(153,230,95):EYE}),
   pre=centaur_pre,post=seams,eye=dict(dx=0,dy=-3),tendrils=T(length=20,width=3.2,span=16,count=6,oy=0.5),motes=6),
})
