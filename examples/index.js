import geomExtrude from "geom-extrude";

import * as gpu from "pex-gpu";
import { perspective as createCamera, orbiter as createOrbiter } from "pex-cam";
import { avec3, mat4, vec3 } from "pex-math";
import {
  annulus,
  annulusPath,
  cross,
  crossPath,
  disc,
  mappings,
  squarePath,
  star,
  starPath,
} from "primitive-geometry";
import merge from "geom-merge";
import { Pane } from "tweakpane";

import { GLYPHS, glyph } from "./glyph.js";

const ctx = await gpu.createContext();

const image = new Image();
image.src = new URL("uv.jpg", import.meta.url).href;
await image.decode();

const texture = gpu.createTexture(ctx, {
  data: image,
  mipmap: true,
  flipY: true,
});
const sampler = gpu.createSampler(ctx, {
  filter: "linear",
  addressMode: "repeat",
});

// All face +Z. Paths (PolylineComplex) have no uvs: closed ones get
// triangulated caps, open ones only walls.
const SHAPES = {
  star: () => star(),
  "star (hole)": () => star({ innerRadius: 0.1 }),
  disc: () => disc(),
  "disc (split seam)": () => disc({ mergeSeam: false }),
  annulus: () => annulus(),
  nestedAnnulus: () =>
    merge([annulus(), annulus({ radius: 0.1, innerRadius: 0.05 })]),
  cross: () => cross(),
  ...Object.fromEntries(
    Object.entries(GLYPHS).map(([name, rows]) => [
      `glyph ${name}`,
      () => glyph(rows),
    ]),
  ),
  starPath: () => starPath(),
  "starPath (closed)": () => starPath({ closed: true }),
  annulusPath: () => annulusPath(),
  "annulusPath (closed)": () => annulusPath({ closed: true }),
  crossPath: () => crossPath(),
  "crossPath (closed)": () => crossPath({ closed: true }),
  // Last vertex duplicates the first one's position, as in SVG paths
  "squarePath (closed by position)": () => {
    const { positions } = squarePath();
    return {
      positions: Float32Array.from([...positions, ...positions.subarray(0, 3)]),
      cells: [[0, 1, 2, 3, 4]],
    };
  },
};

// Shape facing directions: each PlaneDirection, plus a diagonal one only
// "auto" can match
const ORIENTATIONS = {
  x: [1, 0, 0],
  "-x": [-1, 0, 0],
  y: [0, 1, 0],
  "-y": [0, -1, 0],
  z: [0, 0, 1],
  "-z": [0, 0, -1],
  xyz: [1, 1, 1],
};

// "shape" keeps the shape uvs, falling back to circumferential. Spherical needs
// normals: meaningless on a flat cap
const CAP_MAPPINGS = {
  shape: undefined,
  ...Object.fromEntries(
    Object.entries(mappings).filter(([name]) => name !== "spherical"),
  ),
};

const DIRECTIONS = ["auto", "x", "-x", "y", "-y", "z", "-z"];

const CLOSED = { auto: "auto", true: true, false: false };

const VIEWS = { texture: 0, normals: 1, uvs: 2 };

const toListOptions = (keys) =>
  Object.fromEntries(keys.map((key) => [key, key]));

const settings = {
  shape: "star (hole)",
  shapeUvs: true,
  capMapping: "shape",
  orientation: "z",
  view: VIEWS.texture,
};

const options = {
  thickness: 0.2,
  direction: "z",
  center: false,
  capStart: true,
  capEnd: true,
  creaseAngle: Math.PI / 6,
  ignoreSeams: true,
  closed: "auto",
};

const createShape = () => {
  const { uvs, ...shape } = SHAPES[settings.shape]();
  if (settings.shapeUvs && uvs) shape.uvs = uvs;

  // Shortest rotation from +Z, around Y when facing exactly away from it
  const facing = vec3.normalize([...ORIENTATIONS[settings.orientation]]);
  const axis = vec3.cross([0, 0, 1], facing);
  const rotation = mat4.create();
  mat4.rotate(
    rotation,
    Math.acos(facing[2]),
    vec3.length(axis) ? axis : [0, 1, 0],
  );
  shape.positions = Float32Array.from(shape.positions);
  for (let i = 0; i < shape.positions.length / 3; i++) {
    avec3.multMat4(shape.positions, i, rotation, 0);
  }

  return shape;
};

