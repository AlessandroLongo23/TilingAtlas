import math,cmath,csv
from collections import defaultdict
import importlib.util
spec=importlib.util.spec_from_file_location("m","experiments/th10-fd-connectivity.py")
mm=importlib.util.module_from_spec(spec); spec.loader.exec_module(mm); G=mm.G; kof=mm.kof; cx=mm.cx; reduce2=mm.reduce2
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly
wt={r['id']:int(r['sStar']) for r in csv.DictReader(open('/sessions/relaxed-peaceful-davinci/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'))}
def fsetup(T1,T2):
    det=T1.real*T2.imag-T2.real*T1.imag; return ((T2.imag/det,-T2.real/det),(-T1.imag/det,T1.real/det))
def frac(v,inv): return ((inv[0][0]*v.real+inv[0][1]*v.imag)%1.0,(inv[1][0]*v.real+inv[1][1]*v.imag)%1.0)
def dm(a,b): d=abs(a-b); return min(d,1-d)
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
def analyse(seed,T1,T2):
    v1,v2=reduce2(T1,T2);inv=fsetup(T1,T2);cls=[frac(v,inv) for v in seed]
    def sym(g):
        for v in seed:
            f=frac(g(v),inv)
            if not any(dm(f[0],c[0])<0.02 and dm(f[1],c[1])<0.02 for c in cls): return False
        return True
    mir=[]; gl=[]; ops=[lambda z:z]
    for pd in range(0,180,15):
        phi=math.radians(pd);w=cmath.rect(1,2*phi);perp=cmath.rect(1,-phi)
        Pon=min([abs(((a*v1+b*v2)*perp).real) for a in range(-4,5) for b in range(-4,5) if (a,b)!=(0,0) and abs(((a*v1+b*v2)*perp).imag)<1e-6]+[9e9])
        reps=[]
        for i in range(30):
            for j in range(30):
                t=(i/30)*v1+(j/30)*v2
                if sym(lambda z,w=w,t=t:w*z.conjugate()+t):
                    if not any(dm(*frac(t-r,inv)[:1])<0.03 and dm(frac(t-r,inv)[0],0)<0.03 and dm(frac(t-r,inv)[1],0)<0.03 for r in reps):
                        reps.append(t)
        seen=set()
        for t0 in reps:
            ops.append(lambda z,w=w,t=t0:w*z.conjugate()+t)
            for a in range(-3,4):
                for b in range(-3,4):
                    t=t0+a*v1+b*v2
                    c=(perp*t).imag/2; al=(perp*t).real%Pon; gm=min(abs(al),abs(al-Pon))
                    key=(pd,round(c,2),gm>0.1)
                    if key in seen: continue
                    seen.add(key); (gl if gm>0.1 else mir).append((pd,round(c,2)))
    # rotation
    rt=None
    for i in range(30):
        for j in range(30):
            t=(i/30)*v1+(j/30)*v2
            if sym(lambda z,t=t:-z+t): rt=t;break
        if rt is not None: break
    if rt is not None: ops.append(lambda z,t=rt:-z+t)
    return v1,v2,mir,gl,rt,ops
def dirichlet(z0,ops,T1,T2):
    orb=set()
    for r in ops:
        for a in range(-2,3):
            for b in range(-2,3):
                w=r(z0)+a*T1+b*T2
                if abs(w-z0)>1e-4: orb.add((round(w.real,4),round(w.imag,4)))
    poly=[z0+8+8j,z0+8-8j,z0-8-8j,z0-8+8j]
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
def drawline(ax,pd,c,dashed,col,T1,T2,R):
    phi=math.radians(pd);d=cmath.rect(1,phi);n=cmath.rect(1,phi+math.pi/2)
    offs=set()
    for a in range(-6,7):
        for b in range(-6,7):
            o=round(c+((a*T1+b*T2)*cmath.rect(1,-phi)).imag,3)
            if -R*1.6<o<R*1.6: offs.add(o)
    for o in offs:
        b0=o*n;p1=b0-d*R*2.2;p2=b0+d*R*2.2
        if dashed: ax.plot([p1.real,p2.real],[p1.imag,p2.imag],color=col,lw=2.3,alpha=.95,zorder=3,dashes=(6,4))
        else: ax.plot([p1.real,p2.real],[p1.imag,p2.imag],'-',color=col,lw=2.3,alpha=.95,zorder=3)
