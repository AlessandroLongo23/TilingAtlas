// Recover the lattice rep-tile substitution rules by exhaustive exact cover.
//
//   node scripts/derive-substitution-rules.mjs
//
// Provenance for the chair, sphinx and half-hex in lib/substitution/rules.ts. The Tilings Encyclopedia
// publishes each substitution as a raster image, and transforms measured off a PNG do not close, so
// nothing in rules.ts was read from a picture. What the encyclopedia states in PROSE is enough:
//
//   chair    "the set of vertex points in the tiling obviously spans a square lattice"; Rep-Tiles
//   sphinx   "a classical example of a substitution with inflation factor 2 […] the well-known
//            related rep-tile"; the prototile "is not mirror symmetric"
//   half-hex Rep-Tiles, Self-Similar Substitution, 1 prototile; the name fixes the shape (half a
//            regular hexagon), and the rule "occurs already in [GS87], see Exercise 10.1.3"
//
// All three prototiles are therefore lattice polyforms that tile a scaled copy of themselves, which
// turns rule recovery into a finite search: build the prototile from unit cells, scale it, and
// enumerate every exact cover of the scaled copy by unscaled copies under all lattice symmetries.
//
// All three come back with EXACTLY ONE dissection at factor 2, so the rule is forced by the prototile
// and no image-reading judgement is left to get wrong. Higher factors are reported too and are NOT
// unique (half-hex at 3 has 49, chair and sphinx at 3 have 4 each) — which is precisely why the atlas
// ships only the factor-2 rules. Naming one of 49 as "the encyclopedia's" would be a guess.
//
// The last section sweeps every free polyomino up to 6 cells for rep-4. It is a negative result kept
// on purpose: apart from the L-tromino (the chair), the only polyominoes with a UNIQUE rep-4
// dissection are bars and rectangles, whose tilings are periodic. There is no further honest
// polyomino candidate to add to the shelf.
//
// The pinwheel needs a different method entirely; see scripts/derive-pinwheel-rule.mjs.
const SQ3H = Math.sqrt(3) / 2;
const centroid = (c) => { let x=0,y=0; for (const [a,b] of c){x+=a;y+=b;} return [x/c.length, y/c.length]; };
const keySquare = ([x,y]) => `${Math.round(x*2)},${Math.round(y*2)}`;
const keyTri = ([x,y]) => `${Math.round(x*2)},${Math.round((y/SQ3H)*3)}`;
const rot = (a) => ([x,y]) => [x*Math.cos(a)-y*Math.sin(a), x*Math.sin(a)+y*Math.cos(a)];
const refl = ([x,y]) => [x,-y];
const tr = (dx,dy) => ([x,y]) => [x+dx,y+dy];
const applyForm = (f,g) => f.map((c) => c.map(g));
const compose = (...fs) => (p) => fs.reduceRight((q,f) => f(q), p);
function symmetries(n, m) { const o=[]; for (let k=0;k<n;k++){const r=rot(2*Math.PI*k/n); o.push({name:`r${k}`,f:r}); if(m) o.push({name:`r${k}m`,f:compose(r,refl)});} return o; }

const unitSquare = (x,y) => [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
const triUp = (k,r) => { const x=k+r/2, y=r*SQ3H; return [[x,y],[x+1,y],[x+0.5,y+SQ3H]]; };
const triDown = (k,r) => { const x=k+r/2, y=r*SQ3H; return [[x+0.5,y+SQ3H],[x+1.5,y+SQ3H],[x+1,y]]; };

function inside(poly, [px,py]) { let h=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j]; if((yi>py)!==(yj>py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) h=!h;} return h; }
const signedArea = (c) => { let s=0; for(let i=0,j=c.length-1;i<c.length;j=i++) s+=(c[j][0]-c[i][0])*(c[j][1]+c[i][1]); return s/2; };

function outline(formRaw) {
	const form = formRaw.map((c)=> signedArea(c)<0 ? c : [...c].reverse());
	const k = ([x,y]) => `${Math.round(x*1e6)},${Math.round(y*1e6)}`;
	const cnt = new Map(), edges = new Map();
	for (const c of form) for (let i=0;i<c.length;i++){ const a=c[i],b=c[(i+1)%c.length]; const id=[k(a),k(b)].sort().join("~"); cnt.set(id,(cnt.get(id)??0)+1); }
	for (const c of form) for (let i=0;i<c.length;i++){ const a=c[i],b=c[(i+1)%c.length]; if(cnt.get([k(a),k(b)].sort().join("~"))===1) edges.set(k(a),[a,b]); }
	const start = edges.keys().next().value; const pts=[]; let cur=start;
	do { const [a,b]=edges.get(cur); pts.push(a); cur=k(b); } while (cur!==start && pts.length<500);
	return pts.filter((p,i)=>{ const a=pts[(i-1+pts.length)%pts.length], b=pts[(i+1)%pts.length];
		return Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))>1e-9; });
}

