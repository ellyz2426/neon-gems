# Neon Gems VR

A match-3 swap puzzle game built with [IWSDK](https://iwsdk.dev) (Immersive Web SDK). Swap adjacent gems on an 8x8 neon grid to match 3 or more, trigger cascading combos, and chase high scores across 6 game modes.

**[Play Now](https://ellyz2426.github.io/neon-gems/)**

## Features

- 8x8 neon gem grid with 6 distinct gem types, each with unique 3D shapes
- 6 game modes: Classic, Timed, Zen, Endless, Daily Challenge, Puzzle
- 3 difficulty levels with scaling move/time limits
- Cascading match system with combo multipliers
- 40 achievements to unlock
- 8 gem skins and 4 color themes
- Procedural audio — synthesized SFX and ambient drone music
- Persistent leaderboard and statistics via localStorage
- Full VR support — controller pointing + trigger to select, B to pause
- Browser-first — mouse click to select/swap gems on desktop
- 14 PanelUI spatial panels for all game UI

## Controls

### Desktop
- Click a gem to select it, click an adjacent gem to swap

### VR
- Point controller at gem, pull trigger to select
- Press B to pause

## Tech

Built with [IWSDK](https://iwsdk.dev) v0.4.1 using:
- PanelUI spatial interface system (14 `.uikitml` templates)
- ECS architecture with `createSystem`
- Three.js rendering with neon aesthetics
- Web Audio API for procedural sound

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
```

## License

MIT
