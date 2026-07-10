import math,cmath,csv
from collections import defaultdict
import importlib.util
spec=importlib.util.spec_from_file_location("m","experiments/th10-fd-connectivity.py")
mm=importlib.util.module_from_spec(spec); spec.loader.exec_module(mm); G=mm.G; kof=mm.kof; cx=mm.cx; reduce2=mm.reduce2; classify=mm.classify
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly
wt={r['id']:int(r['sStar']) for r in csv.DictReader(open('/sessions/relaxed-peaceful-davinci/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'))}
def fsetup(T1,T2):
    det=T1.real*T2.imag-T2.real*T1.imag
    return ((T2.imag/det,-T2.real/det),(-T1.imag/det,T1.real/det))
def fr(v,inv): return (round(((inv[0][0]*v.real+inv[0][1]*v.imag))%1,3)%1,round(((inv[1][0]*v.real+inv[1][1]*v.imag))%1,3)%1)
def build(seed,T1,T2,R):
    tmin=min(abs(T1),abs(T2));A=int(R/tmin)+2;seen=set();cm=defaultdict(list);pts=[]
    for a in range(-A,A+1):
        for b in range(-A,A+1):
            for s in seed:
                p=s+a*T1+b*T2
                if abs(p)<=R:
                    ky=(round(p.real,4),round(p.imag,4))
                    if ky not in seen: seen.add(ky);cm[(math.floor(p.real),math.floor(p.imag))].append(p);pts.append(p)
    E=[]
    for p in pts:
        ci,cj=math.floor(p.real),math.floor(p.imag)
        for di in(-1,0,1):
            for dj in(-1,0,1):
                for q in cm.get((ci+di,cj+dj),()):
                    if (q.real,q.imag)>(p.real,p.imag) and abs(abs(p-q)-1)<1e-6: E.append((p,q))
    return E
def syms(seed,T1,T2):
    inv=fsetup(T1,T2);cls=set(fr(v,inv) for v in seed);v0=seed[0]
    def ok(g): return all(fr(g(v),inv) in cls for v in seed)
    mir=[];gl=[];rot_t=None
    for pd in range(0,180,15):
        phi=math.radians(pd);w=cmath.rect(1,2*phi);perp=cmath.rect(1,-phi)
        Pp=min([abs(((a*T1+b*T2)*perp).imag) for a in range(-2,3) for b in range(-2,3) if (a,b)!=(0,0) and abs(((a*T1+b*T2)*perp).imag)>1e-6]+[9])
        Pa=min([abs(((a*T1+b*T2)*perp).real) for a in range(-2,3) for b in range(-2,3) if (a,b)!=(0,0) and abs(((a*T1+b*T2)*perp).real)>1e-6]+[9])
        seen=set()
        for vj in seed:
            t=vj-w*v0.conjugate()
            if ok(lambda z,w=w,t=t:w*z.conjugate()+t):
                c=(perp*t).imag/2; al=(perp*t).real
                alm=al%Pa if Pa<9 else 0; isgl=min(abs(alm),abs(alm-Pa))>0.08
                key=(round((2*c)%(2*Pp),2) if Pp<9 else round(2*c,2),isgl)
                if key in seen: continue
                seen.add(key);(gl if isgl else mir).append((pd,c,w,t))
    for vj in seed:
        t=vj+v0
        if ok(lambda z,t=t:-z+t): rot_t=t;break
    return mir,gl,rot_t
def dirichlet(z0,ops,T1,T2):
    orb=set()
    for r in ops:
        for a in range(-2,3):
            for b in range(-2,3):
                w=r(z0)+a*T1+b*T2
                if abs(w-z0)>1e-4: orb.add((round(w.real,4),round(w.imag,4)))
    poly=[z0+7+7j,z0+7-7j,z0-7-7j,z0-7+7j]
    for wx,wy in orb:
        w=complex(wx,wy);mid=(z0+w)/2;nr=w-z0;out=[]
        for i in range(len(poly)):
            a=poly[i];b=poly[(i+1)%len(poly)]
            da=((a-mid).conjugate()*nr).real;db=((b-mid).conjugate()*nr).real
            if da<=1e-9: out.append(a)
            if (da<=1e-9)!=(db<=1e-9): out.append(a+(b-a)*(da/(da-db)))
        poly=out
        if len(poly)<3: break
    return poly