/** Unit cells of the ambient lattice whose centroid lies inside the form scaled by m. */
function scaledCells(form, m, lattice) {
	const ol = outline(form).map(([x,y]) => [x*m, y*m]);
	let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
	for (const [x,y] of ol){ minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y); }
	const out=[];
	if (lattice==="square") {
		for (let i=Math.floor(minx)-1;i<=Math.ceil(maxx);i++) for (let j=Math.floor(miny)-1;j<=Math.ceil(maxy);j++){
			const c=unitSquare(i,j); if (inside(ol, centroid(c))) out.push(c); }
	} else {
		const rmax=Math.ceil(maxy/SQ3H)+1;
		for (let r=Math.floor(miny/SQ3H)-1;r<=rmax;r++) for (let k=Math.floor(minx-r/2)-2;k<=Math.ceil(maxx);k++){
			for (const c of [triUp(k,r), triDown(k,r)]) if (inside(ol, centroid(c))) out.push(c); }
	}
	return out;
}

function placements(proto, syms, region, key) {
	const set = new Set(region.map((c)=>key(centroid(c))));
	const seen = new Map();
	for (const s of syms) { const or = applyForm(proto, s.f); const cs = or.map(centroid);
		for (const t of region) { const [tx,ty]=centroid(t);
			for (let p=0;p<cs.length;p++){ const dx=tx-cs[p][0], dy=ty-cs[p][1];
				const mv = applyForm(or, tr(dx,dy)); const ks = mv.map((c)=>key(centroid(c)));
				if (!ks.every((k)=>set.has(k))) continue;
				const id=[...ks].sort().join("|"); if(seen.has(id)) continue;
				seen.set(id,{sym:s.name,dx,dy,keys:ks}); } } }
	return [...seen.values()];
}

function exactCover(region, places, key, cap = 5000) {
	const cells = region.map((c)=>key(centroid(c)));
	const byCell = new Map(cells.map((c)=>[c,[]]));
	for (const p of places) for (const k of p.keys) byCell.get(k).push(p);
	const used=new Set(), chosen=[], sols=[];
	function step(){ if (sols.length>=cap) return;
		let best=null,bo=null;
		for (const c of cells){ if(used.has(c)) continue;
			const o=byCell.get(c).filter((p)=>p.keys.every((k)=>!used.has(k)));
			if(best===null||o.length<bo.length){best=c;bo=o;} if(o.length===0) return; }
		if(best===null){ sols.push([...chosen]); return; }
		for (const p of bo){ for(const k of p.keys) used.add(k); chosen.push(p); step(); chosen.pop(); for(const k of p.keys) used.delete(k); } }
	step(); return sols;
}

const R3 = Math.sqrt(3);
function sym(v){ for(let b=-8;b<=8;b++){ const a2=(v-b*R3/2)*2, a=Math.round(a2);
	if(Math.abs(a2-a)<1e-9 && Math.abs(a)<=80){ const ip=a%2===0?String(a/2):`${a}/2`;
		if(b===0) return ip; const bp=b%2===0?`${b/2}*R3`:`${b}*R3/2`;
		return a===0?bp:`${ip} + ${bp}`.replace("+ -","- "); } } return v.toFixed(12); }
function linearOf(name,n){ const m=/^r(\d+)(m?)$/.exec(name); const a=2*Math.PI*Number(m[1])/n;
	const c=Math.cos(a), s=Math.sin(a); return m[2]==="m"?[c,s,s,-c]:[c,-s,s,c]; }

const CHAIR=[unitSquare(0,0),unitSquare(1,0),unitSquare(0,1)];
const SPHINX=[triUp(0,0),triDown(0,0),triUp(1,0),triDown(1,0),triUp(2,0),triUp(0,1)];
const HALFHEX=[triUp(0,0),triDown(0,0),triUp(1,0)];

const CASES = [
	// The three rules the atlas ships, each unique at factor 2.
	{ name:"Chair @2  (SHIPPED)", proto:CHAIR, m:2, lattice:"square" },
	{ name:"Sphinx @2  (SHIPPED)", proto:SPHINX, m:2, lattice:"tri" },
	{ name:"Half-Hex @2  (SHIPPED)", proto:HALFHEX, m:2, lattice:"tri" },
	// Higher factors, none unique — reported so the decision not to ship them is checkable.
	// Chair @4 is the 409 quoted in rules.ts as where a random substitution would start.
	{ name:"Half-Hex @3", proto:HALFHEX, m:3, lattice:"tri" },
	{ name:"Chair @3 (chair variant, 9 tiles)", proto:CHAIR, m:3, lattice:"square" },
	{ name:"Sphinx @3 (sphinx-9)", proto:SPHINX, m:3, lattice:"tri" },
	{ name:"Chair @4", proto:CHAIR, m:4, lattice:"square" },
];

