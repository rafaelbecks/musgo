/**
 * MUSGO wordmark — same SVG twice: flat white (X-offset) + hue-modulating green.
 * Size / white X offset: see logoConfig.js (also on window.MUSGO_SPLASH).
 */

import { LOGO_VIEWPORT_SCALE } from "./logoConfig.js";
import * as logoConfig from "./logoConfig.js";

const SVG_URL = "./assets/musgo-logo.svg";

export function createMusgoLogo(canvas) {
  const ctx = canvas.getContext("2d");
  let path = null;
  let viewBox = { x: 0, y: 0, width: 2930, height: 643 };
  let raf = 0;
  let t = 0;
  let running = false;
  let baseHue = 89;

  const state = {
    viewportScale: LOGO_VIEWPORT_SCALE,
    get whiteOffsetX() {
      return logoConfig.WHITE_OFFSET_X;
    },
    set whiteOffsetX(v) {
      logoConfig.WHITE_OFFSET_X = Number(v);
    },
  };

  async function loadSvg() {
    const response = await fetch(SVG_URL);
    const svgText = await response.text();
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    const pathEl = svg?.querySelector("path");
    if (!svg || !pathEl) throw new Error("MUSGO logo SVG missing path");

    const vb = (svg.getAttribute("viewBox") || "0 0 2930 643")
      .split(/[\s,]+/)
      .map(Number);
    viewBox = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
    path = new Path2D(pathEl.getAttribute("d"));
  }

  function resize() {
    const size =
      Math.min(window.innerWidth, window.innerHeight) * state.viewportScale;
    const aspect = viewBox.width / viewBox.height;
    const offsetPad = Math.max(0, Math.abs(state.whiteOffsetX)) + 4;
    const cssW = size + offsetPad;
    const cssH = size / aspect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hueColor(elapsed) {
    const hue = (baseHue + elapsed * 20) % 360;
    return `hsla(${hue}, 100%, 55%, 1)`;
  }

  function drawLayer(ox, oy, scale, fill) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.translate(-viewBox.x, -viewBox.y);
    ctx.fillStyle = fill;
    ctx.fill(path);
    ctx.restore();
  }

  function draw() {
    const cssW = parseFloat(canvas.style.width) || canvas.width;
    const cssH = parseFloat(canvas.style.height) || canvas.height;
    ctx.clearRect(0, 0, cssW, cssH);
    if (!path) return;

    const pad = 0.92;
    const logoW =
      Math.min(window.innerWidth, window.innerHeight) * state.viewportScale;
    const scale = Math.min(logoW / viewBox.width, cssH / viewBox.height) * pad;
    const drawnW = viewBox.width * scale;
    const ox = (cssW - drawnW) / 2;
    const oy = (cssH - viewBox.height * scale) / 2;

    // Same SVG, same scale — white shifted on X, then green on top
    drawLayer(ox + state.whiteOffsetX, oy, scale, "#ffffff");
    drawLayer(ox, oy, scale, hueColor(t));
  }

  function frame() {
    if (!running) return;
    t += 1 / 60;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function onResize() {
    resize();
    draw();
  }

  return {
    state,
    resize,
    async start() {
      await loadSvg();
      resize();
      baseHue = 60 + Math.random() * 80;
      running = true;
      window.addEventListener("resize", onResize);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    destroy() {
      this.stop();
      window.removeEventListener("resize", onResize);
    },
  };
}
