import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  annulus,
  annulusPath,
  cross,
  crossPath,
  disc,
  mappings,
  plane,
  quad,
  squarePath,
  star,
  starPath,
} from "primitive-geometry";

import geomExtrude, { computeBoundary, computeProfile } from "../index.js";
import { GLYPHS, glyph } from "../examples/glyph.js";
import { analyze, area, assertArrayClose, bounds, close } from "./helpers.js";

const DIRECTIONS = ["x", "-x", "y", "-y", "z", "-z"];
const AXES = { x: 0, y: 1, z: 2 };

const loopsOf = (shape) =>
  computeBoundary(shape.cells, shape.positions.length / 3);

const withoutUvs = ({ uvs, ...shape }) => shape;

describe("computeBoundary", () => {
  it("returns closed loops following the cells winding", () => {
    const shape = quad();
    const loops = loopsOf(shape);
    assert.equal(loops.length, 1);
    assert.equal(loops[0].length, 5);
    assert.equal(loops[0][0], loops[0][4]);

    const [a, b] = loops[0];
    const triangles = Array.from({ length: shape.cells.length / 3 }, (_, i) =>
      Array.from(shape.cells.slice(i * 3, i * 3 + 3)),
    );
    assert.ok(
      triangles.some((t) =>
        t.some((index, j) => index === a && t[(j + 1) % 3] === b),
      ),
    );
  });

  it("returns a loop per hole", () => {
    assert.equal(loopsOf(disc()).length, 1);
    assert.equal(loopsOf(annulus()).length, 2);
    assert.equal(loopsOf(star({ innerRadius: 0.1 })).length, 2);
    assert.equal(loopsOf(glyph(GLYPHS.R)).length, 2);
    assert.equal(loopsOf(glyph(GLYPHS.B)).length, 3);
  });

  it("walks pinched vertices fan by fan", () => {
    const edgeCounts = (rows) =>
      loopsOf(glyph(rows))
        .map((loop) => loop.length - 1)
        .sort((a, b) => a - b);
    assert.deepEqual(edgeCounts(GLYPHS.X), Array(9).fill(4));
    assert.deepEqual(edgeCounts(GLYPHS["%"]), [4, 4, 4, 4, 4, 4, 8, 8]);
    // Each fan joins an outer edge to a hole edge: a single loop through both
    assert.deepEqual(edgeCounts(GLYPHS[4]), [26]);
  });
});

describe("computeProfile", () => {
  const signedArea = ({ positions }, loop) => {
    let sum = 0;
    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i] * 3;
      const b = loop[i + 1] * 3;
      sum += positions[a] * positions[b + 1] - positions[b] * positions[a + 1];
    }
    return sum / 2;
  };

  it("winds solids counter-clockwise and holes clockwise", () => {
    for (const [name, shape] of Object.entries({
      annulus: annulus(),
      annulusPath: annulusPath({ closed: true }),
    })) {
      const { normal, cells, loops } = computeProfile(shape);
      assert.deepEqual(Array.from(normal), [0, 0, 1], name);
      assert.ok(cells.length > 0 && cells.length % 3 === 0, name);
      assert.equal(loops.length, 2, name);

      const [solid, hole] = loops
        .map((loop) => signedArea(shape, loop))
        .sort((a, b) => Math.abs(b) - Math.abs(a));
      assert.ok(solid > 0, name);
      assert.ok(hole < 0, name);
    }
  });

  it("closes loops with their first index", () => {
    for (const loop of computeProfile(annulusPath({ closed: true })).loops) {
      assert.equal(loop[0], loop.at(-1));
    }
  });

  it("closes polylines ending on their first index or position", () => {
    const path = squarePath();
    const positions = Float32Array.from([
      ...path.positions,
      ...path.positions.subarray(0, 3),
    ]);
    for (const [name, shape] of Object.entries({
      index: squarePath({ closed: true }),
      position: { positions, cells: [[0, 1, 2, 3, 4]] },
    })) {
      const { cells, loops } = computeProfile(shape);
      assert.deepEqual(loops, [[0, 1, 2, 3, 0]], name);
      assert.equal(cells.length, 6, name);
    }
  });

  it("keeps open polylines uncapped", () => {
    const { cells, loops } = computeProfile(squarePath());
    assert.deepEqual(loops, [[0, 1, 2, 3]]);
    assert.equal(cells.length, 0);
  });

  it("forces polylines open or closed", () => {
    const open = computeProfile(squarePath({ closed: true }), {
      closed: false,
    });
    assert.deepEqual(open.loops, [[0, 1, 2, 3, 0]]);
    assert.equal(open.cells.length, 0);

    const closed = computeProfile(squarePath(), { closed: true });
    assert.deepEqual(closed.loops, [[0, 1, 2, 3, 0]]);
    assert.equal(closed.cells.length, 6);
  });
});

