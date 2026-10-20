import numpy as np, math
from paladin import mask_of, dilate
from classes import cleanup_removed, knight_pre as pal_knight_pre, STEEL, SH, RED_L, RED_D, OUTS
from demonic import *

SEAM=(3,3,3)   # sentinel: molten seam, coloured per frame in post

def cape_fire(o,capemask,i,n):
    air=o[...,3]==0
    edge=capemask&dilate(air,1,False)
    ys,xs=np.where(edge)
    H,W=o.shape[:2]
    for y,x in zip(ys,xs):
        s=math.sin(2*math.pi*i/n*2+x*1.1+y*0.6)
        o[y,x,:3]=LV[2] if s>0.2 else RD[0]
        if s>0.55:
            for dx,dy in ((-1,0),(0,1),(-1,1)):
                X,Y=x+dx,y+dy
                if 0<=X<W and 0<=Y<H and o[Y,X,3]==0:
                    o[Y,X]=(*LV[1 if s>0.85 else 2],255); break
    return o

def shield_sigil(o,f,i,n):
    from scipy import ndimage
    sh=mask_of(f,SH); st=mask_of(f,STEEL)
    rim=st&dilate(sh,1,False)
    o[rim]=(*LV[3],255)
    o[rim&mask_of(f,[(199,207,221),(146,161,185)])]=(*LV[2],255)
    lab,k=ndimage.label(sh)
    glow=LV[1] if math.sin(2*math.pi*i/n)>-0.3 else LV[2]
    for j in range(1,k+1):
        ys,xs=np.where(lab==j)
        if len(xs)<14: continue
        x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
        if x1-x0<3 or y1-y0<6: continue
        cx=(x0+x1+1)//2; cy=y0+(y1-y0)//2
        pts=[(cx,y) for y in range(y0+2,y1-1)]
        pts+=[(cx-2,cy-1),(cx-2,cy-2),(cx+2,cy-1),(cx+2,cy-2),(cx-1,cy),(cx+1,cy),(cx-2,cy)if x1-x0>=5 else (cx,cy),(cx+2,cy) if x1-x0>=5 else (cx,cy)]
        for x,y in pts:
            if 0<=y<lab.shape[0] and 0<=x<lab.shape[1] and lab[y,x]==j: o[y,x,:3]=glow
        if lab[y0+2,cx]==j: o[y0+2,cx,:3]=LV[0]
    return o

def knight_pre(f,head,i,anim):
    o=pal_knight_pre(f,head,i,anim)
    # pal pre marks the neck scarf with gold sentinels -> back to red here
    return o

def knight_post(o,f,head,i,anim,n):
    o=pulse_seams(o,mask_of(o,[SEAM]),i,n)
    o=apply_cracks(o,mask_of(f,STEEL[:3]),head,'knight',(9,18),9,i,n,seed=5)
    o=t_visor(o,mask_of(f,[(246,202,159),(230,156,105),(0,152,220),(61,61,61)])&(np.mgrid[:f.shape[0],:f.shape[1]][0]<head[1]+head[3]),i,n)
    o=cape_fire(o,mask_of(f,[RED_L,RED_D]),i,n)
    o=shield_sigil(o,f,i,n)
    return o

DCLASSES={
 'knight':dict(
   cmap={(199,207,221):CH[0],(146,161,185):CH[1],(101,115,146):CH[2],(66,76,110):SEAM,(42,47,78):CH[4],(186,198,212):CH[0],
         RED_L:RD[0],RED_D:RD[2],(93,44,40):CH[2],(87,28,39):CH[3],(57,31,33):CH[4],
         (246,202,159):CH[1],(230,156,105):CH[2],(191,111,74):CH[2],(0,152,220):LV[0],(61,61,61):LV[1],
         (255,255,255):LV[0],(255,162,20):LV[2],(255,200,37):LV[1],(237,118,20):LV[3],
         (1,2,3):RD[1],(1,2,4):RD[2]},
   horns=dict(dx=0,ty=4,half=0.36,size=8,behind=True),pre=knight_pre,post=knight_post,embers=4),
}

STC={(199,207,221):CH[0],(146,161,185):CH[1],(101,115,146):CH[2],(66,76,110):SEAM,(42,47,78):CH[4]}
MOLTEN={(255,255,255):LV[0],(199,207,221):LV[1],(146,161,185):LV[2],(101,115,146):LV[3],(66,76,110):RD[2]}
def mk(*ds):
    o={}
    for d in ds: o.update(d)
    return o
def seams_post(cracks=None):
    def p(o,f,head,i,anim,n):
        o=pulse_seams(o,mask_of(o,[SEAM]),i,n)
        if cracks: o=apply_cracks(o,mask_of(f,cracks[0]),head,cracks[1],cracks[2],cracks[3],i,n,seed=cracks[4])
        return o
    return p
