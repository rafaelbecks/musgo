export const NOISE_TARGETS = ["whole", "element"];
export const NOISE_TARGET_LABELS = {
  whole: "whole model",
  element: "each element",
};

export const DLA_SEED_MODES = ["point", "plane", "line", "ring", "sphere"];
export const DLA_LAUNCH_MODES = ["sphere", "hemisphere", "top", "equator"];
export const DLA_CONNECTIVITY = ["face", "full"];
export const DLA_ELEMENT_SHAPES = [
  "sphere",
  "box",
  "tetrahedron",
  "octahedron",
  "cone",
  "cylinder",
];

export const DLA_SEED_MODE_LABELS = {
  point: "point (center)",
  plane: "plane (floor)",
  line: "line",
  ring: "ring",
  sphere: "sphere shell",
};

export const DLA_LAUNCH_MODE_LABELS = {
  sphere: "sphere (around)",
  hemisphere: "hemisphere (up)",
  top: "from above",
  equator: "equator band",
};

export const DLA_CONNECTIVITY_LABELS = {
  face: "face (6)",
  full: "full (26)",
};

export const DLA_ELEMENT_SHAPE_LABELS = {
  sphere: "sphere",
  box: "box",
  tetrahedron: "tetrahedron",
  octahedron: "octahedron",
  cone: "cone",
  cylinder: "cylinder",
};
