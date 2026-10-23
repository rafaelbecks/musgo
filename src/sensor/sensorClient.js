import { applySensorMessage, createSensorState } from "./sensorState.js";

/**
 * Browser client for Ardeidae's WebSocket transport
 * (`npm run cli -- --transport ws` → ws://127.0.0.1:8080).
 * Messages are `{ address, value }` JSON, same as cartografias-imposibles.
 */
export function createSensorClient({ onState, onMessage } = {}) {
  let socket = null;
  let onStatus = () => {};
  let externalMessageHandler = onMessage ?? (() => {});
  const state = createSensorState();

  function setStatus(connected, detail = "") {
    onStatus({ connected, detail });
  }

  function connect(wsUrl) {
    disconnect();
    setStatus(false, "connecting");

    socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      setStatus(true);
    });

    socket.addEventListener("message", (event) => {
      try {
        const { address, value } = JSON.parse(event.data);
        externalMessageHandler({ address, value });
        if (applySensorMessage(state, address, value)) {
          onState?.(state);
        }
      } catch (err) {
        console.warn("[sensor] bad message", err);
      }
    });

    socket.addEventListener("close", () => {
      setStatus(false);
      socket = null;
    });

    socket.addEventListener("error", () => {
      setStatus(false, "connection failed");
    });
  }

  function disconnect() {
    if (socket) {
      socket.close();
      socket = null;
    }
    setStatus(false);
  }

  function getState() {
    return state;
  }

  return {
    connect,
    disconnect,
    getState,
    set onStatus(handler) {
      onStatus = handler ?? (() => {});
    },
    set onMessage(handler) {
      externalMessageHandler = handler ?? (() => {});
    },
  };
}
