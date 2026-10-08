/**
* A vertex in a circular doubly linked list representing a polygon ring.
* `prev`/`next` are always linked (set immediately after {@link createNode}), so they're typed
* non-null; `prevZ`/`nextZ` are the z-order list links and are null at the ends.
*
* @typedef {object} Node
* @property {number} i vertex index in the coordinates array
* @property {number} x vertex x coordinate
* @property {number} y vertex y coordinate
* @property {Node} prev previous vertex node in the polygon ring
* @property {Node} next next vertex node in the polygon ring
* @property {number} z z-order curve value; doubles as the owning block index during eliminateHoles
* @property {Node | null} prevZ previous node in z-order
* @property {Node | null} nextZ next node in z-order
*/
/** @type {Set<Node>} */
const steiners = /* @__PURE__ */ new Set();
let filteredOut = false;
/**
* Triangulate a polygon given as a flat array of vertex coordinates.
*
* @param {ArrayLike<number>} data flat array of vertex coordinates
* @param {ArrayLike<number> | null} [holeIndices] indices (in vertices, not coordinates) where each hole ring starts
* @param {number} [dim=2] number of coordinates per vertex in `data`
* @returns {number[]} triangles as triplets of vertex indices into `data`
* @example earcut([10,0, 0,50, 60,60, 70,10]); // [1,0,3, 3,2,1]
*/
function earcut(data, holeIndices, dim = 2) {
	const hasHoles = holeIndices && holeIndices.length;
	const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
	if (steiners.size) steiners.clear();
	let outerNode = linkedList(data, 0, outerLen, dim, true);
	/** @type {number[]} */
	const triangles = [];
	if (!outerNode || outerNode.next === outerNode.prev) return triangles;
	let minX = 0, minY = 0, invSize = 0;
	if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
	if (data.length > 80 * dim) {
		minX = data[0];
		minY = data[1];
		let maxX = minX;
		let maxY = minY;
		for (let i = dim; i < outerLen; i += dim) {
			const x = data[i];
			const y = data[i + 1];
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
		invSize = Math.max(maxX - minX, maxY - minY);
		invSize = invSize !== 0 ? 32767 / invSize : 0;
	}
	earcutLinked(outerNode, triangles, minX, minY, invSize);
	return triangles;
}
/** @param {ArrayLike<number>} data @param {number} start @param {number} end @param {number} dim @param {boolean} clockwise @returns {Node | null} */
function linkedList(data, start, end, dim, clockwise) {
	/** @type {Node | null} */
	let last = null;
	if (clockwise === signedArea(data, start, end, dim) > 0) for (let i = start; i < end; i += dim) last = insertNode(i / dim | 0, data[i], data[i + 1], last);
	else for (let i = end - dim; i >= start; i -= dim) last = insertNode(i / dim | 0, data[i], data[i + 1], last);
	if (last && equals(last, last.next)) {
		removeNode(last);
		last = last.next;
	}
	return last;
}
/** @param {Node} start @param {Node} [end] @returns {Node} */
function filterPoints(start, end = start) {
	const full = end === start;
	let p = start, again;
	do {
		again = false;
		if (p !== p.next && (steiners.size === 0 || !steiners.has(p)) && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
			if (full || p === end) end = p.prev;
			filteredOut = true;
			removeNode(p);
			p = p.prev;
			again = true;
		} else if (full || p !== end) {
			p = p.next;
			again = !full;
		}
	} while (again || p !== end);
	return end;
}
/** @param {Node} ear @param {number[]} triangles @param {number} minX @param {number} minY @param {number} invSize */
function earcutLinked(ear, triangles, minX, minY, invSize) {
	if (invSize) indexCurve(ear, minX, minY, invSize);
	let stop = ear, cured = false;
	while (ear.prev !== ear.next) {
		const prev = ear.prev;
		/** @type {Node} */
		const next = ear.next;
		if (area(prev, ear, next) < 0 && (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear))) {
			triangles.push(prev.i, ear.i, next.i);
			removeNode(ear);
			ear = next;
			stop = next;
			continue;
		}
		ear = next;
		if (ear === stop) {
			filteredOut = false;
			ear = filterPoints(ear);
			if (filteredOut) {
				stop = ear;
				continue;
			}
			if (!cured) {
				ear = cureLocalIntersections(ear, triangles);
				stop = ear;
				cured = true;
				continue;
			}
			splitEarcut(ear, triangles, minX, minY, invSize);
			break;
		}
	}
}
/** @param {Node} ear @returns {boolean} */
function isEar(ear) {
	const a = ear.prev, b = ear, c = ear.next, ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y, x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
	let p = c.next;
	while (p !== a) {
		if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !(ax === p.x && ay === p.y) && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
		p = p.next;
	}
	return true;
}
/** @param {Node} ear @param {number} minX @param {number} minY @param {number} invSize @returns {boolean} */
function isEarHashed(ear, minX, minY, invSize) {
	const a = ear.prev, b = ear, c = ear.next, ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y, x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy), minZ = zOrder(x0, y0, minX, minY, invSize), maxZ = zOrder(x1, y1, minX, minY, invSize);
	let p = ear.prevZ;
	while (p && p.z >= minZ) {
		if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== c && !(ax === p.x && ay === p.y) && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
		p = p.prevZ;
	}
	let n = ear.nextZ;
	while (n && n.z <= maxZ) {
		if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== c && !(ax === n.x && ay === n.y) && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
		n = n.nextZ;
	}
	return true;
}
/** @param {Node} start @param {number[]} triangles @returns {Node} */
function cureLocalIntersections(start, triangles) {
	let p = start;
	let cured = false;
	do {
		const a = p.prev, b = p.next.next;
		if (intersects(a, p, p.next, b, false) && locallyInside(a, b) && locallyInside(b, a)) {
			triangles.push(a.i, p.i, b.i);
			removeNode(p);
			removeNode(p.next);
			p = start = b;
			cured = true;
		}
		p = p.next;
	} while (p !== start);
	return cured ? filterPoints(p) : p;
}
/** @param {Node} start @param {number[]} triangles @param {number} minX @param {number} minY @param {number} invSize */
function splitEarcut(start, triangles, minX, minY, invSize) {
	let a = start;
	do {
		let b = a.next.next;
		while (b !== a.prev) {
			if (a.i !== b.i && isValidDiagonal(a, b)) {
				let c = splitPolygon(a, b);
				a = filterPoints(a, a.next);
				c = filterPoints(c, c.next);
				earcutLinked(a, triangles, minX, minY, invSize);
				earcutLinked(c, triangles, minX, minY, invSize);
				return;
			}
			b = b.next;
		}
		a = a.next;
	} while (a !== start);
}
let indexActive = false;
/** @param {ArrayLike<number>} data @param {ArrayLike<number>} holeIndices @param {Node} outerNode @param {number} dim @returns {Node} */
function eliminateHoles(data, holeIndices, outerNode, dim) {
	const queue = [];
	for (let i = 0, len = holeIndices.length; i < len; i++) {
		const list = linkedList(data, holeIndices[i] * dim, i < len - 1 ? holeIndices[i + 1] * dim : data.length, dim, false);
		if (list === list.next) steiners.add(list);
		queue.push(getLeftmost(list));
	}
	queue.sort(compareXYSlope);
	buildBlockIndex(data.length / dim, holeIndices.length);
	indexSegment(outerNode, outerNode);
	indexActive = true;
	for (let i = 0; i < queue.length; i++) outerNode = eliminateHole(queue[i], outerNode);
	indexActive = false;
	return filterPoints(outerNode);
}
/** @param {Node} a @param {Node} b @returns {number} */
function compareXYSlope(a, b) {
	return a.x - b.x || a.y - b.y || (a.next.y - a.y) / (a.next.x - a.x) - (b.next.y - b.y) / (b.next.x - b.x);
}
/** @param {Node} hole @param {Node} outerNode @returns {Node} */
function eliminateHole(hole, outerNode) {
	const bridge = findHoleBridge(hole, outerNode);
	if (!bridge) return outerNode;
	const bridgeReverse = splitPolygon(bridge, hole);
	const bridge2 = bridgeReverse.next;
	indexSegment(bridge, bridge2.next);
	filterPoints(bridgeReverse, bridgeReverse.next);
	return filterPoints(bridge, bridge.next);
}
const K = 16;
let blockBBox = /* @__PURE__ */ new Float64Array(0);
let numBlocks = 0;
/** @type {Node[]} */
const blockHead = [];
/** @type {Node[]} */
const blockStop = [];
/** @param {number} maxNodes @param {number} numHoles */
function buildBlockIndex(maxNodes, numHoles) {
	const maxBlocks = Math.ceil((maxNodes + 2 * numHoles) / K) + numHoles + 2;
	if (blockBBox.length < maxBlocks * 4) blockBBox = new Float64Array(maxBlocks * 4);
	numBlocks = 0;
}
/** @param {Node} head @param {Node} stop */
function indexSegment(head, stop) {
	let p = head;
	do {
		const b = numBlocks++;
		blockHead[b] = p;
		let minX = p.x, minY = p.y, maxX = p.x, maxY = p.y;
		let k = 0;
		do {
			const c = p.next;
			p.z = b;
			if (c.x < minX) minX = c.x;
			if (c.x > maxX) maxX = c.x;
			if (c.y < minY) minY = c.y;
			if (c.y > maxY) maxY = c.y;
			p = c;
		} while (++k < K && p !== stop);
		blockStop[b] = p;
		const g = b * 4;
		blockBBox[g] = minX;
		blockBBox[g + 1] = minY;
		blockBBox[g + 2] = maxX;
		blockBBox[g + 3] = maxY;
	} while (p !== stop);
}
/** @param {Node} head @param {Node} tail */
function growBlock(head, tail) {
	const g = head.z * 4;
	if (tail.x < blockBBox[g]) blockBBox[g] = tail.x;
	if (tail.y < blockBBox[g + 1]) blockBBox[g + 1] = tail.y;
	if (tail.x > blockBBox[g + 2]) blockBBox[g + 2] = tail.x;
	if (tail.y > blockBBox[g + 3]) blockBBox[g + 3] = tail.y;
}
/** @param {number} b @returns {Node} */
function liveBlockStop(b) {
	let stop = blockStop[b];
	while (stop.prev.next !== stop) stop = stop.next;
	blockStop[b] = stop;
	return stop;
}
/** @param {number} b @returns {Node} */
function liveBlockHead(b) {
	let head = blockHead[b];
	while (head.prev.next !== head) head = head.next;
	blockHead[b] = head;
	return head;
}
/** @param {Node} hole @param {Node} outerNode @returns {Node | null} */
function findHoleBridge(hole, outerNode) {
	let p = outerNode;
	const hx = hole.x;
	const hy = hole.y;
	let qx = -Infinity;
	/** @type {Node | undefined} */
	let m;
	if (equals(hole, p)) return p;
	for (let b = 0, g = 0; b < numBlocks; b++, g += 4) {
		if (hy < blockBBox[g + 1] || hy > blockBBox[g + 3] || blockBBox[g] > hx || blockBBox[g + 2] <= qx) continue;
		const stop = liveBlockStop(b);
		p = liveBlockHead(b);
		do {
			if (p.prev.next === p) {
				if (equals(hole, p.next)) return p.next;
				else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
					const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
					if (x <= hx && x > qx) {
						qx = x;
						m = p.x < p.next.x ? p : p.next;
						if (x === hx) return m;
					}
				}
			}
			p = p.next;
		} while (p !== stop);
	}
	if (!m) return null;
	const mx = m.x;
	const my = m.y;
	const tminY = Math.min(hy, my);
	const tmaxY = Math.max(hy, my);
	let tanMin = Infinity;
	for (let b = 0, g = 0; b < numBlocks; b++, g += 4) {
		if (blockBBox[g + 2] < mx || blockBBox[g] > hx || blockBBox[g + 3] < tminY || blockBBox[g + 1] > tmaxY) continue;
		const stop = liveBlockStop(b);
		p = liveBlockHead(b);
		do {
			if (p.prev.next === p && hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
				const tan = Math.abs(hy - p.y) / (hx - p.x);
				if ((locallyInside(p, hole) || p.y === hy && p.next.y === hy && p.next.x > hx) && (tan < tanMin || tan === tanMin && (p.x > m.x || p.x === m.x && sectorContainsSector(m, p)))) {
					m = p;
					tanMin = tan;
				}
			}
			p = p.next;
		} while (p !== stop);
	}
	return m;
}
/** @param {Node} m @param {Node} p @returns {boolean} */
function sectorContainsSector(m, p) {
	return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}
