/** @module geomExtrude */

import earcut, { flatten } from "earcut";
import { avec2, avec3, vec3 } from "pex-math";
import { mappings, utils } from "primitive-geometry";

const { TAU, getCellsTypedArray } = utils;

const DIRECTIONS = {
  x: [1, 0, 0],
  "-x": [-1, 0, 0],
  y: [0, 1, 0],
  "-y": [0, -1, 0],
  z: [0, 0, 1],
  "-z": [0, 0, -1],
};

const GENERATED_ATTRIBUTES = new Set(["positions", "normals", "uvs", "cells"]);

const isFlatArray = (attribute) =>
  (Array.isArray(attribute) || ArrayBuffer.isView(attribute)) &&
  !attribute[0]?.length;

/**
 * Find the flat per-vertex attributes of a geometry, eg. `vertexColors`.
 *
 * Told apart by length only: any flat array whose length is a multiple of the
 * vertex count.
 *
 * @param {object} geometry
 * @param {number} vertexCount
 * @param {Iterable<string>} [excluded=["positions", "normals", "uvs", "cells"]]
 *   Attributes left out, eg. the ones a generator computes.
 * @returns {import("./types.js").VertexAttribute[]}
 */
const getVertexAttributes = (
  geometry,
  vertexCount,
  excluded = GENERATED_ATTRIBUTES,
) => {
  const excludedNames = new Set(excluded);
  return Object.entries(geometry)
    .filter(
      ([name, source]) =>
        !excludedNames.has(name) &&
        isFlatArray(source) &&
        source.length &&
        source.length % vertexCount === 0,
    )
    .map(([name, source]) => ({
      name,
      source,
      size: source.length / vertexCount,
    }));
};

/**
 * Copy vertex attributes into a geometry: source vertex i, or
 * `sourceIndices[i]`, to vertex `offset + i`.
 *
 * Target arrays must be allocated, eg. `new source.constructor(count * size)`.
 *
 * @param {object} geometry
 * @param {import("./types.js").VertexAttribute[]} attributes
 * @param {number} offset First target vertex.
 * @param {number} count Number of vertices to copy.
 * @param {ArrayLike<number>} [sourceIndices] Source vertex of each target
 *   vertex.
 */
const copyAttributes = (geometry, attributes, offset, count, sourceIndices) => {
  for (const { name, source, size } of attributes) {
    const target = geometry[name];
    for (let i = 0; i < count; i++) {
      const from = (sourceIndices ? sourceIndices[i] : i) * size;
      const to = (offset + i) * size;
      for (let k = 0; k < size; k++) target[to + k] = source[from + k];
    }
  }
};

const setTriangle = (cells, index, a, b, c, flip) => {
  cells[index] = a;
  cells[index + 1] = flip ? c : b;
  cells[index + 2] = flip ? b : c;
};

const computeSignedArea = (points, loop) => {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i] * 2;
    const b = loop[(i + 1) % loop.length] * 2;
    area += points[a] * points[b + 1] - points[b] * points[a + 1];
  }
  return area / 2;
};

// Even-odd ray casting
const containsPoint = (points, loop, index) => {
  const x = points[index * 2];
  const y = points[index * 2 + 1];
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = points.subarray(loop[i] * 2, loop[i] * 2 + 2);
    const [xj, yj] = points.subarray(loop[j] * 2, loop[j] * 2 + 2);
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const computePerimeter = (positions, loop) => {
  let perimeter = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    perimeter += avec3.distance(positions, loop[i], positions, loop[i + 1]);
  }
  return perimeter;
};

// Twice the area along the facing normal: area-weighted, so small or sliver
// triangles don't skew it
const computeAreaVector = (positions, cells) => {
  const area = vec3.create();
  const ab = vec3.create();
  const ac = vec3.create();

  for (let i = 0; i < cells.length; i += 3) {
    avec3.set(ab, 0, positions, cells[i + 1]);
    avec3.sub(ab, 0, positions, cells[i]);
    avec3.set(ac, 0, positions, cells[i + 2]);
    avec3.sub(ac, 0, positions, cells[i]);
    vec3.add(area, vec3.cross(ab, ac));
  }

  return area;
};