ids=['t3055','t5125','t6364','t6648']
fig,axs=plt.subplots(2,2,figsize=(15,12))
for ax,tid in zip(axs.flat,ids):
    e=G[tid];T1=cx(e['T1']);T2=cx(e['T2']);k=kof[tid];seed=[cx(s) for s in e['Seed']]
    v1,v2,mir,gl,rt,ops=analyse(seed,T1,T2);R=abs(v1)+abs(v2)+2
    for p,q in build(seed,T1,T2,R): ax.plot([p.real,q.real],[p.imag,q.imag],'-',color='0.83',lw=0.6,zorder=1)
    for pd,c in mir: drawline(ax,pd,c,False,'crimson',T1,T2,R)
    for pd,c in gl: drawline(ax,pd,c,True,'royalblue',T1,T2,R)
    ctrs=[]
    if rt is not None:
        for off in [0,T1/2,T2/2,(T1+T2)/2]:
            base=rt/2+off
            for a in range(-3,4):
                for b in range(-3,4):
                    z=base+a*T1+b*T2
                    if abs(z)<R*1.25: ctrs.append(z)
    if ctrs: ax.scatter([z.real for z in ctrs],[z.imag for z in ctrs],marker='D',s=80,c='gold',ec='k',lw=1.1,zorder=6)
    grp=('p1' if not mir and not gl and rt is None else 'p2' if(rt is not None and not mir and not gl) else 'pg' if(gl and not mir and rt is None) else 'pgg' if(gl and rt is not None and not mir) else 'pm' if(mir and not gl and rt is None) else 'cmm' if(mir and gl and rt is not None) else 'pmg')
    def latper(direc):
        best=9e9
        for a in range(-4,5):
            for b in range(-4,5):
                if a==0 and b==0: continue
                lv=a*T1+b*T2
                if abs((lv*direc.conjugate()).imag)<1e-6: best=min(best,abs((lv*direc.conjugate()).real))
        return best
    c0=min(ctrs,key=abs) if ctrs else 0j
    fd=None
    if grp=='p2':
        fd=[c0,c0+T1,c0+T1+0.5*T2,c0+0.5*T2]
    elif grp=='cmm' and mir:
        phis=sorted(set(p for p,_ in mir))
        f1=math.radians(phis[0]); f2=math.radians(phis[1] if len(phis)>1 else phis[0]+90)
        d1=cmath.rect(1,f1); d2=cmath.rect(1,f2)
        o1=[c for p,c in mir if p==phis[0]]; o2=[c for p,c in mir if abs(p-(phis[1] if len(phis)>1 else phis[0]+90))<1]
        # mirror intersection nearest c0 : line angle a, offset o -> perp-coord = o ; solve two lines
        def inter(a1,off1,a2,off2):
            import numpy as np
            n1=cmath.rect(1,a1); n2=cmath.rect(1,a2)
            A=np.array([[(n1.conjugate()).imag*0+ (cmath.rect(1,-a1)).real*0,0]]) # placeholder
            # perp-coord along axis a = Im(e^{-ia} p) = off ; write as linear in x,y
            r1=cmath.rect(1,-a1); r2=cmath.rect(1,-a2)
            M=np.array([[r1.imag*1.0, r1.real*1.0],[r2.imag*1.0, r2.real*1.0]])  # [Im(e^{-ia}(x+iy))]=x*(-sin)+y*(cos)?  Im(e^{-ia}p)=x*(-sin a)+y*cos a
            M=np.array([[-math.sin(a1),math.cos(a1)],[-math.sin(a2),math.cos(a2)]])
            b=np.array([off1,off2]); sol=np.linalg.solve(M,b); return complex(sol[0],sol[1])
        cand=[]
        for oo1 in o1:
            for oo2 in o2:
                try: cand.append(inter(f1,oo1,f2,oo2))
                except Exception: pass
        p0=min(cand,key=lambda z:abs(z-c0)) if cand else c0
        P1=latper(d1);P2=latper(d2)
        fd=[p0,p0+0.5*P1*d1,p0+0.5*P2*d2]
    elif grp in ('pgg','pmg','pmm','pg','pm'):
        fd=[c0,c0+0.5*T1,c0+0.5*T1+0.5*T2,c0+0.5*T2]
    else:
        fd=[c0,c0+T1,c0+T1+0.5*T2,c0+0.5*T2]
    if fd: ax.add_patch(MPoly([(z.real,z.imag) for z in fd],facecolor='yellow',alpha=0.62,ec='darkorange',lw=2.5,zorder=7))
    ax.set_aspect('equal');ax.set_xticks([]);ax.set_yticks([])
    ax.set_title(f'{tid}  k={k}  s*={wt[tid]}   ~ {grp}\nmirror@{sorted(set(p for p,_ in mir))}  glide@{sorted(set(p for p,_ in gl))}  2-fold={4 if rt is not None else 0}',fontsize=10)
    ax.set_xlim(-R*0.62,R*0.62);ax.set_ylim(-R*0.62,R*0.62)
fig.suptitle('Exception tilings — symmetry diagram v3 (red=mirror, blue dashed=glide, gold=2-fold, yellow=fundamental domain)',fontsize=13)
plt.tight_layout(rect=[0,0,1,0.96]);fig.savefig('experiments/results/elong-exceptions-symdiagram.png',dpi=105,bbox_inches='tight')
for tid in ids:
    e=G[tid];seed=[cx(s) for s in e['Seed']]
    v1,v2,mir,gl,rt,ops=analyse(seed,cx(e['T1']),cx(e['T2']))
    print(f"{tid}: mirror@{sorted(set(p for p,_ in mir))} glide@{sorted(set(p for p,_ in gl))} 2fold={'Y' if rt is not None else 'N'}")
