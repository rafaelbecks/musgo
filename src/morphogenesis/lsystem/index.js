import { resolveLSystemGrammar } from "./grammars.js";
import { rewriteLSystem } from "./rewrite.js";
import { interpretTurtle } from "./turtle.js";
import { strokesToGeometry, fitGeometryToSize } from "./geometry.js";

export {
  LSYSTEM_PRESET_LABELS,
  resolveLSystemGrammar,
} from "./grammars.js";

/**
 * Morphogenesis entry: L-system rewrite → 3D turtle → tube mesh,
 * fitted to extent × envelopeRadius like other procedural shapes.
 */
export function createLSystemGeometry(extent, params) {
  const preset = params.lsystemPreset ?? "plant";
  const grammar = resolveLSystemGrammar(preset, params);

  const iterations = Math.max(0, Math.floor(params.lsystemIterations ?? 3));
  const angleDeg =
    params.lsystemAngle != null && params.lsystemAngle > 0
      ? params.lsystemAngle
      : grammar.angle;

  const product = rewriteLSystem(grammar.axiom, grammar.rules, iterations);

  const step = Math.max(0.02, params.lsystemStep ?? 0.35);
  const radius = Math.max(0.005, params.lsystemTubeRadius ?? 0.045);
  const taper = params.lsystemTaper ?? 0.9;
  const branchTaper = params.lsystemBranchTaper ?? 0.78;
  const lengthDecay = params.lsystemLengthDecay ?? 0.94;
  const radialSegments = Math.max(
    3,
    Math.floor(params.lsystemRadialSegments ?? 6)
  );

  const strokes = interpretTurtle(product, {
    step,
    angleDeg,
    radius,
    taper,
    branchTaper,
    lengthDecay,
  });

  const geometry = strokesToGeometry(strokes, {
    radialSegments,
    tubularPerStep: Math.max(1, Math.floor(params.lsystemTubularDetail ?? 2)),
  });

  const targetSize = Math.max(0.1, extent * (params.envelopeRadius ?? 1));
  fitGeometryToSize(geometry, targetSize);

  // Shrimp reads better horizontal (body along +X)
  if (preset === "shrimp") {
    geometry.rotateZ(-Math.PI / 2);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  return geometry;
}
