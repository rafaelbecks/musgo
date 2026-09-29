/**
 * Bottom-left FPS graph using Tweakpane Essentials.
 * https://tweakpane.github.io/docs/plugins/
 */
import { Pane } from "tweakpane";
import * as EssentialsPlugin from "../lib/tweakpane-plugin-essentials.min.js";

export function createFpsGraph(mountEl) {
  const el = document.createElement("div");
  el.className = "fps-graph";
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  mountEl.appendChild(el);

  let pane = null;
  let graph = null;
  let visible = false;
  let measuring = false;

  function ensureGraph() {
    if (pane) return;
    // Build while laid out so the graph canvas gets a real width.
    el.hidden = false;
    pane = new Pane({ container: el });
    pane.registerPlugin(EssentialsPlugin);
    graph = pane.addBlade({
      view: "fpsgraph",
      label: "fps",
      rows: 2,
      min: 0,
      max: 120,
    });
  }

  function setVisible(next) {
    visible = Boolean(next);
    if (visible) ensureGraph();
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  return {
    isVisible: () => visible,
    toggle() {
      setVisible(!visible);
    },
    begin() {
      if (!visible || !graph || measuring) return;
      graph.begin();
      measuring = true;
    },
    end() {
      if (!measuring || !graph) return;
      graph.end();
      measuring = false;
    },
    destroy() {
      pane?.dispose();
      el.remove();
    },
  };
}