def draw_axis(ax,pd,c,dashed,col,T1,T2,R):
    phi=math.radians(pd);d=cmath.rect(1,phi);n=cmath.rect(1,phi+math.pi/2)
    offs=set()
    for a in range(-5,6):
        for b in range(-5,6):
            o=round(c+((a*T1+b*T2)*cmath.rect(1,-phi)).imag,3)
            if -R*1.5<o<R*1.5: offs.add(o)
    for o in offs:
        b0=o*n;p1=b0-d*R*2;p2=b0+d*R*2
        if dashed: ax.plot([p1.real,p2.real],[p1.imag,p2.imag],color=col,lw=2.3,alpha=0.95,zorder=3,dashes=(6,4))
        else: ax.plot([p1.real,p2.real],[p1.imag,p2.imag],'-',color=col,lw=2.3,alpha=0.95,zorder=3)
ids=['t3055','t5125','t6364','t6648']
fig,axs=plt.subplots(2,2,figsize=(15,12))
for ax,tid in zip(axs.flat,ids):
    e=G[tid];T1=cx(e['T1']);T2=cx(e['T2']);k=kof[tid];seed=[cx(s) for s in e['Seed']]
    v1,v2=reduce2(T1,T2);R=abs(v1)+abs(v2)+2
    for p,q in build(seed,T1,T2,R): ax.plot([p.real,q.real],[p.imag,q.imag],'-',color='0.83',lw=0.6,zorder=1)
    mir,gl,rt=syms(seed,T1,T2)
    for pd,c,w,t in mir: draw_axis(ax,pd,c,False,'crimson',T1,T2,R)
    for pd,c,w,t in gl: draw_axis(ax,pd,c,True,'royalblue',T1,T2,R)
    ops=[lambda z:z]+[(lambda z,w=w,t=t:w*z.conjugate()+t) for pd,c,w,t in mir+gl]
    ctrs=[]
    if rt is not None:
        ops.append(lambda z,t=rt:-z+t)
        for off in [0,T1/2,T2/2,(T1+T2)/2]:
            base=rt/2+off
            for a in range(-3,4):
                for b in range(-3,4):
                    z=base+a*T1+b*T2
                    if abs(z)<R*1.25: ctrs.append(z)
    if ctrs: ax.scatter([z.real for z in ctrs],[z.imag for z in ctrs],marker='D',s=80,c='gold',ec='k',lw=1.2,zorder=6)
    has_ref=bool(mir or gl); has_rot=rt is not None
    order=4 if (has_rot and has_ref) else 2 if (has_rot or has_ref) else 1
    c0=min(ctrs,key=abs) if ctrs else 0j
    if order==1: u,v=T1,T2
    elif order==2: u,v=(T1,T2/2)
    else: u,v=(T1/2,T2/2)
    fdpoly=[c0,c0+u,c0+u+v,c0+v]
    ax.add_patch(MPoly([(z.real,z.imag) for z in fdpoly],facecolor='yellow',alpha=0.62,ec='darkorange',lw=2.4,zorder=2))
    grp=('p1' if not mir and not gl and rt is None else 'p2' if(rt is not None and not mir and not gl) else 'pg' if(gl and not mir and rt is None) else 'pgg' if(gl and rt is not None and not mir) else 'pm' if(mir and not gl and rt is None) else 'cmm/pmg')
    ax.set_aspect('equal');ax.set_xticks([]);ax.set_yticks([])
    ax.set_title(f'{tid}  k={k}  s*={wt[tid]}   ~ {grp}\nmirror@{sorted(set(p for p,_,_,_ in mir))}  glide@{sorted(set(p for p,_,_,_ in gl))}  2-fold={4 if rt is not None else 0} classes',fontsize=10)
    ax.set_xlim(-R*0.62,R*0.62);ax.set_ylim(-R*0.62,R*0.62)
fig.suptitle('Exception tilings — full symmetry diagram (red=mirror, blue dashed=glide, gold=2-fold center, yellow=fundamental domain)',fontsize=13)
plt.tight_layout(rect=[0,0,1,0.96]);fig.savefig('experiments/results/elong-exceptions-symdiagram.png',dpi=105,bbox_inches='tight')
print("saved v2 ok")
