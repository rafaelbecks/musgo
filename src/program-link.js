/**
 * Operator → output link. The output window runs the three.js scene and
 * follows the operator's organism (without embedded model or texture blobs).
 * `createdAt` changes on every serialize, so it is left out of the comparison.
 */
import { serializeOrganism } from "./morphogenesis/organismState.js";

const CHANNEL = "luminode-musgo";

function snapshot() {
  const project = serializeOrganism({
    includeModel: false,
    includeSculpt: false,
    includeTexture: false,
    includeEnv: false,
  });
  delete project.createdAt;
  return project;
}

export function attachMusgoLink(appApi) {
  const channel = new BroadcastChannel(CHANNEL);
  const output = document.body.classList.contains("is-output");
  let last = "";
  let applying = false;

  if (output) {
    channel.onmessage = async (event) => {
      if (event.data?.type !== "state" || applying) return;
      if (!event.data.signature || event.data.signature === last) return;
      last = event.data.signature;
      applying = true;
      try {
        await appApi.followOrganism(event.data.project);
      } catch (error) {
        console.warn("[musgo output] could not apply organism", error);
        last = "";
      } finally {
        applying = false;
      }
    };
    channel.postMessage({ type: "hello" });
    return;
  }

  const send = () => {
    try {
      const project = snapshot();
      const signature = JSON.stringify(project);
      if (signature === last) return;
      last = signature;
      channel.postMessage({ type: "state", signature, project });
    } catch {
      // The organism is not readable until the scene has booted.
    }
  };

  channel.onmessage = (event) => {
    if (event.data?.type === "hello") send();
  };
  window.setInterval(send, 500);
}