const normalizeOrZ = (area) =>
  vec3.length(area) ? vec3.normalize(area) : DIRECTIONS.z;

// A fan sums to the polygon area vector, convex or not
const fan = (loop) =>
  loop.slice(1, -1).flatMap((index, i) => [loop[0], index, loop[i + 2]]);

// Axes match primitive-geometry planes facing each PlaneDirection
const computePlaneBasis = (normal) => {
  const reference =
    Math.abs(normal[1]) > 0.999 ? [0, 0, -Math.sign(normal[1])] : [0, 1, 0];
  const tangent = vec3.normalize(vec3.cross(reference, normal));
  const bitangent = vec3.cross([...normal], tangent);
  return [tangent, bitangent];
};

const projectPositions = (positions, normal) => {
  const [tangent, bitangent] = computePlaneBasis(normal);
  const count = positions.length / 3;
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    avec2.set2(
      points,
      i,
      avec3.dot(positions, i, tangent, 0),
      avec3.dot(positions, i, bitangent, 0),
    );
  }
  return points;
};

/**
 * Compute the boundary loops of a triangle mesh, holes included: edges used by
 * a single cell, chained following the cells winding.
 *
 * @param {import("./types.js").TypedArrayLike} cells Consistently wound
 *   triangles over welded vertices.
 * @param {number} vertexCount
 * @returns {number[][]} PolylineComplex cells: closed loops repeat their first
 *   index.
 */
const computeBoundary = (cells, vertexCount) => {
  // Half-edge a → b to the third vertex of its cell
  const opposites = new Map();
  for (let i = 0; i < cells.length; i += 3) {
    const [a, b, c] = [cells[i], cells[i + 1], cells[i + 2]];
    opposites.set(a * vertexCount + b, c);
    opposites.set(b * vertexCount + c, a);
    opposites.set(c * vertexCount + a, b);
  }

  // Consistent winding: an inner edge is walked both ways, a boundary edge once
  const isBoundary = (a, b) => !opposites.has(b * vertexCount + a);

  // Turn around b through its cells, from a, to the next boundary edge: loops
  // touching at a pinched vertex belong to different fans and stay apart
  const nextBoundary = (a, b) => {
    let c = opposites.get(a * vertexCount + b);
    while (!isBoundary(b, c)) c = opposites.get(c * vertexCount + b);
    return c;
  };

  const loops = [];
  const visited = new Set();
  for (const hash of opposites.keys()) {
    const a = Math.floor(hash / vertexCount);
    const b = hash % vertexCount;
    if (visited.has(hash) || !isBoundary(a, b)) continue;

    // A pinched vertex is passed more than once: stop on the first edge
    const loop = [a];
    let [from, to] = [a, b];
    do {
      visited.add(from * vertexCount + to);
      loop.push(to);
      [from, to] = [to, nextBoundary(from, to)];
    } while (from !== a || to !== b);
    loops.push(loop);
  }

  return loops;
};

// Index of the first vertex at each exact position: split seams duplicate
// positions, near-coincident vertices stay apart
const weldCells = (positions, cells) => {
  const firsts = new Map();
  const welded = new Uint32Array(positions.length / 3);
  for (let i = 0; i < welded.length; i++) {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
    if (!firsts.has(key)) firsts.set(key, i);
    welded[i] = firsts.get(key);
  }
  return Array.from(cells, (index) => welded[index]);
};

const fromTriangles = (positions, cells, direction, ignoreSeams) => ({
  normal:
    direction === "auto"
      ? normalizeOrZ(computeAreaVector(positions, cells))
      : DIRECTIONS[direction],
  cells,
  // Caps keep their split vertices: only the walls follow welded loops
  loops: computeBoundary(
    ignoreSeams ? weldCells(positions, cells) : cells,
    positions.length / 3,
  ),
});

