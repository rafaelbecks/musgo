# Meta Quest VR (WebXR)

Immersive view of the morphogenesis scene via [Three.js WebXR](https://threejs.org/docs/#VRButton). Implementation: `src/scene/vr.js`.

## Requirements

- Meta Quest Browser (or another WebXR headset)
- **HTTPS** (or secure tunnel / ADB reverse to localhost)
- `ENTER VR` appears when `immersive-ar` or `immersive-vr` is supported
- Passthrough / translucent mode needs **`immersive-ar`** (Quest 2/3/Pro with passthrough)

```bash
npm start   # serve on :9990, then open from the headset over HTTPS
```

## Controls

| Input | Action |
| --- | --- |
| Trigger + drag | Orbit (same idea as mouse drag) |
| Both triggers (pinch) | Zoom (hand distance) |
| **Grip + drag** | Pan / reposition object (left·right·up·down·depth) |
| **Y or B** | Toggle translucent **camera** (passthrough) ↔ **env** sky |
| **X + A** | Exit VR |

In **camera** mode the HDR/EXR stays as `scene.environment` (object lighting unchanged); only the sky/`scene.background` is cleared so passthrough shows through. Desktop browser rendering is restored on exit and is never left transparent.

Pick examples on desktop (exit VR → Examples → re-enter). Bloom / EffectComposer is skipped while presenting (not WebXR-safe).

## Notes

- Prefer `immersive-ar` when available (alpha-blend passthrough); otherwise `immersive-vr` (env toggle only — no real-world camera)
- Desktop OrbitControls framing is restored on exit
- Optional session features: `local-floor`, `hand-tracking`, `layers`