def chain(*ps):
    def p(o,f,head,i,anim,n):
        for q in ps: o=q(o,f,head,i,anim,n)
        return o
    return p
def eyes(pts,col=None):
    def p(o,f,head,i,anim,n):
        hx,hy,hw,hh=head
        for dx,dy in pts:
            x,y=int(round(hx+hw/2+dx)),int(round(hy+hh/2+dy))
            if 0<=y<o.shape[0] and 0<=x<o.shape[1] and o[y,x,3]>0: o[y,x,:3]=col or LV[0]
        return o
    return p

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
    for src,dst in [((234,50,60),LV[1]),((196,36,48),LV[2]),((137,30,43),RD[0]),((87,28,39),RD[1]),((255,200,37),LV[0]),((255,255,255),LV[0]),((129,4,0),RD[2]),((127,9,0),RD[2])]:
        o[flame&mask_of(f,[src])]=(*dst,254)
    return o

DCLASSES.update({
 'huge_knight':dict(cmap=mk(STC,{(255,255,255):LV[0],(250,254,253):LV[0],(252,247,251):LV[1],(255,245,255):LV[0],
     (196,34,47):RD[0],(137,27,41):RD[1],(137,30,43):RD[1],(87,25,37):RD[2],(87,28,39):RD[2],(15,15,15):(15,15,15)}),
   horns=dict(dx=0,ty=8,half=0.40,size=17,behind=True),embers=7,
   post=seams_post((STEEL[:3],'huge_knight',(26,55),26,3))),
 'adventurer':dict(cmap={(217,87,99):RD[0],(171,67,67):RD[1],(173,59,59):RD[1],(143,50,50):RD[2],
     (132,126,135):CH[1],(107,105,112):CH[2],(89,86,82):CH[3],(85,84,89):CH[3],
     (58,69,66):CH[3],(45,56,53):CH[4],(46,57,54):CH[4],
     (214,235,255):CH[0],(203,219,252):CH[0],(165,174,234):CH[1],(155,173,183):CH[1],(133,144,159):CH[2],
     (235,198,89):LV[1],(217,160,102):LV[2],(179,153,50):LV[3],(54,136,153):LV[0]},
   horns=dict(dx=0,ty=2,half=0.30,size=4,thick=2,behind=True),embers=2),
 'gladiator':dict(cmap=mk(STC,{(255,255,255):LV[0],(0,105,170):RD[1],(0,57,109):RD[2],(12,46,68):RD[3],(57,31,33):CH[4],(88,56,40):CH[3]}),
   horns=dict(dx=0,ty=4,half=0.36,size=5,thick=2,behind=True),embers=2,post=seams_post()),
 'samurai':dict(cmap={(98,36,97):RD[1],(59,20,67):RD[2],(199,207,221):CH[1],(146,161,185):CH[2],(101,115,146):CH[3],
     (66,76,110):RD[2],(42,47,78):RD[3],(26,25,50):(44,14,18),(137,30,43):LV[2],(87,28,39):LV[3],
     (90,197,79):LV[0],(255,255,255):LV[0],(255,200,37):LV[1],(255,162,20):LV[2]},
   horns=dict(dx=1,ty=1,half=0.30,size=6,thick=2,behind=False),embers=3),
 'witch':dict(cmap={(147,56,143):RD[1],(98,36,97):CH[2],(59,20,67):CH[3],(3,25,63):RD[3],
     (133,133,133):RD[0],(93,93,93):RD[1],(61,61,61):RD[2],(180,180,180):LV[1],
     (153,230,95):LV[0],(90,197,79):LV[1],(51,152,75):LV[2],(255,255,255):LV[0]},embers=4),
 'pyromancer':dict(cmap=mk(STC,{(234,50,60):CH[0],(196,36,48):CH[1],(137,30,43):CH[2],(87,28,39):SEAM,
     (255,255,255):LV[0],(255,200,37):LV[1],(138,72,54):RD[2],(93,44,40):RD[3],(57,31,33):CH[4]}),
   pre=pyro_pre,horns=dict(dx=0,ty=3,half=0.36,size=8,behind=True),embers=4,
   post=chain(seams_post(),eyes([(-2,2),(1,2)]))),
 'wizard':dict(cmap={(0,152,220):RD[0],(0,105,170):RD[1],(0,57,109):RD[2],(3,25,63):RD[3],
     (138,72,54):CH[2],(93,44,40):CH[3],(66,76,110):CH[3],(146,161,185):CH[1],(199,207,221):CH[0],
     (206,214,255):(196,188,190),(253,253,255):(226,220,220),(255,162,20):LV[2],(255,200,37):LV[1],(255,235,87):LV[0],(237,118,20):LV[3],(90,197,79):LV[0]},
   horns=dict(dx=-2,ty=5,half=0.48,size=9,behind=True),embers=4),
 'dwarf':dict(cmap=mk(STC,{(255,255,255):LV[0],(196,36,48):RD[0],(137,30,43):RD[1],(87,28,39):RD[2],
     (0,152,220):CH[1],(0,105,170):CH[2],(0,57,109):CH[3],
     (191,111,74):(166,62,34),(138,72,54):(116,36,26),(93,44,40):(78,24,22),(57,31,33):(48,16,18),
     (255,162,20):LV[2],(255,200,37):LV[1],(237,118,20):LV[3]}),
   horns=dict(dx=-1,ty=4,half=0.44,size=8,behind=True),embers=4,post=seams_post()),
 'kobold':dict(cmap={(0,205,249):(255,120,64),(0,152,220):RD[0],(0,105,170):RD[1],(0,57,109):RD[2],(12,46,68):RD[3],
     (138,72,54):CH[1],(93,44,40):CH[2],(57,31,33):CH[3],(28,18,28):CH[4],(52,24,39):CH[4],
     (199,207,221):LV[1],(146,161,185):LV[2],(101,115,146):LV[3],(255,255,255):LV[0]},
   horns=dict(dx=4,ty=4,half=0.20,size=8,behind=True),embers=4),
 'lizardman':dict(cmap={(51,152,75):CH[1],(30,111,80):CH[2],(19,76,76):CH[3],(12,46,68):CH[4],
     (249,230,207):LV[0],(246,202,159):LV[1],(244,201,156):LV[1],(230,156,105):LV[2],
     (191,111,74):RD[1],(138,72,54):RD[2],(93,44,40):RD[3],(237,171,80):LV[1],(224,116,56):LV[2],(142,37,29):RD[2],
     (0,105,170):LV[0],(0,57,109):LV[2],**MOLTEN},
   horns=dict(dx=-1,ty=3,half=0.30,size=7,behind=True),embers=5),
 'minotaur':dict(cmap={(255,255,255):LV[1],(199,207,221):CH[0],(146,161,185):CH[1],(101,115,146):CH[2],(66,76,110):SEAM,(42,47,78):CH[4],
     (230,156,105):(200,92,64),(245,163,105):(206,98,68),(253,156,105):(206,98,68),(245,155,105):(206,98,68),(247,159,109):(206,98,68),(246,162,115):(206,98,68),
     (191,111,74):(152,58,40),(138,72,54):(106,36,30),(93,44,40):(72,24,24),(57,31,33):(48,16,20),
     (28,18,28):CH[4],(61,61,61):RD[2],(93,93,93):RD[1],(133,133,133):RD[0],(39,39,39):RD[3],(87,47,17):LV[3],(196,36,48):LV[0]},
   embers=6,post=seams_post()),
 'werewolf':dict(cmap={(255,255,255):LV[1],(199,207,221):LV[2],(195,202,220):LV[2],(146,161,185):LV[3],(130,134,169):RD[2],
     (93,93,93):(112,42,36),(61,61,61):(64,40,44),(196,36,48):LV[0]},
   horns=dict(dx=2,ty=4,half=0.25,size=11,behind=True),embers=6),
 'centaur':dict(cmap=mk(STC,{(255,255,255):LV[0],(9,9,1):CH[1],(9,9,2):CH[2],(93,44,40):CH[3],(57,31,33):CH[4],
     (93,93,93):LV[1],(61,61,61):LV[2],(39,39,39):RD[1],(180,180,180):LV[1],(133,133,133):LV[2],
     (30,111,80):RD[2],(90,197,79):LV[1],(153,230,95):LV[0]}),
   pre=centaur_pre,horns=dict(dx=0,ty=3,half=0.34,size=7,behind=True),embers=5,post=seams_post()),
})
DCLASSES['pyromancer']['cmap'][(87,28,39)]=CH[3]
DCLASSES['pyromancer']['post']=chain(seams_post(([(234,50,60),(196,36,48),(137,30,43)],'pyro',(8,30),12,9)),eyes([(-2,2),(1,2)]))
DCLASSES['adventurer']['horns']=dict(dx=0,ty=2,half=0.34,size=5,thick=2,behind=True)
DCLASSES['adventurer']['post']=eyes([(0,1),(3,1)])
DCLASSES['adventurer']['horns']=dict(dx=0,ty=5,half=0.5,size=4,thick=2,behind=True)
DCLASSES['adventurer']['horns']=dict(dx=0,ty=2.5,half=0.42,size=3,thick=2,behind=False)
del DCLASSES['adventurer']['horns']
