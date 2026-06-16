# Neon Stack VR

A precision block-stacking game built with [IWSDK](https://iwsdk.dev) — playable in the browser and in VR.

## Play

[**Play Now →**](https://ellyz2426.github.io/neon-stack/)

## Gameplay

Blocks slide back and forth. Time your placement to stack them as high as possible. Any overhang gets cut off — but land a perfect placement and the block grows back!

### Game Modes

| Mode | Description |
|------|-------------|
| **Classic** | Speed increases as you climb |
| **Zen** | No game over — stack forever |
| **Speed** | 60 seconds on the clock |
| **Precision** | No block growth — every cut is permanent |
| **Challenge** | Reach a random target height |
| **Endless** | Constant speed — pure focus |

### Controls

- **VR**: Trigger or A button to place, B button to pause
- **Browser**: Click/tap to place, Space bar to place, Escape to pause

## Features

- 🎮 6 game modes with distinct mechanics
- 🏆 44 achievements to unlock
- 📊 Persistent statistics tracking
- 🎵 Procedural audio engine
- ✨ Dynamic particle effects and tower lighting
- 🌌 Environmental progression — sky shifts as you climb
- 🥽 Full VR support with XR controller input
- 🖱️ Browser click/tap support

## Tech

Built with [IWSDK](https://github.com/nicholasio/immersive-web-sdk) using:
- PanelUI spatial interface system (11 `.uikitml` templates)
- ECS architecture with `createSystem`
- Three.js rendering with neon aesthetics
- Web Audio API for procedural sound

## Development

```bash
npm install
npm run dev
```

## License

MIT
