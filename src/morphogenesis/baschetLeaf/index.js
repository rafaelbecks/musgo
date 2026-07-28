import { DEFAULT_LEAF_OUTLINE } from "./leafOutline.js";
import { generateLeafGeometry } from "./leafGeometry.js";

/**
 * Morphogenesis entry: map shared morph params → leaf outline params,
 * scaled by extent / envelopeRadius like other procedural shapes.
 */
export function createBaschetLeafGeometry(extent, params) {
  const scale = extent * (params.envelopeRadius ?? 1);

  return generateLeafGeometry({
    radius: (params.leafRadius ?? DEFAULT_LEAF_OUTLINE.radius) * scale,
    heightScale: params.leafHeightScale ?? DEFAULT_LEAF_OUTLINE.heightScale,
    widthScale: params.leafWidthScale ?? DEFAULT_LEAF_OUTLINE.widthScale,
    exponent: params.leafExponent ?? DEFAULT_LEAF_OUTLINE.exponent,
    asymmetry: params.leafAsymmetry ?? DEFAULT_LEAF_OUTLINE.asymmetry,
    topPinch: params.leafTopPinch ?? DEFAULT_LEAF_OUTLINE.topPinch,
    bottomPinch: params.leafBottomPinch ?? DEFAULT_LEAF_OUTLINE.bottomPinch,
    skew: params.leafSkew ?? DEFAULT_LEAF_OUTLINE.skew,
    resolution: params.leafResolution ?? DEFAULT_LEAF_OUTLINE.resolution,
    foldDepth: params.leafFoldDepth ?? DEFAULT_LEAF_OUTLINE.foldDepth,
    foldPower: params.leafFoldPower ?? DEFAULT_LEAF_OUTLINE.foldPower,
    bulge: params.leafBulge ?? DEFAULT_LEAF_OUTLINE.bulge,
  });
}
