export const MORPH_SHAPES = [
  "torus",
  "torusknot",
  "chenGackstatter",
  "lopezros",
  "gielis",
  "baschetLeaf",
  "lsystem",
  "model",
];

export const SHAPE_LABELS = {
  torus: "torus",
  torusknot: "torus knot",
  chenGackstatter: "Chen–Gackstätter",
  lopezros: "López–Ros",
  gielis: "Gielis superformula",
  baschetLeaf: "Baschet leaf",
  lsystem: "L-system organism",
  model: "model",
};

export const morphParams = {
  shape: "torus",
  modelFile: "cosos/pututu",
  extent: 3,
  shapeSegments: 128,
  envelopeRadius: 1,
  torusTube: 0.35,
  torusKnotRadius: 1,
  torusKnotTube: 0.35,
  torusKnotTubularSegments: 512,
  torusKnotRadialSegments: 64,
  torusKnotP: 2,
  torusKnotQ: 3,
  minimalVSegments: 64,
  chenGackstatterRMin: 0.22,
  chenGackstatterRMax: 0.78,
  chenGackstatterStretchZ: 1,
  lopezRosSpan: 1.2,
  lopezRosDeform: 0.35,
  lopezRosTwist: 0,
  lopezRosMode: "catenoid",
  lopezRosStackCount: 3,
  lopezRosStackSpacing: 1.0,
  gielisA1: 1,
  gielisB1: 1,
  gielisM1: 6,
  gielisN11: 1,
  gielisN12: 1,
  gielisN13: 1,
  gielisFamily1: "superellipse",
  gielisA2: 1,
  gielisB2: 1,
  gielisM2: 3,
  gielisN21: 1,
  gielisN22: 1,
  gielisN23: 1,
  gielisFamily2: "superellipse",
  gielisPhiMode: "latitude",
  gielisVSegments: 64,
  leafRadius: 1,
  leafWidthScale: 0.55,
  leafHeightScale: 1.85,
  leafExponent: 0.85,
  leafAsymmetry: 0,
  leafTopPinch: 0.08,
  leafBottomPinch: 0.12,
  leafSkew: 0,
  leafResolution: 64,
  leafFoldDepth: 0.28,
  leafFoldPower: 1.15,
  leafBulge: 0.58,
  lsystemPreset: "shrimp",
  lsystemIterations: 3,
  lsystemAngle: 0,
  lsystemStep: 0.35,
  lsystemTubeRadius: 0.05,
  lsystemTaper: 0.9,
  lsystemBranchTaper: 0.78,
  lsystemLengthDecay: 0.94,
  lsystemSegments: 1,
  lsystemRadialSegments: 6,
  lsystemTubularDetail: 2,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  side: "double",
  color: "#7dbeff",
  glassEnabled: false,
  glassMetalness: 0,
  glassRoughness: 0.2,
  glassTransmission: 1,
  glassIor: 1.5,
  glassThickness: 2.5,
  glassEnvMapIntensity: 1.5,
  glassClearcoat: 1,
  glassClearcoatRoughness: 0.1,
  glassNormalScale: 0.3,
  glassClearcoatNormalScale: 0.2,
  glassNormalRepeat: 3,
  glassTransparent: true,
  noiseEnabled: false,
  noiseAmplitude: 0.25,
  noiseScale: 1.5,
  noiseScaleModEnabled: false,
  noiseScaleModRate: 0.25,
  noiseScaleModAmount: 0.5,
  noiseSeed: 42,
  noiseOctaves: 3,
  noiseMorphSpeed: 3,
  animateNoise: true,
};

export const MORPH_PARAM_KEYS = Object.keys(morphParams);

