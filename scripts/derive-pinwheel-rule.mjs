// Recover the pinwheel substitution by exhaustive search over rational rigid motions.
//
//   node scripts/derive-pinwheel-rule.mjs
//
// Provenance for PINWHEEL in lib/substitution/rules.ts. Lattice exact cover (the method used for the
// chair, sphinx and half-hex) does not apply here: the children are not lattice-aligned, because the
// expansion turns as well as scales.
//
// What makes the search finite instead is a sentence the encyclopedia states in prose: "despite the
// occurrance of irrational edge lengths and incommensurate angles, all vertices of the pinwheel
// tiling have rational coordinates". A child with rational vertices has a rational unit leg vector,
// so its rotation is a point of the rational unit circle; at denominator 5 that is exactly the 12
// directions below, 24 motions once reflections are included.
//
// Radin's prototile T is the right triangle with legs 1 and 2. Expanding by the Gaussian integer 2+i
// scales by sqrt5 and turns by atan(1/2), giving the integer-vertex triangle (0,0),(4,2),(-1,2) of
// area 5, so exactly five copies of T fit.
//
// Cover is decided on a sample grid rather than on lattice cells. That is sound here because all five
// pieces are congruent to T, so any exact cover of the samples by five pieces inside the expanded
// triangle already accounts for the full area 5 = 5 x 1 and cannot be hiding a sliver.
//
// The search returns TWO dissections. Four of the five tiles are forced; the remaining region is a
// 1x2 rectangle, which two copies of T fill across either diagonal. rules.ts ships the cut whose
// children are 3 reflected and 2 direct, so both handednesses occur at every level — which is what
// the literature describes for the pinwheel ("two prototiles consisting of a right triangle with legs
// of lengths 1 and 2 and its reflection [...] both orientations occur"). The other cut makes all five
// children reflected, so handedness would alternate by level and any finite patch would be
// single-handed.
//
// That rectangle is also the cheapest genuine random substitution available in this shelf: the two
// rules have identical tile counts, so they are compatible, and mixing them per tile is legal.

const T = [[0,0],[2,0],[0,1]];
const E = [[2,-1],[1,2]];                       // multiplication by 2+i
const BIG = T.map(([x,y]) => [E[0][0]*x+E[0][1]*y, E[1][0]*x+E[1][1]*y]);

const area = (p) => { let s=0; for(let i=0,j=p.length-1;i<p.length;j=i++) s+=p[j][0]*p[i][1]-p[i][0]*p[j][1]; return Math.abs(s)/2; };
function inside(poly,[px,py]){ let h=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];
	if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)h=!h;} return h; }
/** Signed distance-ish test allowing the boundary, for convex polys given counter-clockwise. */
function insideClosed(poly,[px,py],eps=1e-9){
	const a = area(poly); let sign = 0;
	for(let i=0;i<poly.length;i++){ const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length];
		const cr=(x2-x1)*(py-y1)-(y2-y1)*(px-x1);
		if(Math.abs(cr)<eps*Math.max(1,a)) continue;
		const s=Math.sign(cr); if(sign===0) sign=s; else if(s!==sign) return false; }
	return true;
}

// The 12 rational unit vectors with denominator dividing 5.
const UNITS = [];
for (let a=-5;a<=5;a++) for (let b=-5;b<=5;b++) if (a*a+b*b===25) UNITS.push([a/5,b/5]);

const LINEARS = [];
for (const [c,s] of UNITS) { LINEARS.push([c,-s,s,c]); LINEARS.push([c,s,s,-c]); }  // rotation, reflection

const applyL = ([a,b,d,e],[x,y]) => [a*x+b*y, d*x+e*y];
const key = (p) => p.map(([x,y])=>`${Math.round(x*100)},${Math.round(y*100)}`).sort().join("|");

// Candidate placements: linear part x translation on (1/5)Z^2, kept when the whole triangle is in BIG.
const xs = BIG.map(p=>p[0]), ys = BIG.map(p=>p[1]);
const places = new Map();
for (const L of LINEARS) {
	const base = T.map(v => applyL(L, v));
	for (let i=Math.floor(Math.min(...xs))*5-5; i<=Math.ceil(Math.max(...xs))*5+5; i++)
	for (let j=Math.floor(Math.min(...ys))*5-5; j<=Math.ceil(Math.max(...ys))*5+5; j++) {
		const dx=i/5, dy=j/5;
		const tri = base.map(([x,y])=>[x+dx,y+dy]);
		if (!tri.every(v => insideClosed(BIG, v, 1e-9))) continue;
		places.set(key(tri), { L, dx, dy, tri });
	}
}
console.log(`BIG area ${area(BIG)}, prototile area ${area(T)}, candidate placements ${places.size}`);

// Sample grid, off-lattice so samples miss seams.
const step = 1/9, samples = [];
for (let x=Math.min(...xs)+0.0137; x<Math.max(...xs); x+=step)
	for (let y=Math.min(...ys)+0.0219; y<Math.max(...ys); y+=step)
		if (inside(BIG,[x,y])) samples.push([x,y]);
console.log(`samples inside BIG: ${samples.length}`);

const list = [...places.values()];
const cover = list.map(p => { const s=new Set(); samples.forEach((q,i)=>{ if(inside(p.tri,q)) s.add(i); }); return s; });
const kept = list.filter((_,i)=>cover[i].size>0);
const keptCover = cover.filter(s=>s.size>0);
console.log(`placements covering >=1 sample: ${kept.length}`);

const byPoint = new Map(samples.map((_,i)=>[i,[]]));
keptCover.forEach((s,i)=>{ for(const q of s) byPoint.get(q).push(i); });

const used=new Set(), chosen=[], sols=[];
(function step2(){ if(sols.length>=50) return;
	let best=null,bo=null;
	for (const q of byPoint.keys()){ if(used.has(q)) continue;
		const o=byPoint.get(q).filter(i=>![...keptCover[i]].some(k=>used.has(k)));
		if(best===null||o.length<bo.length){best=q;bo=o;} if(o.length===0) return; }
	if(best===null){ sols.push([...chosen]); return; }
	for (const i of bo){ for(const k of keptCover[i]) used.add(k); chosen.push(i); step2(); chosen.pop(); for(const k of keptCover[i]) used.delete(k); } })();

console.log(`\nDISSECTIONS of E*T into 5 copies of T: ${sols.length}`);
sols.forEach((s,n)=>{
	console.log(`  solution ${n}: ${s.length} pieces, total area ${s.reduce((a,i)=>a+area(kept[i].tri),0)}`);
	for (const i of s) { const p=kept[i]; console.log(`    m: [${p.L[0]}, ${p.L[1]}, ${p.dx}, ${p.L[2]}, ${p.L[3]}, ${p.dy}]   det ${(p.L[0]*p.L[3]-p.L[1]*p.L[2]).toFixed(0)}`); }
});
