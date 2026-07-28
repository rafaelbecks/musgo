import * as THREE from "three";
import { morphParams } from "./morphParams.js";
import {
  createChenGackstatterGeometry,
  createLopezRosGeometry,
} from "./minimalSurfaces.js";
import { createGielisGeometry } from "./gielis.js";
import { createBaschetLeafGeometry } from "./baschetLeaf/index.js";
import { createLSystemGeometry } from "./lsystem/index.js";

export function createMorphGeometry(shape, extent, params = morphParams) {
  const segments = Math.max(16, Math.floor(params.shapeSegments));

  switch (shape) {
    case "torus": {
      const major = extent * params.envelopeRadius * 0.5;
      const tube = major * params.torusTube;
      return new THREE.TorusGeometry(
        major,
        tube,
        Math.max(8, Math.floor(segments * 0.5)),
        segments
      );
    }

    case "torusknot": {
      const scale = extent * params.envelopeRadius * 0.5;
      return new THREE.TorusKnotGeometry(
        scale * params.torusKnotRadius,
        scale * params.torusKnotTube,
        Math.max(3, Math.floor(params.torusKnotTubularSegments)),
        Math.max(3, Math.floor(params.torusKnotRadialSegments)),
        Math.max(1, Math.floor(params.torusKnotP)),
        Math.max(1, Math.floor(params.torusKnotQ))
      );
    }

    case "chenGackstatter":
      return createChenGackstatterGeometry(extent, params);

    case "lopezros":
      return createLopezRosGeometry(extent, params);

    case "gielis":
      return createGielisGeometry(extent, params);

    case "baschetLeaf":
      return createBaschetLeafGeometry(extent, params);

    case "lsystem":
      return createLSystemGeometry(extent, params);

    default:
      return new THREE.TorusGeometry(1, 0.35, 16, 64);
  }
}

export function getMorphSide(side) {
  switch (side) {
    case "inside":
      return THREE.BackSide;
    case "double":
      return THREE.DoubleSide;
    default:
      return THREE.FrontSide;
  }
}