export function clampMorphParams() {
  if (!MORPH_SHAPES.includes(morphParams.shape)) {
    morphParams.shape = MORPH_SHAPES[0];
  }
  morphParams.noiseOctaves = Math.max(1, Math.min(5, Math.round(morphParams.noiseOctaves)));
  morphParams.torusKnotP = Math.max(1, Math.round(morphParams.torusKnotP));
  morphParams.torusKnotQ = Math.max(1, Math.round(morphParams.torusKnotQ));
  morphParams.chenGackstatterRMin = Math.max(0.05, morphParams.chenGackstatterRMin);
  morphParams.chenGackstatterRMax = Math.min(
    0.95,
    Math.max(morphParams.chenGackstatterRMin + 0.05, morphParams.chenGackstatterRMax)
  );
  morphParams.chenGackstatterStretchZ = Math.max(0.2, morphParams.chenGackstatterStretchZ);
  if (!["catenoid", "stacked"].includes(morphParams.lopezRosMode)) {
    morphParams.lopezRosMode =
      morphParams.lopezRosMode === "stacked catenoids" ? "stacked" : "catenoid";
  }
  morphParams.lopezRosStackCount = Math.max(
    2,
    Math.min(7, Math.round(morphParams.lopezRosStackCount))
  );
  morphParams.lopezRosStackSpacing = Math.max(0.35, morphParams.lopezRosStackSpacing);
  for (const i of ["1", "2"]) {
    if (morphParams[`gielisA${i}`] === 0) morphParams[`gielisA${i}`] = 1e-3;
    if (morphParams[`gielisB${i}`] === 0) morphParams[`gielisB${i}`] = 1e-3;
    if (morphParams[`gielisN${i}1`] === 0) morphParams[`gielisN${i}1`] = 1e-3;
  }
  if (!["superellipse", "superrose", "superspiral"].includes(morphParams.gielisFamily1)) {
    morphParams.gielisFamily1 = "superellipse";
  }
  if (!["superellipse", "superrose", "superspiral"].includes(morphParams.gielisFamily2)) {
    morphParams.gielisFamily2 = "superellipse";
  }
  if (!["latitude", "full"].includes(morphParams.gielisPhiMode)) {
    morphParams.gielisPhiMode = "latitude";
  }
  morphParams.gielisVSegments = Math.max(16, Math.min(256, Math.round(morphParams.gielisVSegments)));
  morphParams.leafRadius = Math.max(0.05, morphParams.leafRadius);
  morphParams.leafWidthScale = Math.max(0.05, morphParams.leafWidthScale);
  morphParams.leafHeightScale = Math.max(0.05, morphParams.leafHeightScale);
  morphParams.leafExponent = Math.max(0.05, morphParams.leafExponent);
  morphParams.leafTopPinch = Math.max(0, Math.min(0.95, morphParams.leafTopPinch));
  morphParams.leafBottomPinch = Math.max(0, Math.min(0.95, morphParams.leafBottomPinch));
  morphParams.leafResolution = Math.max(8, Math.min(256, Math.round(morphParams.leafResolution)));
  morphParams.leafFoldDepth = Math.max(0, Math.min(1.5, morphParams.leafFoldDepth));
  morphParams.leafFoldPower = Math.max(0.2, Math.min(3, morphParams.leafFoldPower));
  morphParams.leafBulge = Math.max(0.15, Math.min(0.85, morphParams.leafBulge));
  if (!["shrimp", "plant", "bush", "algae"].includes(morphParams.lsystemPreset)) {
    morphParams.lsystemPreset = "shrimp";
  }
  morphParams.lsystemIterations = Math.max(
    1,
    Math.min(20, Math.round(morphParams.lsystemIterations))
  );
  morphParams.lsystemAngle = Math.max(0, Math.min(90, morphParams.lsystemAngle));
  morphParams.lsystemStep = Math.max(0.05, Math.min(1.5, morphParams.lsystemStep));
  morphParams.lsystemTubeRadius = Math.max(
    0.005,
    Math.min(0.25, morphParams.lsystemTubeRadius)
  );
  morphParams.lsystemTaper = Math.max(0.5, Math.min(0.99, morphParams.lsystemTaper));
  morphParams.lsystemBranchTaper = Math.max(
    0.4,
    Math.min(1, morphParams.lsystemBranchTaper)
  );
  morphParams.lsystemLengthDecay = Math.max(
    0.7,
    Math.min(1, morphParams.lsystemLengthDecay)
  );
  morphParams.lsystemSegments = Math.max(
    1,
    Math.min(6, Math.round(morphParams.lsystemSegments))
  );
  morphParams.lsystemRadialSegments = Math.max(
    3,
    Math.min(16, Math.round(morphParams.lsystemRadialSegments))
  );
  morphParams.lsystemTubularDetail = Math.max(
    1,
    Math.min(6, Math.round(morphParams.lsystemTubularDetail))
  );
}
