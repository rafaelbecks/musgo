import { buildParametricMesh } from "./parametricMesh.js";

function catenoidScale(extent, params) {
  return extent * params.envelopeRadius * 0.22;
}

function isBad(n) {
  return !Number.isFinite(n) || Math.abs(n) > 50;
}

function readCatenoidParams(params) {
  return {
    vSegments: params.catenoidVSegments ?? params.minimalVSegments ?? params.shapeSegments * 0.4,
    span: params.catenoidSpan ?? params.lopezRosSpan ?? 1.2,
    deform: params.catenoidDeform ?? params.lopezRosDeform ?? 0.35,
    twist: params.catenoidTwist ?? params.lopezRosTwist ?? 0,
    mode: params.catenoidMode ?? params.lopezRosMode ?? "catenoid",
    stackCount: params.catenoidStackCount ?? params.lopezRosStackCount ?? 3,
    stackSpacing: params.catenoidStackSpacing ?? params.lopezRosStackSpacing ?? 1.0,
  };
}

export function createCatenoidsGeometry(extent, params) {
  const cfg = readCatenoidParams(params);
  if (cfg.mode === "stacked") {
    return createStackedCatenoidsGeometry(extent, params, cfg);
  }
  return createSingleCatenoidGeometry(extent, params, cfg);
}

function createSingleCatenoidGeometry(extent, params, cfg) {
  const scale = catenoidScale(extent, params);
  const uSeg = Math.max(24, Math.floor(params.shapeSegments));
  const vSeg = Math.max(12, Math.floor(cfg.vSegments));

  const geometry = buildParametricMesh({
    uSegments: uSeg,
    vSegments: vSeg,
    uMin: 0,
    uMax: Math.PI * 2,
    vMin: -cfg.span,
    vMax: cfg.span,
    evaluate: (u, v) => evaluateCatenoid(u, v, scale, cfg.deform, cfg.twist),
  });

  attachCatenoidAcousticLayout(geometry, {
    mode: "catenoid",
    segments: [
      { kind: "bell", a0: 0, a1: 0.42 },
      { kind: "neck", a0: 0.42, a1: 0.58 },
      { kind: "bell", a0: 0.58, a1: 1 },
    ],
    axialLength: 2 * cfg.span * scale,
  });

  return geometry;
}

function createStackedCatenoidsGeometry(extent, params, cfg) {
  const scale = catenoidScale(extent, params);
  const uSeg = Math.max(24, Math.floor(params.shapeSegments));
  const axialSeg = Math.max(32, Math.floor(cfg.vSegments * 1.2));
  const bellCount = Math.max(2, Math.min(7, Math.round(cfg.stackCount)));
  const connectorSpan = cfg.span * cfg.stackSpacing;
  const layout = buildOrganismLayout(bellCount, cfg.span, connectorSpan);

  const geometry = buildParametricMesh({
    uSegments: uSeg,
    vSegments: axialSeg,
    uMin: 0,
    uMax: Math.PI * 2,
    vMin: 0,
    vMax: 1,
    evaluate: (u, w) => {
      const axial = w * layout.total;
      const catV = axialToCatenoidV(axial, layout.segments, cfg.span);
      const p = evaluateCatenoid(u, catV, scale, cfg.deform, cfg.twist);
      if (!p) return null;
      return {
        x: p.x,
        y: p.y,
        z: (axial - layout.total * 0.5) * scale,
      };
    },
  });

  attachCatenoidAcousticLayout(geometry, {
    mode: "stacked",
    segments: layout.segments.map((seg) => ({
      kind: seg.kind === "connector" ? "neck" : "bell",
      a0: seg.a0 / layout.total,
      a1: seg.a1 / layout.total,
    })),
    axialLength: layout.total * scale,
  });

  return geometry;
}

function buildOrganismLayout(bellCount, span, connectorSpan) {
  const segments = [];
  let axial = 0;

  for (let i = 0; i < bellCount; i++) {
    const a0 = axial;
    axial += span;
    segments.push({ kind: "bell", a0, a1: axial, span });

    if (i < bellCount - 1) {
      const c0 = axial;
      axial += connectorSpan;
      segments.push({ kind: "connector", a0: c0, a1: axial, connectorSpan });
    }
  }

  return { segments, total: axial };
}

function axialToCatenoidV(axial, segments, span) {
  const clamped = Math.max(0, Math.min(segments[segments.length - 1].a1, axial));

  for (const seg of segments) {
    if (clamped < seg.a1 || seg === segments[segments.length - 1]) {
      const local = clamped - seg.a0;
      if (seg.kind === "bell") {
        return seg.span - local;
      }
      return local;
    }
  }

  return span;
}

function attachCatenoidAcousticLayout(geometry, { mode, segments, axialLength }) {
  geometry.userData.acousticLayout = {
    kind: "catenoids",
    mode,
    linearChain: true,
    axialLength,
    segments,
  };
}

function evaluateCatenoid(u, v, scale, deform, twist) {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cv = Math.cosh(v);
  const sv = Math.sinh(v);
  const ct = Math.cos(twist);
  const st = Math.sin(twist);
  const cs = Math.cosh(deform);
  const ss = Math.sinh(deform);

  const f1 = cu * cv;
  const f2 = su * cv;
  const f3 = v;
  const f1s = su * sv;
  const f2s = -cu * sv;

  const a = f1 * cs - f2s * ss;
  const b = f2 * cs + f1s * ss;
  const x = (ct * a - st * b) * scale;
  const y = (st * a + ct * b) * scale;
  const z = f3 * scale;

  if (isBad(x) || isBad(y) || isBad(z)) return null;
  return { x, y, z };
}