/** @type {Node[]} */
const sortArr = [];
/** @type {Node[]} */
let sortBuf = [];
let zArr = /* @__PURE__ */ new Uint32Array(0);
let zBuf = /* @__PURE__ */ new Uint32Array(0);
const counts = /* @__PURE__ */ new Uint32Array(256);
/** @param {Node} start @param {number} minX @param {number} minY @param {number} invSize */
function indexCurve(start, minX, minY, invSize) {
	let p = start;
	let n = 0;
	do {
		p.z = zOrder(p.x, p.y, minX, minY, invSize);
		sortArr[n++] = p;
		p = p.next;
	} while (p !== start);
	sortNodes(n);
	/** @type {Node | null} */
	let prev = null;
	for (let i = 0; i < n; i++) {
		const node = sortArr[i];
		node.prevZ = prev;
		if (prev) prev.nextZ = node;
		prev = node;
	}
	/** @type {Node} */ prev.nextZ = null;
	sortArr.fill(null, 0, n);
	sortBuf.fill(null, 0, n);
}
/** @param {number} n */
function sortNodes(n) {
	if (n <= 32) {
		for (let i = 1; i < n; i++) {
			const node = sortArr[i], z = node.z;
			let j = i - 1;
			while (j >= 0 && sortArr[j].z > z) {
				sortArr[j + 1] = sortArr[j];
				j--;
			}
			sortArr[j + 1] = node;
		}
		return;
	}
	if (zArr.length < n) {
		zArr = new Uint32Array(n);
		zBuf = new Uint32Array(n);
		sortBuf = new Array(n);
	}
	for (let i = 0; i < n; i++) zArr[i] = sortArr[i].z;
	radixPass(n, sortArr, zArr, sortBuf, zBuf, 0);
	radixPass(n, sortBuf, zBuf, sortArr, zArr, 8);
	radixPass(n, sortArr, zArr, sortBuf, zBuf, 16);
	radixPass(n, sortBuf, zBuf, sortArr, zArr, 24);
}
/** @param {number} n @param {Node[]} src @param {Uint32Array} srcZ @param {Node[]} dst @param {Uint32Array} dstZ @param {number} shift */
function radixPass(n, src, srcZ, dst, dstZ, shift) {
	counts.fill(0);
	for (let i = 0; i < n; i++) counts[srcZ[i] >>> shift & 255]++;
	let sum = 0;
	for (let b = 0; b < 256; b++) {
		const c = counts[b];
		counts[b] = sum;
		sum += c;
	}
	for (let i = 0; i < n; i++) {
		const z = srcZ[i];
		const pos = counts[z >>> shift & 255]++;
		dst[pos] = src[i];
		dstZ[pos] = z;
	}
}
/** @param {number} x @param {number} y @param {number} minX @param {number} minY @param {number} invSize @returns {number} */
function zOrder(x, y, minX, minY, invSize) {
	x = (x - minX) * invSize | 0;
	y = (y - minY) * invSize | 0;
	x = (x | x << 8) & 16711935;
	x = (x | x << 4) & 252645135;
	x = (x | x << 2) & 858993459;
	x = (x | x << 1) & 1431655765;
	y = (y | y << 8) & 16711935;
	y = (y | y << 4) & 252645135;
	y = (y | y << 2) & 858993459;
	y = (y | y << 1) & 1431655765;
	return x | y << 1;
}
/** @param {Node} start @returns {Node} */
function getLeftmost(start) {
	let p = start, leftmost = start;
	do {
		if (p.x < leftmost.x || p.x === leftmost.x && p.y < leftmost.y) leftmost = p;
		p = p.next;
	} while (p !== start);
	return leftmost;
}
/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} cx @param {number} cy @param {number} px @param {number} py @returns {boolean} */
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
	return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