const shader = /* wgsl */ `
struct Uniforms {
  projection: mat4x4f,
  view: mat4x4f,
  mode: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var colorSampler: sampler;
@group(0) @binding(2) var colorTexture: texture_2d<f32>;

struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
}

@vertex
fn vertexMain(input: VertexIn) -> VertexOut {
  var output: VertexOut;
  output.normal = input.normal;
  output.uv = input.uv;
  output.position = uniforms.projection * uniforms.view * vec4f(input.position, 1.0);
  return output;
}

@fragment
fn fragmentMain(input: VertexOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let diffuse = 0.5 + 0.5 * max(dot(normal, normalize(vec3f(1.0, 2.0, 3.0))), 0.0);
  var color = textureSample(colorTexture, colorSampler, input.uv).rgb * diffuse;
  if (uniforms.mode == 1.0) {
    color = normal * 0.5 + 0.5;
  } else if (uniforms.mode == 2.0) {
    color = vec3f(fract(input.uv), 0.0);
  }
  // Back faces show through open caps and inside-out solids
  if (!frontFacing) {
    color = mix(color, vec3f(1.0, 0.0, 0.0), 0.6);
  }
  return vec4f(color, 1.0);
}
`;

const camera = createCamera({
  position: [1, 0.5, 1.5],
  fov: Math.PI / 4,
  aspect: ctx.width / ctx.height,
  near: 0.1,
  far: 100,
});
createOrbiter({ camera, element: ctx.canvas });

const projection = mat4.create();

const drawCmd = gpu.defineCommand({
  label: "drawExtrusion",
  pass: { clearValue: [0.13, 0.13, 0.13, 1], depthClearValue: 1 },
  pipeline: { shader, depthWriteEnabled: true, cullMode: "none" },
  uniforms: {
    projection,
    view: camera.viewMatrix,
    mode: settings.view,
    colorSampler: sampler,
    colorTexture: texture,
  },
});

const update = () => {
  const geometry = geomExtrude(createShape(), {
    ...options,
    capMapping: CAP_MAPPINGS[settings.capMapping],
  });

  for (const buffer of [
    ...Object.values(drawCmd.attributes ?? {}),
    drawCmd.indices,
  ]) {
    buffer?.[Symbol.dispose]();
  }

  drawCmd.attributes = {
    position: gpu.createBuffer(ctx, {
      usage: "vertex",
      data: geometry.positions,
    }),
    normal: gpu.createBuffer(ctx, { usage: "vertex", data: geometry.normals }),
    uv: gpu.createBuffer(ctx, { usage: "vertex", data: geometry.uvs }),
  };
  drawCmd.indices = gpu.createBuffer(ctx, {
    usage: "index",
    data: geometry.cells,
  });
  drawCmd.uniforms.mode = settings.view;
};
update();

const pane = new Pane({ title: "geom-extrude" });

const shapeFolder = pane.addFolder({ title: "Shape" });
shapeFolder.addBinding(settings, "shape", {
  options: toListOptions(Object.keys(SHAPES)),
});
shapeFolder.addBinding(settings, "shapeUvs", { label: "uvs" });
shapeFolder.addBinding(settings, "orientation", {
  options: toListOptions(Object.keys(ORIENTATIONS)),
});

const extrudeFolder = pane.addFolder({ title: "Extrude" });
extrudeFolder.addBinding(options, "thickness", { min: -1, max: 1 });
extrudeFolder.addBinding(options, "direction", {
  options: toListOptions(DIRECTIONS),
});
extrudeFolder.addBinding(options, "center");
extrudeFolder.addBinding(options, "capStart");
extrudeFolder.addBinding(options, "capEnd");
extrudeFolder.addBinding(settings, "capMapping", {
  options: toListOptions(Object.keys(CAP_MAPPINGS)),
});
extrudeFolder.addBinding(options, "creaseAngle", { min: 0, max: Math.PI });
extrudeFolder.addBinding(options, "ignoreSeams");
extrudeFolder.addBinding(options, "closed", { options: CLOSED });

pane.addBinding(settings, "view", { options: VIEWS });

pane.on("change", update);

window.addEventListener("resize", () => {
  gpu.resize(ctx, window.innerWidth, window.innerHeight);
});

gpu.frame(ctx, () => {
  mat4.perspectiveZO(
    projection,
    camera.fov,
    ctx.width / ctx.height,
    camera.near,
    camera.far,
  );
  gpu.submit(ctx, drawCmd);
});
