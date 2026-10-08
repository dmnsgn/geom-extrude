// Pixel font: rows top to bottom, "#" filled
// prettier-ignore
export const GLYPHS = {
  R: [
    "#####.",
    "##..##",
    "##..##",
    "#####.",
    "##.##.",
    "##..##",
    "##..##",
  ],
  B: [
    "#####.",
    "##..##",
    "#####.",
    "##..##",
    "##..##",
    "#####.",
  ],
  // Pixels touching only at a corner: separate solids (X, %) or a hole
  // touching the outside (4)
  X: [
    "#...#",
    ".#.#.",
    "..#..",
    ".#.#.",
    "#...#",
  ],
  "%": [
    "##...#",
    "##..#.",
    "...#..",
    "..#...",
    ".#..##",
    "#...##",
  ],
  4: [
    "...##.",
    "..###.",
    ".#.##.",
    "######",
    "...##.",
  ],
};

/**
 * Welded quad per filled pixel, facing +Z, centered and of unit height.
 *
 * @param {string[]} rows
 * @returns {import("../types.js").SimplicialComplex}
 */
export const glyph = (rows) => {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));

  const indices = new Map();
  const positions = [];
  const cells = [];

  const vertex = (x, y) => {
    const key = y * (width + 1) + x;
    if (!indices.has(key)) {
      indices.set(key, positions.length / 3);
      positions.push((x - width / 2) / height, (height / 2 - y) / height, 0);
    }
    return indices.get(key);
  };

  rows.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      if (pixel !== "#") return;
      const a = vertex(x, y + 1);
      const b = vertex(x + 1, y + 1);
      const c = vertex(x + 1, y);
      const d = vertex(x, y);
      cells.push(a, b, c, a, c, d);
    });
  });

  return {
    positions: new Float32Array(positions),
    cells: new Uint16Array(cells),
  };
};