/** @param {Node} a @param {Node} b @returns {boolean} true when the diagonal is valid */
function isValidDiagonal(a, b) {
	const zeroLength = equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0;
	return a.next.i !== b.i && (zeroLength || locallyInside(a, b) && locallyInside(b, a) && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)) && !intersectsPolygon(a, b) && (zeroLength || middleInside(a, b));
}
/** @param {Node} p @param {Node} q @param {Node} r @returns {number} */
function area(p, q, r) {
	return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}
/** @param {Node} p1 @param {Node} p2 @returns {boolean} */
function equals(p1, p2) {
	return p1.x === p2.x && p1.y === p2.y;
}
/** @param {Node} p1 @param {Node} q1 @param {Node} p2 @param {Node} q2 @param {boolean} [includeBoundary] @returns {boolean} */
function intersects(p1, q1, p2, q2, includeBoundary = true) {
	const o1 = area(p1, q1, p2);
	const o2 = area(p1, q1, q2);
	const o3 = area(p2, q2, p1);
	const o4 = area(p2, q2, q1);
	if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
	if (!includeBoundary) return false;
	if (o1 === 0 && onSegment(p1, p2, q1)) return true;
	if (o2 === 0 && onSegment(p1, q2, q1)) return true;
	if (o3 === 0 && onSegment(p2, p1, q2)) return true;
	if (o4 === 0 && onSegment(p2, q1, q2)) return true;
	return false;
}
/** @param {Node} p @param {Node} q @param {Node} r @returns {boolean} */
function onSegment(p, q, r) {
	return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}
