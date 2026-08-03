import { rewriteLSystem } from "../morphogenesis/lsystem/rewrite.js";
import { resolveLSystemGrammar } from "../morphogenesis/lsystem/grammars.js";
import { interpretTurtle2d } from "./turtle2d.js";
import {
  FERN_ITERATIONS,
  FERN_SIZE,
  FERN_ANCHOR_Y,
  FERN_MODULATION_HZ,
  FERN_ANGLE_MIN,
  FERN_ANGLE_MAX,
  FERN_ANGLE_SAMPLES,
  FERN_DPR,
  FERN_STROKE_COLOR,
  FERN_LINE_WIDTH,
} from "./fernConfig.js";

/**
 * Full-bleed 2D fern L-system background.
 *
 * Geometry is baked once per angle sample (Path2D). Playback ping-pongs through
 * those samples at constant pace so the ends don't stall (sine used to linger
 * there because d(angle)/dt → 0). All samples are baked before the loop runs,
 * so the first visit to max angle never pays a turtle hitch mid-frame.
 */
export function createFernBackground(canvas) {
  const ctx = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });

  const grammar = resolveLSystemGrammar("plant");
  const product = rewriteLSystem(
    grammar.axiom,
    grammar.rules,
    FERN_ITERATIONS,
    500_000
  );

  const sampleCount = Math.max(2, FERN_ANGLE_SAMPLES | 0);
  const flipX = Math.random() < 0.5 ? -1 : 1;
  const headingJitter = (Math.random() - 0.5) * 0.35;

  /** @type {(Path2D | null)[]} */
  const paths = new Array(sampleCount).fill(null);
  /** @type {({ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } | null)[]} */
  const boundsList = new Array(sampleCount).fill(null);

  let raf = 0;
  let t0 = 0;
  let running = false;
  let lastDrawnIndex = -1;

  const state = {
    size: FERN_SIZE,
    anchorY: FERN_ANCHOR_Y,
    modulationHz: FERN_MODULATION_HZ,
    strokeColor: FERN_STROKE_COLOR,
    lineWidth: FERN_LINE_WIDTH,
  };

  function angleAtSample(i) {
    return (
      FERN_ANGLE_MIN +
      (i / (sampleCount - 1)) * (FERN_ANGLE_MAX - FERN_ANGLE_MIN)
    );
  }

  /** Constant-speed ping-pong over sample indices; always starts at 0 (min angle). */
  function sampleIndexAtTime(tSec) {
    const cycle = tSec * state.modulationHz; // 1.0 = min→max→min
    const u = cycle - Math.floor(cycle); // 0..1
    const ping = u <= 0.5 ? u * 2 : 2 - u * 2; // 0→1→0
    return Math.max(
      0,
      Math.min(sampleCount - 1, Math.round(ping * (sampleCount - 1)))
    );
  }

  function buildPath(segs) {
    const path = new Path2D();
    for (let i = 0; i < segs.length; i += 4) {
      path.moveTo(segs[i], segs[i + 1]);
      path.lineTo(segs[i + 2], segs[i + 3]);
    }
    return path;
  }

  function bakeSample(i) {
    if (paths[i]) return;
    const { segs, bounds } = interpretTurtle2d(product, {
      angleDeg: angleAtSample(i),
      step: 1,
      heading: Math.PI / 2 + headingJitter,
    });
    paths[i] = buildPath(segs);
    boundsList[i] = bounds;
  }

  function bakeAll() {
    for (let i = 0; i < sampleCount; i++) bakeSample(i);
  }

  function drawSample(i) {
    const path = paths[i];
    const bounds = boundsList[i];
    if (!path || !bounds || bounds.width <= 0 || bounds.height <= 0) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = canvas.width / w || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const target = Math.min(w, h) * state.size;
    const scale = Math.min(target / bounds.width, target / bounds.height);
    const cx = w * 0.5;
    const cy = h * state.anchorY;
    const ox = (bounds.minX + bounds.maxX) / 2;
    const oy = bounds.minY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flipX * scale, -scale);
    ctx.translate(-ox, -oy);
    ctx.strokeStyle = state.strokeColor;
    ctx.lineWidth = state.lineWidth / scale;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.stroke(path);
    ctx.restore();

    lastDrawnIndex = i;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, FERN_DPR);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    if (running && lastDrawnIndex >= 0 && paths[lastDrawnIndex]) {
      drawSample(lastDrawnIndex);
    }
  }

  function frame(now) {
    if (!running) return;
    const index = sampleIndexAtTime((now - t0) / 1000);
    if (index !== lastDrawnIndex) {
      drawSample(index);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;

    const dpr = Math.min(window.devicePixelRatio || 1, FERN_DPR);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // Paint min angle immediately, then finish the cache before animating
    bakeSample(0);
    drawSample(0);
    bakeAll();

    t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  window.addEventListener("resize", resize);

  return {
    state,
    start,
    stop,
    destroy() {
      stop();
      window.removeEventListener("resize", resize);
      paths.fill(null);
      boundsList.fill(null);
    },
  };
}