for (const c of CASES) {
	const key = c.lattice==="square"?keySquare:keyTri;
	const syms = c.lattice==="square"?symmetries(4,true):symmetries(6,true);
	const region = scaledCells(c.proto, c.m, c.lattice);
	const expect = c.proto.length * c.m * c.m;
	const pl = placements(c.proto, syms, region, key);
	const sols = exactCover(region, pl, key);
	console.log(`\n=== ${c.name} ===`);
	console.log(`region cells ${region.length} (expect ${expect}), placements ${pl.length}, tiles ${c.m*c.m}`);
	console.log(`DISSECTIONS: ${sols.length}${region.length!==expect?"   !! region size mismatch":""}`);
	if (sols.length===1) {
		const n = c.lattice==="square"?4:6;
		console.log(`outline: [${outline(c.proto).map(([x,y])=>`[${sym(x)}, ${sym(y)}]`).join(", ")}]`);
		for (const p of sols[0]) { const [a,b,d,e]=linearOf(p.sym,n);
			console.log(`{ tile: 0, m: [${sym(a)}, ${sym(b)}, ${sym(p.dx)}, ${sym(d)}, ${sym(e)}, ${sym(p.dy)}] },`); }
	}
}

// --- polyomino rep-4 sweep -------------------------------------------------------------------
const SYM8 = [
	([x,y])=>[x,y], ([x,y])=>[-y,x], ([x,y])=>[-x,-y], ([x,y])=>[y,-x],
	([x,y])=>[-x,y], ([x,y])=>[x,-y], ([x,y])=>[y,x], ([x,y])=>[-y,-x],
];
const norm = (cells) => { const mx=Math.min(...cells.map(c=>c[0])), my=Math.min(...cells.map(c=>c[1]));
	return cells.map(([x,y])=>[x-mx,y-my]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]); };
const keyOf = (cells) => norm(cells).map(c=>c.join(",")).join("|");
const canon = (cells) => SYM8.map(f=>keyOf(cells.map(f))).sort()[0];

function polyominoes(n) {
	let cur = new Map([[canon([[0,0]]), [[0,0]]]]);
	for (let s=1; s<n; s++) {
		const next = new Map();
		for (const cells of cur.values()) {
			const have = new Set(cells.map(c=>c.join(",")));
			for (const [x,y] of cells) for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
				const k = `${x+dx},${y+dy}`;
				if (have.has(k)) continue;
				const grown = [...cells, [x+dx,y+dy]];
				next.set(canon(grown), norm(grown));
			}
		}
		cur = next;
	}
	return [...cur.values()];
}

/** All ways to tile the 2x copy of `cells` with 4 copies (any of the 8 symmetries, any translation). */
function repFour(cells) {
	const region = new Set();
	for (const [x,y] of cells) for (const dx of [0,1]) for (const dy of [0,1]) region.add(`${2*x+dx},${2*y+dy}`);
	const regionArr = [...region].map(s=>s.split(",").map(Number));
	if (region.size !== cells.length*4) return null;

	const places = new Map();
	for (const f of SYM8) {
		const or = cells.map(f);
		for (const [tx,ty] of regionArr) for (const [ox,oy] of or) {
			const dx = tx-ox, dy = ty-oy;
			const ks = or.map(([x,y])=>`${x+dx},${y+dy}`);
			if (!ks.every(k=>region.has(k))) continue;
			places.set([...ks].sort().join("|"), ks);
		}
	}
	const byCell = new Map(regionArr.map(c=>[c.join(","),[]]));
	for (const ks of places.values()) for (const k of ks) byCell.get(k).push(ks);
	const used=new Set(); let count=0; const first=[];  const chosen=[];
	(function step(){ if (count>200) return;
		let best=null,bo=null;
		for (const c of byCell.keys()){ if(used.has(c)) continue;
			const o=byCell.get(c).filter(ks=>ks.every(k=>!used.has(k)));
			if(best===null||o.length<bo.length){best=c;bo=o;} if(o.length===0) return; }
		if(best===null){ count++; if(count===1) first.push(...chosen.map(c=>[...c])); return; }
		for (const ks of bo){ for(const k of ks) used.add(k); chosen.push(ks); step(); chosen.pop(); for(const k of ks) used.delete(k); } })();
	return count;
}

for (const n of [2,3,4,5,6]) {
	const all = polyominoes(n);
	const hits = all.map(p => [p, repFour(p)]).filter(([, c]) => c && c > 0);
	console.log(`\n=== ${n}-ominoes: ${all.length} free shapes, ${hits.length} are rep-4 ===`);
	for (const [p, c] of hits) {
		const w = Math.max(...p.map(q=>q[0]))+1, h = Math.max(...p.map(q=>q[1]))+1;
		const grid = Array.from({length:h},()=>Array(w).fill("."));
		for (const [x,y] of p) grid[h-1-y][x] = "#";
		console.log(`  dissections: ${c}${c===1?"  <= UNIQUE":""}   ${grid.map(r=>r.join("")).join(" / ")}`);
	}
}
