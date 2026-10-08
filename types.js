/** @typedef {number[] | Uint8Array | Uint16Array | Uint32Array} TypedArrayLike */

/** @typedef {"x" | "-x" | "y" | "-y" | "z" | "-z"} PlaneDirection */

/**
 * @typedef {object} SimplicialComplex Triangle cells over shared positions.
 * @property {Float32Array} positions
 * @property {Float32Array} [normals]
 * @property {Float32Array} [uvs]
 * @property {Uint8Array | Uint16Array | Uint32Array} cells
 */

/**
 * @typedef {object} PolylineComplex Polyline cells over shared positions: each
 *   cell is an open polyline; closed loops repeat their first index at the end.
 * @property {Float32Array} positions
 * @property {TypedArrayLike[]} cells
 */

/**
 * @callback CapMappingFn Write the uv of the vertex at `index`. Subset of primitive-geometry's `MappingFn`, without `spherical`.
 * @param {object} mappingOptions
 * @param {Float32Array} mappingOptions.uvs
 * @param {number} mappingOptions.index
 * @param {number} mappingOptions.x In the shape plane, from its bounds center.
 * @param {number} mappingOptions.y
 * @param {number} mappingOptions.u `x` scaled so the shape fits the unit disc.
 * @param {number} mappingOptions.v `y` scaled so the shape fits the unit disc.
 * @param {number} mappingOptions.radius Half the bounds largest side.
 * @param {number} mappingOptions.t Angle around the bounds center, within [0, 2π).
 * @param {number} mappingOptions.radiusRatio Distance from the bounds center over the largest one.
 * @param {number} mappingOptions.thetaRatio `t` within [0, 1).
 * @param {number} mappingOptions.perimeter Longest boundary loop length.
 */

/**
 * @typedef {object} GeomExtrudeOptions
 * @property {number} [thickness=1] Distance from the start cap to the end cap, away from the facing side. Negative values extrude towards it.
 * @property {PlaneDirection | "auto"} [direction="z"] Side the shape faces, matching its cells winding. `"auto"` derives it from the cells.
 * @property {boolean} [center=false] Straddle the shape plane instead of starting from it.
 * @property {boolean} [capStart=true] Cap on the shape side.
 * @property {boolean} [capEnd=true] Cap on the extruded side.
 * @property {CapMappingFn} [capMapping=mappings.circumferential] Overrides the shape uvs. Defaults to primitive-geometry's `mappings.circumferential` when the shape has none: undistorted, at the walls u scale.
 * @property {number} [creaseAngle=Math.PI / 6] Turns of the boundary sharper than this angle (in radians) keep hard wall edges.
 * @property {boolean} [ignoreSeams=true] Treat vertices at the exact same position as connected when finding the boundary, so split seams (eg. `mergeSeam: false`) don't get walls. Caps keep their split vertices.
 */

export {};
