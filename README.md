# geom-extrude

[![npm version](https://img.shields.io/npm/v/geom-extrude)](https://www.npmjs.com/package/geom-extrude)
[![stability-stable](https://img.shields.io/badge/stability-stable-green.svg)](https://www.npmjs.com/package/geom-extrude)
[![npm minzipped size](https://img.shields.io/bundlephobia/minzip/geom-extrude)](https://bundlephobia.com/package/geom-extrude)
[![dependencies](https://img.shields.io/librariesio/release/npm/geom-extrude)](https://github.com/dmnsgn/geom-extrude/blob/main/package.json)
[![types](https://img.shields.io/npm/types/geom-extrude)](https://github.com/microsoft/TypeScript)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fa6673.svg)](https://conventionalcommits.org)
[![styled with prettier](https://img.shields.io/badge/styled_with-Prettier-f8bc45.svg?logo=prettier)](https://github.com/prettier/prettier)
[![linted with eslint](https://img.shields.io/badge/linted_with-ES_Lint-4B32C3.svg?logo=eslint)](https://github.com/eslint/eslint)
[![license](https://img.shields.io/github/license/dmnsgn/geom-extrude)](https://github.com/dmnsgn/geom-extrude/blob/main/LICENSE.md)

Extrude a planar simplicial complex or closed polylines into a solid with caps, walls, normals and uvs.

[![paypal](https://img.shields.io/badge/donate-paypal-informational?logo=paypal)](https://paypal.me/dmnsgn)
[![coinbase](https://img.shields.io/badge/donate-coinbase-informational?logo=coinbase)](https://commerce.coinbase.com/checkout/56cbdf28-e323-48d8-9c98-7019e72c97f3)
[![twitter](https://img.shields.io/twitter/follow/dmnsgn?style=social)](https://twitter.com/dmnsgn)
[![bluesky](https://img.shields.io/badge/-blue?logo=bluesky&label=Follow%20%40dmnsgn.me&style=social)](https://bsky.app/profile/dmnsgn.me)

[![geom-extrude screenshot](https://raw.githubusercontent.com/dmnsgn/geom-extrude/main/screenshot.png)](https://dmnsgn.github.io/geom-extrude/)

## Installation

```bash
npm install geom-extrude
```

## Usage

```js
import geomExtrude from "geom-extrude";
import { star, starPath } from "primitive-geometry";

const geometry = geomExtrude(star(), {
  thickness: 1,
  direction: "z",
  center: false,
  capStart: true,
  capEnd: true,
  capMapping: undefined, // Shape uvs, or mappings.circumferential if none
  creaseAngle: Math.PI / 6,
  ignoreSeams: true,
});
// => { positions, normals, uvs, cells }

// Closed polylines: caps are triangulated, nested loops are holes
const fromPath = geomExtrude(starPath(), { thickness: 0.2 });
```

## API

<!-- api-start -->

## Modules

<dl>
<dt><a href="#module_geomExtrude">geomExtrude</a></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#TypedArrayLike">TypedArrayLike</a> : <code>Array.&lt;number&gt;</code> | <code>Uint8Array</code> | <code>Uint16Array</code> | <code>Uint32Array</code></dt>
<dd></dd>
<dt><a href="#PlaneDirection">PlaneDirection</a> : <code>&quot;x&quot;</code> | <code>&quot;-x&quot;</code> | <code>&quot;y&quot;</code> | <code>&quot;-y&quot;</code> | <code>&quot;z&quot;</code> | <code>&quot;-z&quot;</code></dt>
<dd></dd>
<dt><a href="#SimplicialComplex">SimplicialComplex</a> : <code>object</code></dt>
<dd><p>Triangle cells over shared positions.</p>
</dd>
<dt><a href="#PolylineComplex">PolylineComplex</a> : <code>object</code></dt>
<dd><p>Polyline cells over shared positions: each
  cell is an open polyline; closed loops repeat their first index at the
  end.</p>
</dd>
<dt><a href="#CapMappingFn">CapMappingFn</a> : <code>function</code></dt>
<dd></dd>
<dt><a href="#GeomExtrudeOptions">GeomExtrudeOptions</a> : <code>object</code></dt>
<dd></dd>
</dl>

<a name="module_geomExtrude"></a>

## geomExtrude

- [geomExtrude](#module_geomExtrude)
  - [geomExtrude(shape, [options])](#exp_module_geomExtrude--geomExtrude) ⇒ [<code>SimplicialComplex</code>](#SimplicialComplex) ⏏
    - [.computeBoundary(cells, vertexCount)](#module_geomExtrude--geomExtrude.computeBoundary) ⇒ <code>Array.&lt;Array.&lt;number&gt;&gt;</code>

<a name="exp_module_geomExtrude--geomExtrude"></a>

### geomExtrude(shape, [options]) ⇒ [<code>SimplicialComplex</code>](#SimplicialComplex) ⏏

Extrude a planar shape into a solid: a start cap, an end cap and walls along
its boundary loops, holes included.

A PolylineComplex shape is read as closed, non-intersecting loops: loops
nested an odd number of times are holes.

Walls wrap u once around each loop and v from start to end. Caps keep the
shape uvs unless a `capMapping` is set or the shape has none.

**Kind**: Exported function

| Param     | Type                                                                                                     | Default         |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| shape     | [<code>SimplicialComplex</code>](#SimplicialComplex) \| [<code>PolylineComplex</code>](#PolylineComplex) |                 |
| [options] | [<code>GeomExtrudeOptions</code>](#GeomExtrudeOptions)                                                   | <code>{}</code> |

<a name="module_geomExtrude--geomExtrude.computeBoundary"></a>

#### geomExtrude.computeBoundary(cells, vertexCount) ⇒ <code>Array.&lt;Array.&lt;number&gt;&gt;</code>

Compute the boundary loops of a triangle mesh, holes included: edges used by
a single cell, chained following the cells winding.

**Kind**: static method of [<code>geomExtrude</code>](#exp_module_geomExtrude--geomExtrude)
**Returns**: <code>Array.&lt;Array.&lt;number&gt;&gt;</code> - PolylineComplex cells: closed loops repeat their first
index.

| Param       | Type                                           | Description                                        |
| ----------- | ---------------------------------------------- | -------------------------------------------------- |
| cells       | [<code>TypedArrayLike</code>](#TypedArrayLike) | Consistently wound triangles over welded vertices. |
| vertexCount | <code>number</code>                            |                                                    |

<a name="TypedArrayLike"></a>

## TypedArrayLike : <code>Array.&lt;number&gt;</code> \| <code>Uint8Array</code> \| <code>Uint16Array</code> \| <code>Uint32Array</code>

**Kind**: global typedef
<a name="PlaneDirection"></a>

## PlaneDirection : <code>&quot;x&quot;</code> \| <code>&quot;-x&quot;</code> \| <code>&quot;y&quot;</code> \| <code>&quot;-y&quot;</code> \| <code>&quot;z&quot;</code> \| <code>&quot;-z&quot;</code>

**Kind**: global typedef
<a name="SimplicialComplex"></a>

## SimplicialComplex : <code>object</code>

Triangle cells over shared positions.

**Kind**: global typedef
**Properties**

| Name      | Type                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| positions | <code>Float32Array</code>                                                       |
| [normals] | <code>Float32Array</code>                                                       |
| [uvs]     | <code>Float32Array</code>                                                       |
| cells     | <code>Uint8Array</code> \| <code>Uint16Array</code> \| <code>Uint32Array</code> |

<a name="PolylineComplex"></a>

## PolylineComplex : <code>object</code>

Polyline cells over shared positions: each
cell is an open polyline; closed loops repeat their first index at the
end.

**Kind**: global typedef
**Properties**

| Name      | Type                                                         |
| --------- | ------------------------------------------------------------ |
| positions | <code>Float32Array</code>                                    |
| cells     | [<code>Array.&lt;TypedArrayLike&gt;</code>](#TypedArrayLike) |

<a name="CapMappingFn"></a>

## CapMappingFn : <code>function</code>

**Kind**: global typedef

| Param                      | Type                      | Description                                           |
| -------------------------- | ------------------------- | ----------------------------------------------------- |
| mappingOptions             | <code>object</code>       |                                                       |
| mappingOptions.uvs         | <code>Float32Array</code> |                                                       |
| mappingOptions.index       | <code>number</code>       |                                                       |
| mappingOptions.x           | <code>number</code>       | In the shape plane, from its bounds center.           |
| mappingOptions.y           | <code>number</code>       |                                                       |
| mappingOptions.u           | <code>number</code>       | `x` scaled so the shape fits the unit disc.           |
| mappingOptions.v           | <code>number</code>       | `y` scaled so the shape fits the unit disc.           |
| mappingOptions.radius      | <code>number</code>       | Half the bounds largest side.                         |
| mappingOptions.t           | <code>number</code>       | Angle around the bounds center, within [0, 2π).       |
| mappingOptions.radiusRatio | <code>number</code>       | Distance from the bounds center over the largest one. |
| mappingOptions.thetaRatio  | <code>number</code>       | `t` within [0, 1).                                    |
| mappingOptions.perimeter   | <code>number</code>       | Longest boundary loop length.                         |

<a name="GeomExtrudeOptions"></a>

## GeomExtrudeOptions : <code>object</code>

**Kind**: global typedef
**Properties**

| Name          | Type                                                                            | Default                               | Description                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [thickness]   | <code>number</code>                                                             | <code>1</code>                        | Distance from the start cap to the end cap, away from the facing side. Negative values extrude towards it.                                                                 |
| [direction]   | [<code>PlaneDirection</code>](#PlaneDirection) \| <code>&quot;auto&quot;</code> | <code>&quot;z&quot;</code>            | Side the shape faces, matching its cells winding. `"auto"` derives it from the cells.                                                                                      |
| [center]      | <code>boolean</code>                                                            | <code>false</code>                    | Straddle the shape plane instead of starting from it.                                                                                                                      |
| [capStart]    | <code>boolean</code>                                                            | <code>true</code>                     | Cap on the shape side.                                                                                                                                                     |
| [capEnd]      | <code>boolean</code>                                                            | <code>true</code>                     | Cap on the extruded side.                                                                                                                                                  |
| [capMapping]  | [<code>CapMappingFn</code>](#CapMappingFn)                                      | <code>mappings.circumferential</code> | Overrides the shape uvs. Defaults to primitive-geometry's `mappings.circumferential` when the shape has none: undistorted, at the walls u scale.                           |
| [creaseAngle] | <code>number</code>                                                             | <code>Math.PI / 6</code>              | Turns of the boundary sharper than this angle (in radians) keep hard wall edges.                                                                                           |
| [ignoreSeams] | <code>boolean</code>                                                            | <code>true</code>                     | Treat vertices at the exact same position as connected when finding the boundary, so split seams (eg. `mergeSeam: false`) don't get walls. Caps keep their split vertices. |

<!-- api-end -->

## License

MIT. See [license file](https://github.com/dmnsgn/geom-extrude/blob/main/LICENSE.md).