const triangulateLoops = (positions, loops, normal) => {
  const points = projectPositions(positions, normal);

  // Nesting depth, not winding, tells holes apart: eg. annulusPath winds both
  // loops counter-clockwise
  const depths = loops.map((loop, i) =>
    loops.reduce(
      (depth, other, j) =>
        depth + Number(i !== j && containsPoint(points, other, loop[0])),
      0,
    ),
  );

  // Wind as computeBoundary would: solids counter-clockwise, holes clockwise
  loops.forEach((loop, i) => {
    if (computeSignedArea(points, loop) > 0 !== (depths[i] % 2 === 0)) {
      loop.reverse();
    }
  });

  const cells = [];
  loops.forEach((outer, i) => {
    if (depths[i] % 2) return;

    const holes = loops.filter(
      (loop, j) =>
        depths[j] === depths[i] + 1 && containsPoint(points, outer, loop[0]),
    );
    const rings = [outer, ...holes];
    const { vertices, holes: holeIndices } = flatten(
      rings.map((ring) =>
        ring.map((index) => points.subarray(index * 2, index * 2 + 2)),
      ),
    );
    const indices = rings.flat();
    // earcut outputs counter-clockwise triangles whatever the input winding
    for (const index of earcut(vertices, holeIndices)) {
      cells.push(indices[index]);
    }
  });

  return cells;
};

const fromPolylines = (positions, polylines, direction, closed) => {
  const polylineLoops = polylines
    .map((polyline) => {
      const loop = Array.from(polyline);
      if (closed === false) return { loop, isClosed: false };

      // Compare positions: SVG-like paths repeat the first point on a new vertex
      const isClosing =
        loop.length > 1 &&
        avec3.equals(positions, loop[0], positions, loop.at(-1));
      if (isClosing) loop.pop();
      return { loop, isClosed: closed === true || isClosing };
    })
    .filter(({ loop, isClosed }) => loop.length > (isClosed ? 2 : 1));

  // The largest loop encloses the others: holes can't flip it
  const normal =
    direction === "auto"
      ? normalizeOrZ(
          polylineLoops
            .map(({ loop }) => computeAreaVector(positions, fan(loop)))
            .reduce((a, b) => (vec3.length(b) > vec3.length(a) ? b : a)),
        )
      : DIRECTIONS[direction];

  const closedLoops = polylineLoops
    .filter(({ isClosed }) => isClosed)
    .map(({ loop }) => loop);

  return {
    normal,
    cells: triangulateLoops(positions, closedLoops, normal),
    loops: polylineLoops.map(({ loop, isClosed }) =>
      isClosed ? [...loop, loop[0]] : loop,
    ),
  };
};

/**
 * Analyze a planar shape: the side it faces, its cap triangles and its wall
 * loops, holes included.
 *
 * Only `direction`, `ignoreSeams` and `closed` options apply.
 *
 * @param {import("./types.js").SimplicialComplex
 *   | import("./types.js").PolylineComplex} shape
 * @param {import("./types.js").GeomExtrudeOptions} [options={}]
 * @returns {import("./types.js").Profile}
 */
const computeProfile = (
  { positions, cells },
  { direction = "z", ignoreSeams = true, closed = "auto" } = {},
) =>
  typeof cells[0] === "number"
    ? fromTriangles(positions, cells, direction, ignoreSeams)
    : fromPolylines(positions, cells, direction, closed);

/**
 * Compute cap uvs in the profile plane, scaled to its longest loop so they
 * match walls wrapping u once around each loop.
 *
 * Caps don't split vertices: angle based mappings (eg. polar) show a wrap seam.
 *
 * @param {Float32Array} positions
 * @param {import("./types.js").Profile} profile
 * @param {import("./types.js").CapMappingFn} [mapping=mappings.circumferential]
 * @returns {Float32Array}
 */