describe("geomExtrude", () => {
  it("is closed, outward facing and consistently shaded", () => {
    const thickness = 0.3;
    for (const [name, shape] of Object.entries({
      quad: quad(),
      disc: disc(),
      star: star({ innerRadius: 0.1 }),
      annulus: annulus(),
      cross: cross(),
      ...Object.fromEntries(
        Object.entries(GLYPHS).map(([name, rows]) => [name, glyph(rows)]),
      ),
    })) {
      const { volume, openEdges, flippedNormals } = analyze(
        geomExtrude(shape, { thickness }),
      );
      assert.equal(openEdges, 0, name);
      assert.equal(flippedNormals, 0, name);
      assert.ok(close(volume, area(shape) * thickness, 1e-4), name);
    }
  });

  it("extrudes away from each facing direction", () => {
    for (const direction of DIRECTIONS) {
      const shape = plane({ direction });
      const geometry = geomExtrude(shape, { thickness: 0.5, direction });
      const { volume, openEdges, flippedNormals } = analyze(geometry);
      assert.equal(openEdges, 0, direction);
      assert.equal(flippedNormals, 0, direction);
      assert.ok(close(volume, 0.5), direction);

      const axis = AXES[direction.at(-1)];
      const { min, max } = bounds(geometry);
      const range = direction[0] === "-" ? [0, 0.5] : [-0.5, 0];
      assert.deepEqual([min[axis], max[axis]], range, direction);

      const auto = geomExtrude(shape, { thickness: 0.5, direction: "auto" });
      assertArrayClose(assert, auto.positions, geometry.positions);
      assertArrayClose(assert, auto.normals, geometry.normals);
    }
  });

  it("starts on the shape plane and ends at the thickness", () => {
    const shape = quad();
    const count = shape.positions.length / 3;
    for (const thickness of [0.5, -0.5]) {
      const geometry = geomExtrude(shape, { thickness });
      for (let i = 0; i < count * 2; i++) {
        const z = i < count ? 0 : -thickness;
        assert.equal(geometry.positions[i * 3 + 2], z, String(thickness));
      }
      // Walls: v 0 on the start cap side
      for (let i = count * 2; i < geometry.positions.length / 3; i++) {
        const z = geometry.uvs[i * 2 + 1] ? -thickness : 0;
        assert.equal(geometry.positions[i * 3 + 2], z, String(thickness));
      }
    }
  });

  it("centers the solid on the shape plane", () => {
    for (const thickness of [0.5, -0.5]) {
      const { min, max } = bounds(
        geomExtrude(quad(), { thickness, center: true }),
      );
      assert.deepEqual([min[2], max[2]], [-0.25, 0.25], String(thickness));
    }
  });

  it("extrudes towards the facing side with a negative thickness", () => {
    const geometry = geomExtrude(star(), { thickness: -0.5 });
    const { volume, openEdges, flippedNormals } = analyze(geometry);
    const { min, max } = bounds(geometry);
    assert.equal(openEdges, 0);
    assert.equal(flippedNormals, 0);
    assert.ok(volume > 0);
    assert.deepEqual([min[2], max[2]], [0, 0.5]);
  });

  it("omits caps", () => {
    const shape = star({ innerRadius: 0.1 });
    const vertexCount = shape.positions.length / 3;
    const boundaryEdges = loopsOf(shape).reduce(
      (sum, loop) => sum + loop.length - 1,
      0,
    );

    for (const [options, capCount] of [
      [{ capStart: false }, 1],
      [{ capEnd: false }, 1],
      [{ capStart: false, capEnd: false }, 0],
    ]) {
      const geometry = geomExtrude(shape, options);
      const { openEdges, flippedNormals } = analyze(geometry);
      assert.equal(openEdges, boundaryEdges * (2 - capCount));
      assert.equal(flippedNormals, 0);
      assert.equal(
        geometry.positions.length / 3,
        vertexCount * capCount + boundaryEdges * 4,
      );
      assert.equal(
        geometry.cells.length,
        shape.cells.length * capCount + boundaryEdges * 6,
      );
    }
  });

  it("copies the shape uvs on both caps", () => {
    const shape = disc();
    const { uvs } = geomExtrude(shape);
    assert.deepEqual(uvs.subarray(0, shape.uvs.length), shape.uvs);
    assert.deepEqual(
      uvs.subarray(shape.uvs.length, shape.uvs.length * 2),
      shape.uvs,
    );
  });

  it("maps cap uvs circumferentially when the shape has none", () => {
    // Quad: perimeter 4, corners at ±0.5 from the center
    const { uvs } = geomExtrude(withoutUvs(quad()));
    for (const uv of uvs.subarray(0, 8)) {
      assert.ok(close(Math.abs(uv - 0.5), 0.125), uv);
    }
  });

  it("supports primitive-geometry mappings", () => {
    // Corners and edges at the bounds: singular for disc-to-square mappings
    // if not fitted in the unit disc
    const shapes = { star, quad, plane, squarePath, crossPath };
    for (const [name, capMapping] of Object.entries(mappings)) {
      // spherical needs normals
      if (name === "spherical") continue;
      for (const [shapeName, shape] of Object.entries(shapes)) {
        const { uvs } = geomExtrude(shape(), { capMapping });
        assert.ok(uvs.every(Number.isFinite), `${name} ${shapeName}`);
      }
    }
  });

  it("overrides the shape uvs with a cap mapping", () => {
    const shape = disc();
    const { uvs } = geomExtrude(shape, {
      capMapping: ({ uvs, index }) => uvs.set([0.25, 0.75], index),
    });
    const capUvs = uvs.subarray(0, shape.uvs.length * 2);
    assert.ok(capUvs.every((uv, i) => uv === (i % 2 ? 0.75 : 0.25)));
  });

  it("maps cap uvs along the plane axes", () => {
    const capMapping = mappings.rectangular;
    for (const direction of DIRECTIONS) {
      const shape = plane({ direction });
      for (const options of [{ direction }, { direction: "auto" }]) {
        const { uvs } = geomExtrude(shape, { ...options, capMapping });
        assertArrayClose(assert, uvs.subarray(0, shape.uvs.length), shape.uvs);
      }
    }
  });

  it("wraps wall u once around each loop", () => {
    const shape = annulus();
    const capUvCount = shape.uvs.length * 2;
    const walls = geomExtrude(shape).uvs.subarray(capUvCount);
    const u = walls.filter((_, i) => i % 2 === 0);
    const v = walls.filter((_, i) => i % 2 === 1);
    assert.equal(Math.min(...u), 0);
    assert.ok(close(Math.max(...u), 1));
    assert.deepEqual([Math.min(...v), Math.max(...v)], [0, 1]);
  });

  it("splits wall normals at creases", () => {
    const radialError = (geometry, shape) => {
      let error = 0;
      const start = (shape.positions.length / 3) * 2;
      for (let i = start; i < geometry.positions.length / 3; i++) {
        const [x, y] = geometry.positions.subarray(i * 3, i * 3 + 2);
        const length = Math.hypot(x, y);
        const [nx, ny] = geometry.normals.subarray(i * 3, i * 3 + 2);
        error = Math.max(error, Math.hypot(nx - x / length, ny - y / length));
      }
      return error;
    };

    const shape = disc();
    assert.ok(radialError(geomExtrude(shape), shape) < 1e-5);
    assert.ok(
      radialError(geomExtrude(shape, { creaseAngle: 0 }), shape) > 0.01,
    );

    const { normals } = geomExtrude(quad());
    for (let i = 8 * 3; i < normals.length; i += 3) {
      assert.equal(
        normals.subarray(i, i + 3).filter((n) => Math.abs(n) === 1).length,
        1,
      );
    }
  });

  it("ignores split seams", () => {
    const shape = disc({ mergeSeam: false });
    const merged = geomExtrude(disc());

    const geometry = geomExtrude(shape);
    const { volume, openEdges, flippedNormals } = analyze(geometry);
    assert.equal(openEdges, 0);
    assert.equal(flippedNormals, 0);
    assert.ok(close(volume, analyze(merged).volume));
    assert.equal(
      geometry.cells.length - shape.cells.length * 2,
      merged.cells.length - disc().cells.length * 2,
    );

    const seams = geomExtrude(shape, { ignoreSeams: false });
    assert.ok(seams.cells.length > geometry.cells.length);
  });

  it("picks the smallest cells typed array", () => {
    assert.ok(geomExtrude(quad()).cells instanceof Uint8Array);
    assert.ok(geomExtrude(disc()).cells instanceof Uint16Array);
  });

  describe("PolylineComplex", () => {
    // Shoelace in XY: outer area minus holes, whatever the input winding
    const polylinesArea = ({ positions, cells }) => {
      const areas = cells.map((cell) => {
        let sum = 0;
        for (let i = 0; i < cell.length; i++) {
          const a = cell[i] * 3;
          const b = cell[(i + 1) % cell.length] * 3;
          sum +=
            positions[a] * positions[b + 1] - positions[b] * positions[a + 1];
        }
        return Math.abs(sum / 2);
      });
      return areas[0] - areas.slice(1).reduce((a, b) => a + b, 0);
    };

    const reversed = (path) => ({
      ...path,
      cells: path.cells.map((cell) => [...cell].reverse()),
    });

    it("is closed, outward facing and consistently shaded", () => {
      const thickness = 0.3;
      for (const [name, path] of Object.entries({
        starPath: starPath({ closed: true }),
        crossPath: crossPath({ closed: true }),
        squarePath: squarePath({ closed: true }),
        annulusPath: annulusPath({ closed: true }),
        "annulusPath (reversed)": reversed(annulusPath({ closed: true })),
        "starPath (reversed)": reversed(starPath({ closed: true })),
      })) {
        const geometry = geomExtrude(path, { thickness });
        const { volume, openEdges, flippedNormals } = analyze(geometry);
        assert.equal(openEdges, 0, name);
        assert.equal(flippedNormals, 0, name);
        assert.ok(close(volume, polylinesArea(path) * thickness, 1e-4), name);

        const { min, max } = bounds(geometry);
        assertArrayClose(assert, [min[2], max[2]], [-thickness, 0]);
      }
    });

    it("extrudes open polylines into uncapped walls", () => {
      const path = starPath();
      const geometry = geomExtrude(path);
      const edgeCount = path.cells[0].length - 1;
      assert.equal(geometry.positions.length / 3, edgeCount * 4);
      assert.equal(geometry.cells.length, edgeCount * 6);
      assert.ok(analyze(geometry).openEdges > 0);

      const closed = analyze(geomExtrude(path, { closed: true }));
      assert.equal(closed.openEdges, 0);
      assert.equal(closed.flippedNormals, 0);
    });

    it("matches the filled shape volume", () => {
      const fromPath = analyze(
        geomExtrude(annulusPath({ closed: true })),
      ).volume;
      const fromFill = analyze(geomExtrude(annulus())).volume;
      assert.ok(close(fromPath, fromFill, 1e-4));
    });

    it("faces its largest loop with auto direction", () => {
      const path = annulusPath({ closed: true });
      const auto = geomExtrude(path, { direction: "auto" });
      assertArrayClose(assert, auto.positions, geomExtrude(path).positions);

      const flipped = geomExtrude(reversed(path), { direction: "auto" });
      const { min, max } = bounds(flipped);
      assert.deepEqual([min[2], max[2]], [0, 1]);
      assert.equal(analyze(flipped).flippedNormals, 0);
    });

    it("maps cap uvs circumferentially", () => {
      const path = crossPath({ closed: true });
      const { uvs } = geomExtrude(path);
      const capUvs = uvs.subarray(0, (path.positions.length / 3) * 2);
      assert.ok(close(Math.min(...capUvs) + Math.max(...capUvs), 1));
      assert.ok(Math.max(...capUvs) < 1);
    });
  });
});
