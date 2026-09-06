# Meta Quest VR (WebXR)

Immersive view of the morphogenesis scene via [Three.js VRButton](https://threejs.org/docs/#VRButton) / WebXR. Implementation: `src/scene/vr.js`.

## Requirements

- Meta Quest Browser (or another WebXR headset)
- **HTTPS** (or secure tunnel / ADB reverse to localhost)
- `ENTER VR` only appears when `immersive-vr` is supported

```bash
npm start   # serve on :9990, then open from the headset over HTTPS
```

## Controls

| Input | Action |
| --- | --- |
| Trigger / pinch + drag | Orbit (same idea as mouse drag) |
| Both hands pinch | Zoom (hand distance) |
| **X + A** | Exit VR |

Pick examples on desktop (exit VR → Examples → re-enter). Bloom / EffectComposer is skipped while presenting (not WebXR-safe).

## Notes

- Desktop OrbitControls framing is restored on exit
- Optional session features: `local-floor`, `hand-tracking`, `layers`