const computeCapUvs = (
  positions,
  { normal, loops },
  mapping = mappings.circumferential,
) => {
  const perimeter = Math.max(
    ...loops.map((loop) => computePerimeter(positions, loop)),
  );
  const points = projectPositions(positions, normal);
  const count = points.length / 2;
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (let i = 0; i < points.length; i++) {
    min[i % 2] = Math.min(min[i % 2], points[i]);
    max[i % 2] = Math.max(max[i % 2], points[i]);
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const radius = Math.max(max[0] - min[0], max[1] - min[1]) / 2 || 1;

  const distances = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    avec2.sub(points, i, center, 0);
    distances[i] = avec2.length(points, i);
  }
  const maxDistance = distances.reduce((a, b) => Math.max(a, b), 0) || 1;

  const uvs = new Float32Array(points.length);
  for (let i = 0; i < count; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    const t = (Math.atan2(y, x) + TAU) % TAU;
    const radiusRatio = distances[i] / maxDistance;
    // Uniformly scaled into the unit disc, as primitive-geometry's u/v
    // (radiusRatio · cos t): disc-to-square mappings are undefined outside it
    mapping({
      uvs,
      index: i * 2,
      x,
      y,
      u: x / maxDistance,
      v: y / maxDistance,
      radius,
      t,
      radiusRatio,
      thetaRatio: t / TAU,
      perimeter,
    });
  }

  return uvs;
};

const computeCap = (
  geometry,
  { positions, cells, attributes },
  uvs,
  cap,
  indices,
) => {
  const { normal, displacement, side, flip } = cap;
  const offset = indices.vertex;
  const count = positions.length / 3;

  for (let i = 0; i < count; i++) {
    avec3.set(geometry.positions, offset + i, positions, i);
    avec3.addScaled(geometry.positions, offset + i, normal, 0, displacement);
    avec3.set(geometry.normals, offset + i, normal, 0);
    avec3.scale(geometry.normals, offset + i, side);
  }
  geometry.uvs.set(uvs, offset * 2);
  copyAttributes(geometry, attributes, offset, count);

  for (let i = 0; i < cells.length; i += 3) {
    setTriangle(
      geometry.cells,
      indices.cell + i,
      cells[i] + offset,
      cells[i + 1] + offset,
      cells[i + 2] + offset,
      flip,
    );
  }

  indices.vertex += count;
  indices.cell += cells.length;
};

const computeLoopEdges = (positions, loop, normal) => {
  const edgeCount = loop.length - 1;
  const edgeNormals = new Float32Array(edgeCount * 3);
  const distances = new Float32Array(edgeCount + 1);

  for (let i = 0; i < edgeCount; i++) {
    avec3.set(edgeNormals, i, positions, loop[i + 1]);
    avec3.sub(edgeNormals, i, positions, loop[i]);
    distances[i + 1] = distances[i] + avec3.length(edgeNormals, i);

    // Loops wind counter-clockwise around the solid (clockwise around holes):
    // edge × facing normal points away from it
    avec3.cross(edgeNormals, i, normal, 0);
    avec3.normalize(edgeNormals, i);
  }

  return { edgeNormals, distances };
};

const isSmooth = (edgeNormals, i, neighbour, cosCreaseAngle) =>
  neighbour !== -1 &&
  avec3.dot(edgeNormals, i, edgeNormals, neighbour) > cosCreaseAngle;

const computeWallNormal = (
  out,
  j,
  edgeNormals,
  i,
  neighbour,
  cosCreaseAngle,
) => {
  avec3.set(out, j, edgeNormals, i);
  if (!isSmooth(edgeNormals, i, neighbour, cosCreaseAngle)) return;
  avec3.add(out, j, edgeNormals, neighbour);
  avec3.normalize(out, j);
};

/**
 * Compute the wall cross-section of profile loops: columns shared by adjacent
 * edges, split at creases and at the u seam of closed loops.
 *
 * @param {Float32Array} positions
 * @param {number[][]} loops Profile loops.
 * @param {number[]} normal Profile facing normal.
 * @param {number} [creaseAngle=Math.PI / 6] Turns sharper than this angle (in
 *   radians) split columns.
 * @returns {import("./types.js").Columns}
 */