/** @param {Node} a @param {Node} b @returns {boolean} */
function intersectsPolygon(a, b) {
	const minX = Math.min(a.x, b.x);
	const maxX = Math.max(a.x, b.x);
	const minY = Math.min(a.y, b.y);
	const maxY = Math.max(a.y, b.y);
	let p = a;
	do {
		const n = p.next;
		if (p.x > maxX && n.x > maxX || p.x < minX && n.x < minX || p.y > maxY && n.y > maxY || p.y < minY && n.y < minY) {
			p = n;
			continue;
		}
		if (p.i !== a.i && n.i !== a.i && p.i !== b.i && n.i !== b.i && intersects(p, n, a, b)) return true;
		p = n;
	} while (p !== a);
	return false;
}
/** @param {Node} a @param {Node} b @returns {boolean} */
function locallyInside(a, b) {
	return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}
/** @param {Node} a @param {Node} b @returns {boolean} */
function middleInside(a, b) {
	let p = a;
	let inside = false;
	const px = (a.x + b.x) / 2;
	const py = (a.y + b.y) / 2;
	do {
		const n = p.next;
		if (p.y > py !== n.y > py && px < (n.x - p.x) * (py - p.y) / (n.y - p.y) + p.x) inside = !inside;
		p = n;
	} while (p !== a);
	return inside;
}
/** @param {Node} a @param {Node} b @returns {Node} */
function splitPolygon(a, b) {
	const a2 = createNode(a.i, a.x, a.y), b2 = createNode(b.i, b.x, b.y), an = a.next, bp = b.prev;
	a.next = b;
	b.prev = a;
	a2.next = an;
	an.prev = a2;
	b2.next = a2;
	a2.prev = b2;
	bp.next = b2;
	b2.prev = bp;
	return b2;
}
/** @param {number} i @param {number} x @param {number} y @param {Node | null} last @returns {Node} */
function insertNode(i, x, y, last) {
	const p = createNode(i, x, y);
	if (!last) {
		p.prev = p;
		p.next = p;
	} else {
		p.next = last.next;
		p.prev = last;
		last.next.prev = p;
		last.next = p;
	}
	return p;
}
/** @param {Node} p */
function removeNode(p) {
	p.next.prev = p.prev;
	p.prev.next = p.next;
	if (p.prevZ) p.prevZ.nextZ = p.nextZ;
	if (p.nextZ) p.nextZ.prevZ = p.prevZ;
	if (indexActive) growBlock(p.prev, p.next);
}
/** @param {number} i @param {number} x @param {number} y @returns {Node} */
function createNode(i, x, y) {
	return {
		i,
		x,
		y,
		prev: null,
		next: null,
		z: 0,
		prevZ: null,
		nextZ: null
	};
}
/**
* Return the relative difference between the polygon area and the area of its triangulation —
* a value near 0 means a correct triangulation. Useful for verifying output in tests.
*
* @param {ArrayLike<number>} data
* @param {ArrayLike<number> | null} holeIndices
* @param {number} dim number of coordinates per vertex in `data`
* @param {ArrayLike<number>} triangles output of {@link earcut}
* @returns {number}
* @example deviation(data, holes, dim, earcut(data, holes, dim)); // ~0 if correct
*/
function deviation(data, holeIndices, dim, triangles) {
	const hasHoles = holeIndices && holeIndices.length;
	const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
	let polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
	if (hasHoles) for (let i = 0, len = holeIndices.length; i < len; i++) {
		const start = holeIndices[i] * dim;
		const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
		polygonArea -= Math.abs(signedArea(data, start, end, dim));
	}
	let trianglesArea = 0;
	for (let i = 0; i < triangles.length; i += 3) {
		const a = triangles[i] * dim;
		const b = triangles[i + 1] * dim;
		const c = triangles[i + 2] * dim;
		trianglesArea += Math.abs((data[a] - data[c]) * (data[b + 1] - data[a + 1]) - (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
	}
	if (trianglesArea === 0) {
		let max = 0;
		for (let i = 0; i < data.length; i += dim) max = Math.max(max, Math.abs(data[i]), Math.abs(data[i + 1]));
		return Math.abs(polygonArea) <= data.length * max * max * Number.EPSILON ? 0 : 1;
	}
	return Math.abs((trianglesArea - polygonArea) / polygonArea);
}
/** @param {ArrayLike<number>} data @param {number} start @param {number} end @param {number} dim @returns {number} */
function signedArea(data, start, end, dim) {
	let sum = 0;
	for (let i = start, j = end - dim; i < end; i += dim) {
		sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
		j = i;
	}
	return sum;
}
/**
* Turn a polygon in multi-dimensional array form (e.g. as in GeoJSON) into the flat form Earcut accepts.
*
* @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} data array of rings; the first ring is the outer contour, the rest are holes
* @returns {{vertices: number[], holes: number[], dimensions: number}}
* @example const {vertices, holes, dimensions} = flatten(geojson.coordinates);
*/
function flatten(data) {
	const vertices = [];
	const holes = [];
	const dimensions = data[0][0].length;
	let holeIndex = 0;
	let prevLen = 0;
	for (const ring of data) {
		for (const p of ring) for (let d = 0; d < dimensions; d++) vertices.push(p[d]);
		if (prevLen) {
			holeIndex += prevLen;
			holes.push(holeIndex);
		}
		prevLen = ring.length;
	}
	return {
		vertices,
		holes,
		dimensions
	};
}
/** @type {Int32Array} */ let edgeStack;
/** @type {Int32Array} */ let he;
/** @type {Int32Array} */ let hTable;
/** @type {Uint32Array} */ let hStamp;
/** @type {Uint8Array} */ let edgeStamp;
let hMask = 0;
let gen = 0;
/**
* Refine a triangulation toward the constrained Delaunay triangulation by legalizing every
* interior edge in place with Lawson flips — maximizing the minimum angle and removing most
* slivers. An optional post-pass for {@link earcut} output, or any manifold triangle-index array
* indexing into `coords`. Adapted from delaunator's edge legalization.
*
* Uses non-robust predicates: float input is fine, and the worst case is a not-quite-Delaunay
* edge, never an invalid mesh.
*
* @param {number[]} triangles triangle indices, as returned by {@link earcut}; mutated in place
* @param {ArrayLike<number>} coords the flat vertex coordinates passed to {@link earcut}
* @param {number} [dim=2] number of coordinates per vertex in `coords`
* @example refine(earcut(data), data);
*/
function refine(triangles, coords, dim = 2) {
	const t = triangles;
	const n = t.length;
	if (n < 6) return;
	ensureScratch(n);
	gen++;
	he.fill(-1, 0, n);
	let i = 0;
	for (let e = 0; e < n; e++) {
		const a = t[e], b = t[nextHE(e)];
		const lo = a < b ? a : b, hi = a < b ? b : a;
		let h = (Math.imul(lo, 2654435761) ^ Math.imul(hi, 2246822507)) & hMask;
		while (hStamp[h] === gen) {
			const s = hTable[h];
			if (s !== -1) {
				const sa = t[s], sb = t[nextHE(s)];
				if (sa === lo && sb === hi || sa === hi && sb === lo) {
					he[e] = s;
					he[s] = e;
					hTable[h] = -1;
					edgeStamp[s] = 1;
					edgeStack[i++] = s;
					break;
				}
			}
			h = h + 1 & hMask;
		}
		if (hStamp[h] !== gen) {
			hTable[h] = e;
			hStamp[h] = gen;
		}
	}
	while (i > 0) {
		const a = edgeStack[--i];
		edgeStamp[a] = 0;
		const b = he[a];
		if (b === -1) continue;
		const a0 = a - a % 3;
		const b0 = b - b % 3;
		const ar = a0 + (a + 2) % 3;
		const al = a0 + (a + 1) % 3;
		const bl = b0 + (b + 2) % 3;
		const br = b0 + (b + 1) % 3;
		const p0 = t[ar], pr = t[a], pl = t[al], p1 = t[bl];
		const x0 = coords[p0 * dim], y0 = coords[p0 * dim + 1];
		const xr = coords[pr * dim], yr = coords[pr * dim + 1];
		const xl = coords[pl * dim], yl = coords[pl * dim + 1];
		const x1 = coords[p1 * dim], y1 = coords[p1 * dim + 1];
		if (!inCircle(x0, y0, xr, yr, xl, yl, x1, y1) && orient(x0, y0, xr, yr, x1, y1) > 0 && orient(x0, y0, x1, y1, xl, yl) > 0) {
			t[a] = p1;
			t[b] = p0;
			const hbl = he[bl], har = he[ar];
			he[a] = hbl;
			if (hbl !== -1) he[hbl] = a;
			he[b] = har;
			if (har !== -1) he[har] = b;
			he[ar] = bl;
			he[bl] = ar;
			if (hbl !== -1 && edgeStamp[a] === 0) {
				edgeStamp[a] = 1;
				edgeStack[i++] = a;
			}
			if (har !== -1 && edgeStamp[b] === 0) {
				edgeStamp[b] = 1;
				edgeStack[i++] = b;
			}
			if (he[al] !== -1 && edgeStamp[al] === 0) {
				edgeStamp[al] = 1;
				edgeStack[i++] = al;
			}
			if (he[br] !== -1 && edgeStamp[br] === 0) {
				edgeStamp[br] = 1;
				edgeStack[i++] = br;
			}
		}
	}
}
/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} cx @param {number} cy */
function orient(ax, ay, bx, by, cx, cy) {
	return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} cx @param {number} cy @param {number} px @param {number} py */
function inCircle(ax, ay, bx, by, cx, cy, px, py) {
	const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
	const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
	const s = ap + bp + cp;
	return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) <= 1e-13 * s * s;
}
/** @param {number} e */
function nextHE(e) {
	return e - e % 3 + (e + 1) % 3;
}
/** @param {number} n */
function ensureScratch(n) {
	if (!edgeStack || edgeStack.length < n) edgeStack = new Int32Array(n);
	if (!he || he.length < n) he = new Int32Array(n);
	if (!edgeStamp || edgeStamp.length < n) edgeStamp = new Uint8Array(n);
	let size = 1;
	while (size < n * 4) size <<= 1;
	if (!hTable || hTable.length < size) {
		hTable = new Int32Array(size);
		hStamp = new Uint32Array(size);
	}
	hMask = size - 1;
}

export { earcut as default, deviation, flatten, refine };