const computeColumns = (
  positions,
  loops,
  normal,
  creaseAngle = Math.PI / 6,
) => {
  const cosCreaseAngle = Math.cos(creaseAngle);
  const edgeCount = loops.reduce((sum, loop) => sum + loop.length - 1, 0);

  // Upper bound: every edge split from its neighbours
  const maxCount = edgeCount * 2;
  const shapeIndices = new Uint32Array(maxCount);
  const normals = new Float32Array(maxCount * 3);
  const u = new Float32Array(maxCount);
  const cells = new Uint32Array(edgeCount * 2);

  let count = 0;
  let cellIndex = 0;

  for (const loop of loops) {
    const loopEdgeCount = loop.length - 1;
    const closed = loop[0] === loop[loopEdgeCount];
    const { edgeNormals, distances } = computeLoopEdges(
      positions,
      loop,
      normal,
    );
    const perimeter = distances[loopEdgeCount];

    const addColumn = (i, edge, neighbour) => {
      shapeIndices[count] = loop[i];
      u[count] = distances[i] / perimeter;
      computeWallNormal(
        normals,
        count,
        edgeNormals,
        edge,
        neighbour,
        cosCreaseAngle,
      );
      return count++;
    };

    // The first column is never shared: open end or u seam
    let column = -1;
    for (let i = 0; i < loopEdgeCount; i++) {
      const previous = i > 0 ? i - 1 : closed ? loopEdgeCount - 1 : -1;
      const next = i < loopEdgeCount - 1 ? i + 1 : closed ? 0 : -1;
      if (i === 0 || !isSmooth(edgeNormals, i, previous, cosCreaseAngle)) {
        column = addColumn(i, i, previous);
      }
      cells[cellIndex++] = column;
      cells[cellIndex++] = column = addColumn(i + 1, i, next);
    }
  }

  return {
    shapeIndices: shapeIndices.subarray(0, count),
    normals: normals.subarray(0, count * 3),
    u: u.subarray(0, count),
    cells,
  };
};

/**
 * Write the wall triangles between consecutive rings of columns. Ring vertices
 * are laid out ring after ring, column after column.
 *
 * @param {import("./types.js").TypedArrayLike} out Cells to write into.
 * @param {import("./types.js").Columns} columns
 * @param {object} options
 * @param {number} options.ringCount
 * @param {boolean} [options.closed=false] Also stitch the last ring to the
 *   first one.
 * @param {number} [options.vertexOffset=0] Index of the first ring vertex.
 * @param {number} [options.cellOffset=0] Index in `out` of the first triangle
 *   index.
 * @param {boolean} [options.flip=false] Reverse the triangles winding.
 * @returns {number} Index in `out` after the last written triangle index.
 */
const stitchRings = (
  out,
  { shapeIndices, cells },
  { ringCount, closed = false, vertexOffset = 0, cellOffset = 0, flip = false },
) => {
  const count = shapeIndices.length;
  const stitchCount = closed ? ringCount : ringCount - 1;
  let index = cellOffset;

  for (let ring = 0; ring < stitchCount; ring++) {
    const current = vertexOffset + ring * count;
    const next = vertexOffset + ((ring + 1) % ringCount) * count;

    // [a, a', b] faces outward when rings follow the start cap winding
    for (let i = 0; i < cells.length; i += 2) {
      const a = cells[i];
      const b = cells[i + 1];
      setTriangle(out, index, current + a, next + a, current + b, flip);
      setTriangle(out, index + 3, next + a, next + b, current + b, flip);
      index += 6;
    }
  }

  return index;
};

const computeWalls = (
  geometry,
  { positions, attributes },
  columns,
  wall,
  indices,
) => {
  const { normal, start, end, ringCount, flip } = wall;
  const count = columns.shapeIndices.length;
  const vertexOffset = indices.vertex;

  for (let ring = 0; ring < ringCount; ring++) {
    const v = ring / (ringCount - 1);
    const displacement = start + (end - start) * v;

    for (let i = 0; i < count; i++) {
      const vertex = vertexOffset + ring * count + i;
      avec3.set(geometry.positions, vertex, positions, columns.shapeIndices[i]);
      avec3.addScaled(geometry.positions, vertex, normal, 0, displacement);
      avec3.set(geometry.normals, vertex, columns.normals, i);
      avec2.set2(geometry.uvs, vertex, columns.u[i], v);
    }
    copyAttributes(
      geometry,
      attributes,
      vertexOffset + ring * count,
      count,
      columns.shapeIndices,
    );
  }

  indices.cell = stitchRings(geometry.cells, columns, {
    ringCount,
    vertexOffset,
    cellOffset: indices.cell,
    flip,
  });
  indices.vertex += count * ringCount;
};

/**
 * Extrude a planar shape into a solid: a start cap, an end cap and walls along
 * its boundary loops, holes included.
 *
 * A PolylineComplex shape is read as non-intersecting polylines: closed loops
 * nested an odd number of times are holes, open polylines only get walls.
 *
 * Walls wrap u once around each loop and v from start to end. Caps keep the
 * shape uvs unless a `capMapping` is set or the shape has none.
 *
 * Other flat per-vertex shape attributes (eg. `vertexColors`) are copied
 * unchanged to the caps and walls, keeping their array type: direction
 * dependent ones (eg. `tangents`) don't follow the walls and end cap
 * orientation.
 *
 * @param {import("./types.js").SimplicialShape | import("./types.js").PolylineShape} shape
 * @param {import("./types.js").GeomExtrudeOptions} [options={}]
 * @returns {import("./types.js").SimplicialShape}
 * @alias module:geomExtrude
 */
const geomExtrude = (
  shape,
  {
    thickness = 1,
    direction = "z",
    center = false,
    capStart = true,
    capEnd = true,
    capMapping,
    creaseAngle = Math.PI / 6,
    ignoreSeams = true,
    closed = "auto",
    wallSegments = 1,
  } = {},
) => {
  const { positions } = shape;
  const count = positions.length / 3;
  const profile = computeProfile(shape, {
    direction,
    ignoreSeams,
    closed,
  });
  const { normal, cells, loops } = profile;

  const columns = computeColumns(positions, loops, normal, creaseAngle);
  const wallEdgeCount = columns.cells.length / 2;
  const ringCount = wallSegments + 1;
  // Open polylines only: no cap triangles to place
  const capCount = cells.length ? Number(capStart) + Number(capEnd) : 0;

  // Walls don't share vertices with the caps: they need their own normals and
  // uvs
  const vertexCount =
    count * capCount + columns.shapeIndices.length * ringCount;

  const attributes = getVertexAttributes(shape, count);

  const geometry = {
    positions: new Float32Array(vertexCount * 3),
    normals: new Float32Array(vertexCount * 3),
    uvs: new Float32Array(vertexCount * 2),
    cells: new (getCellsTypedArray(vertexCount))(
      cells.length * capCount + wallEdgeCount * wallSegments * 6,
    ),
  };
  for (const { name, source, size } of attributes) {
    geometry[name] = new source.constructor(vertexCount * size);
  }
  const indices = { vertex: 0, cell: 0 };

  const start = center ? thickness / 2 : 0;
  const end = start - thickness;
  // Negative thickness puts the end cap on the facing side: every winding reverses
  const flip = thickness < 0;
  const side = flip ? -1 : 1;

  if (capCount) {
    const uvs =
      (!capMapping && shape.uvs) ||
      computeCapUvs(positions, profile, capMapping);
    const triangles = { positions, cells, attributes };
    const cap = { normal, displacement: start, side, flip };
    if (capStart) computeCap(geometry, triangles, uvs, cap, indices);
    if (capEnd) {
      Object.assign(cap, { displacement: end, side: -side, flip: !flip });
      computeCap(geometry, triangles, uvs, cap, indices);
    }
  }

  computeWalls(
    geometry,
    { positions, attributes },
    columns,
    { normal, start, end, ringCount, flip },
    indices,
  );

  return geometry;
};

export {
  computeBoundary,
  computeCapUvs,
  computeColumns,
  computeProfile,
  copyAttributes,
  getVertexAttributes,
  stitchRings,
};

export default geomExtrude;

export * from "./types.js";
