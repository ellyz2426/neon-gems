import {
  World,
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  Follower,
  ScreenSpace,
  eq,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  ConeGeometry,
  TorusGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  TetrahedronGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  Color,
  Vector3,
  Vector2,
  Raycaster,
  AmbientLight,
  PointLight,
  DirectionalLight,
  Fog,
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  InputComponent,
} from '@iwsdk/core';

// ─── TYPES & CONSTANTS ────────────────────────────────────────
const GRID_COLS = 8;
const GRID_ROWS = 8;
const CELL_SIZE = 0.22;
const GRID_OFFSET_X = -(GRID_COLS - 1) * CELL_SIZE * 0.5;
const GRID_OFFSET_Y = 0.2;
const GRID_Z = -2.0;
const SWAP_SPEED = 6.0;
const FALL_SPEED = 5.0;
const MATCH_DELAY = 0.25;
const REFILL_DELAY = 0.15;

type GemType = 0 | 1 | 2 | 3 | 4 | 5;
const GEM_COUNT = 6;

interface GemConfig {
  name: string;
  color: number;
  emissive: number;
  shape: 'sphere' | 'box' | 'diamond' | 'tetra' | 'torus' | 'cone';
}

const GEM_CONFIGS: GemConfig[] = [
  { name: 'Ruby', color: 0xff2244, emissive: 0xff1133, shape: 'sphere' },
  { name: 'Sapphire', color: 0x2288ff, emissive: 0x1166ff, shape: 'box' },
  { name: 'Emerald', color: 0x22ff66, emissive: 0x11ff44, shape: 'diamond' },
  { name: 'Topaz', color: 0xffcc22, emissive: 0xffaa11, shape: 'tetra' },
  { name: 'Amethyst', color: 0xcc44ff, emissive: 0xaa22ff, shape: 'torus' },
  { name: 'Citrine', color: 0xff8822, emissive: 0xff6611, shape: 'cone' },
];

type GameState = 'title' | 'mode_select' | 'difficulty' | 'countdown' | 'playing' | 'paused' | 'game_over' | 'leaderboard' | 'achievements' | 'settings' | 'help' | 'stats' | 'skins';
type GameMode = 'classic' | 'timed' | 'zen' | 'endless' | 'daily' | 'puzzle';
type Difficulty = 'easy' | 'medium' | 'hard';

interface GridCell {
  type: GemType;
  mesh: Mesh | null;
  glowMesh: Mesh | null;
  wireMesh: LineSegments | null;
  group: Group | null;
  row: number;
  col: number;
  targetY: number;
  falling: boolean;
  matched: boolean;
  selected: boolean;
  animScale: number;
  animPhase: number;
}

interface SwapAnim {
  r1: number; c1: number;
  r2: number; c2: number;
  progress: number;
  startPos1: Vector3;
  startPos2: Vector3;
  endPos1: Vector3;
  endPos2: Vector3;
  reverting: boolean;
}

interface MatchResult {
  cells: [number, number][];
  isSpecial: boolean;
}

interface Particle {
  mesh: Mesh;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  active: boolean;
}

interface LeaderboardEntry {
  score: number;
  mode: string;
  date: string;
}

interface Achievement {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

// ─── THEMES ───────────────────────────────────────────────────
interface Theme {
  name: string;
  grid: number;
  accent: number;
  bg: number;
  fog: number;
}

const THEMES: Theme[] = [
  { name: 'Neon', grid: 0x00ffff, accent: 0xff00ff, bg: 0x000811, fog: 0x000811 },
  { name: 'Fire', grid: 0xff4400, accent: 0xffaa00, bg: 0x110400, fog: 0x110400 },
  { name: 'Ice', grid: 0x4488ff, accent: 0x88ccff, bg: 0x000a14, fog: 0x000a14 },
  { name: 'Vaporwave', grid: 0xff44cc, accent: 0x44ffcc, bg: 0x0a0014, fog: 0x0a0014 },
];

// ─── GEM SKINS ────────────────────────────────────────────────
interface GemSkin {
  name: string;
  colorMult: number;
  glowMult: number;
  unlock: string;
}

const GEM_SKINS: GemSkin[] = [
  { name: 'Classic Neon', colorMult: 1.0, glowMult: 1.0, unlock: 'default' },
  { name: 'Bright Pulse', colorMult: 1.3, glowMult: 1.5, unlock: '50 matches' },
  { name: 'Soft Glow', colorMult: 0.8, glowMult: 0.6, unlock: '5K score' },
  { name: 'Prismatic', colorMult: 1.1, glowMult: 1.2, unlock: '10 games' },
  { name: 'Deep Core', colorMult: 0.6, glowMult: 2.0, unlock: 'x5 combo' },
  { name: 'Chrome', colorMult: 0.9, glowMult: 0.8, unlock: 'all modes' },
  { name: 'Void', colorMult: 0.4, glowMult: 2.5, unlock: '10K score' },
  { name: 'Solar', colorMult: 1.5, glowMult: 1.8, unlock: '25K score' },
];

// ─── GAME STATE MANAGER ──────────────────────────────────────
class GameStateManager {
  grid: (GridCell | null)[][] = [];
  state: GameState = 'title';
  mode: GameMode = 'classic';
  difficulty: Difficulty = 'medium';
  score = 0;
  combo = 0;
  maxCombo = 0;
  moves = 0;
  movesLeft = 0;
  timeLeft = 0;
  totalMatches = 0;
  totalGems = 0;
  cascadeDepth = 0;
  selectedCell: [number, number] | null = null;
  swapAnim: SwapAnim | null = null;
  processing = false;
  processTimer = 0;
  phase: 'idle' | 'swapping' | 'matching' | 'falling' | 'refilling' = 'idle';
  countdownValue = 3;
  countdownTimer = 0;
  themeIdx = 0;
  skinIdx = 0;
  masterVol = 0.7;
  sfxVol = 0.8;
  musicVol = 0.5;
  gemsMatched: number[] = [0, 0, 0, 0, 0, 0];
  puzzleTarget = 0;
  puzzleColor = 0;

  // Persistence
  bestScores: Record<string, number> = {};
  totalGamesPlayed = 0;
  totalScore = 0;
  bestCombo = 0;
  totalCascades = 0;
  lifetimeMatches = 0;
  lifetimeGems = 0;

  constructor() {
    this.loadState();
  }

  getMoveLimit(): number {
    switch (this.difficulty) {
      case 'easy': return 30;
      case 'medium': return 25;
      case 'hard': return 20;
    }
  }

  getTimeLimit(): number {
    switch (this.difficulty) {
      case 'easy': return 120;
      case 'medium': return 90;
      case 'hard': return 60;
    }
  }

  getTargetScore(): number {
    switch (this.difficulty) {
      case 'easy': return 3000;
      case 'medium': return 5000;
      case 'hard': return 8000;
    }
  }

  saveState() {
    try {
      localStorage.setItem('neon-gems-state', JSON.stringify({
        bestScores: this.bestScores,
        totalGamesPlayed: this.totalGamesPlayed,
        totalScore: this.totalScore,
        bestCombo: this.bestCombo,
        totalCascades: this.totalCascades,
        lifetimeMatches: this.lifetimeMatches,
        lifetimeGems: this.lifetimeGems,
        achievements: achievements.filter(a => a.unlocked).map(a => a.id),
        themeIdx: this.themeIdx,
        skinIdx: this.skinIdx,
        masterVol: this.masterVol,
        sfxVol: this.sfxVol,
        musicVol: this.musicVol,
      }));
    } catch {}
  }

  loadState() {
    try {
      const d = JSON.parse(localStorage.getItem('neon-gems-state') || '{}');
      if (d.bestScores) this.bestScores = d.bestScores;
      if (d.totalGamesPlayed) this.totalGamesPlayed = d.totalGamesPlayed;
      if (d.totalScore) this.totalScore = d.totalScore;
      if (d.bestCombo) this.bestCombo = d.bestCombo;
      if (d.totalCascades) this.totalCascades = d.totalCascades;
      if (d.lifetimeMatches) this.lifetimeMatches = d.lifetimeMatches;
      if (d.lifetimeGems) this.lifetimeGems = d.lifetimeGems;
      if (d.themeIdx !== undefined) this.themeIdx = d.themeIdx;
      if (d.skinIdx !== undefined) this.skinIdx = d.skinIdx;
      if (d.masterVol !== undefined) this.masterVol = d.masterVol;
      if (d.sfxVol !== undefined) this.sfxVol = d.sfxVol;
      if (d.musicVol !== undefined) this.musicVol = d.musicVol;
      if (d.achievements) {
        for (const id of d.achievements) {
          const a = achievements.find(x => x.id === id);
          if (a) a.unlocked = true;
        }
      }
    } catch {}
  }
}

// ─── ACHIEVEMENTS ─────────────────────────────────────────────
const achievements: Achievement[] = [
  { id: 'first_match', name: 'First Match', desc: 'Make your first match', unlocked: false },
  { id: 'ten_matches', name: 'Matchmaker', desc: 'Make 10 matches in one game', unlocked: false },
  { id: 'fifty_matches', name: 'Match Master', desc: 'Make 50 lifetime matches', unlocked: false },
  { id: 'hundred_matches', name: 'Gem Crusher', desc: 'Make 100 lifetime matches', unlocked: false },
  { id: 'cascade_3', name: 'Cascade!', desc: 'Trigger a 3-deep cascade', unlocked: false },
  { id: 'cascade_5', name: 'Avalanche', desc: 'Trigger a 5-deep cascade', unlocked: false },
  { id: 'combo_x3', name: 'Combo Starter', desc: 'Reach x3 combo', unlocked: false },
  { id: 'combo_x5', name: 'Combo King', desc: 'Reach x5 combo', unlocked: false },
  { id: 'combo_x10', name: 'Combo Legend', desc: 'Reach x10 combo', unlocked: false },
  { id: 'score_1k', name: 'Score 1K', desc: 'Score 1,000 points', unlocked: false },
  { id: 'score_5k', name: 'Score 5K', desc: 'Score 5,000 points', unlocked: false },
  { id: 'score_10k', name: 'Score 10K', desc: 'Score 10,000 points', unlocked: false },
  { id: 'score_25k', name: 'Score 25K', desc: 'Score 25,000 points', unlocked: false },
  { id: 'clear_color', name: 'Color Clear', desc: 'Match 20 of one color in a game', unlocked: false },
  { id: 'games_10', name: 'Regular', desc: 'Play 10 games', unlocked: false },
  { id: 'games_50', name: 'Dedicated', desc: 'Play 50 games', unlocked: false },
  { id: 'daily_done', name: 'Daily Player', desc: 'Complete a daily challenge', unlocked: false },
  { id: 'daily_3', name: 'Streak 3', desc: 'Complete 3 daily challenges', unlocked: false },
  { id: 'all_modes', name: 'Explorer', desc: 'Play all 6 game modes', unlocked: false },
  { id: 'zen_100', name: 'Zen Master', desc: 'Match 100 gems in Zen mode', unlocked: false },
  { id: 'timed_5k', name: 'Speed Demon', desc: 'Score 5K in timed mode', unlocked: false },
  { id: 'no_hint', name: 'No Help', desc: 'Win classic without hints', unlocked: false },
  { id: 'perfect_clear', name: 'Board Wipe', desc: 'Clear entire board', unlocked: false },
  { id: 'skin_unlock', name: 'Fashionista', desc: 'Unlock a gem skin', unlocked: false },
  { id: 'theme_all', name: 'Decorator', desc: 'Try all themes', unlocked: false },
  { id: 'match_5', name: 'Quintuple!', desc: 'Match 5 in a row', unlocked: false },
  { id: 'total_gems_500', name: 'Gem Collector', desc: 'Match 500 total gems', unlocked: false },
  { id: 'total_gems_1000', name: 'Gem Hoarder', desc: 'Match 1000 total gems', unlocked: false },
  { id: 'classic_win', name: 'Classic Victor', desc: 'Win a Classic game', unlocked: false },
  { id: 'puzzle_win', name: 'Puzzle Solver', desc: 'Complete a puzzle challenge', unlocked: false },
  { id: 'lucky_cascade', name: 'Lucky Break', desc: 'Get 100+ points from cascades', unlocked: false },
  { id: 'fast_match', name: 'Quick Swap', desc: 'Make 3 matches in 5 seconds', unlocked: false },
  { id: 'total_score_50k', name: 'Wealthy', desc: 'Earn 50K total score', unlocked: false },
  { id: 'total_score_100k', name: 'Rich', desc: 'Earn 100K total score', unlocked: false },
  { id: 'endurance', name: 'Endurance', desc: 'Play for 5+ minutes', unlocked: false },
  { id: 'big_match', name: 'Big Match', desc: 'Match 6+ gems at once', unlocked: false },
  { id: 'chain_3', name: 'Triple Chain', desc: 'Make 3 matches in one move', unlocked: false },
  { id: 'lifetime_1k', name: 'Veteran', desc: 'Score 1K lifetime', unlocked: false },
  { id: 'comeback', name: 'Comeback', desc: 'Win with 3 or fewer moves left', unlocked: false },
  { id: 'no_miss', name: 'Efficient', desc: 'Every swap was a match (10+ moves)', unlocked: false },
];

// ─── AUDIO MANAGER ────────────────────────────────────────────
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private dronePlaying = false;

  init() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.setVolumes(game.masterVol, game.sfxVol, game.musicVol);
  }

  ensureCtx() {
    if (!this.ctx) this.init();
    if (this.ctx!.state === 'suspended') this.ctx!.resume();
  }

  setVolumes(master: number, sfx: number, music: number) {
    if (this.masterGain) this.masterGain.gain.value = master;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (this.musicGain) this.musicGain.gain.value = music;
  }

  private playSfxTone(freq: number, type: OscillatorType, dur: number, vol = 0.3) {
    this.ensureCtx();
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.sfxGain!);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  match(combo: number) {
    this.ensureCtx();
    const ctx = this.ctx!;
    const baseFreq = 440 + combo * 55;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = baseFreq + i * 110;
      g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.2);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + i * 0.06 + 0.2);
    }
  }

  cascade(depth: number) {
    const freq = 660 + depth * 110;
    this.playSfxTone(freq, 'triangle', 0.3, 0.25);
    setTimeout(() => this.playSfxTone(freq * 1.25, 'sine', 0.2, 0.2), 80);
  }

  swap() { this.playSfxTone(330, 'square', 0.08, 0.15); }
  select() { this.playSfxTone(880, 'sine', 0.06, 0.1); }
  invalid() { this.playSfxTone(150, 'sawtooth', 0.15, 0.2); }
  click() { this.playSfxTone(660, 'sine', 0.04, 0.1); }

  gameStart() {
    this.ensureCtx();
    const ctx = this.ctx!;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.3);
    });
  }

  gameOver() {
    this.ensureCtx();
    const ctx = this.ctx!;
    const notes = [784, 659, 523, 392];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
  }

  achievement() {
    this.ensureCtx();
    const ctx = this.ctx!;
    const notes = [523, 659, 784, 880, 1047];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.25);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.25);
    });
  }

  countdownTick() { this.playSfxTone(440, 'sine', 0.1, 0.15); }
  countdownGo() { this.playSfxTone(880, 'sine', 0.2, 0.2); }

  startDrone() {
    if (this.dronePlaying) return;
    this.ensureCtx();
    const ctx = this.ctx!;
    this.dronePlaying = true;
    const freqs = [55, 82.5, 110];
    const types: OscillatorType[] = ['sine', 'triangle', 'sine'];
    this.droneOscs = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      osc.type = types[i];
      osc.frequency.value = f;
      lfo.type = 'sine';
      lfo.frequency.value = 0.15 + i * 0.05;
      lfoG.gain.value = 0.03;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      g.gain.value = 0.08;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.musicGain!);
      osc.start();
      lfo.start();
      return osc;
    });
  }

  stopDrone() {
    this.droneOscs.forEach(o => { try { o.stop(); } catch {} });
    this.droneOscs = [];
    this.dronePlaying = false;
  }
}

// ─── SEEDED RNG ───────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function dateSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ─── GLOBALS ──────────────────────────────────────────────────
const game = new GameStateManager();
const audio = new AudioManager();
let world: World;
const gemGroups: Group[] = [];
const gridGroup = new Group();
const particles: Particle[] = [];
const raycaster = new Raycaster();
const pointer = new Vector2();
let playTime = 0;
let matchesThisRound = 0;
let recentMatchTimes: number[] = [];
let invalidSwaps = 0;
let modesPlayed = new Set<string>();
let themesUsed = new Set<number>();
let dailyStreak = 0;
let zenGems = 0;
let cascadeScore = 0;
let boardEmpty = false;

// Panel entities
const panelEntities: Record<string, any> = {};

// ─── GEM MESH CREATION ───────────────────────────────────────
function createGemMesh(type: GemType): Group {
  const cfg = GEM_CONFIGS[type];
  const group = new Group();
  const size = 0.07;

  let geo: any;
  switch (cfg.shape) {
    case 'sphere': geo = new SphereGeometry(size, 12, 8); break;
    case 'box': geo = new BoxGeometry(size * 1.5, size * 1.5, size * 1.5); break;
    case 'diamond': geo = new OctahedronGeometry(size * 1.2); break;
    case 'tetra': geo = new TetrahedronGeometry(size * 1.3); break;
    case 'torus': geo = new TorusGeometry(size * 0.9, size * 0.35, 8, 12); break;
    case 'cone': geo = new ConeGeometry(size, size * 2, 8); break;
  }

  const mat = new MeshStandardMaterial({
    color: cfg.color,
    emissive: cfg.emissive,
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.4,
  });
  const mesh = new Mesh(geo, mat);
  group.add(mesh);

  // Wireframe
  const edges = new EdgesGeometry(geo);
  const wireMat = new LineBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.4 });
  const wire = new LineSegments(edges, wireMat);
  group.add(wire);

  // Glow
  const glowGeo = cfg.shape === 'torus'
    ? new SphereGeometry(size * 1.4, 8, 6)
    : new SphereGeometry(size * 1.8, 8, 6);
  const glowMat = new MeshBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: 0.15,
    blending: AdditiveBlending,
  });
  const glow = new Mesh(glowGeo, glowMat);
  group.add(glow);

  return group;
}

// ─── GRID MANAGEMENT ─────────────────────────────────────────
function gridToWorld(row: number, col: number): Vector3 {
  return new Vector3(
    GRID_OFFSET_X + col * CELL_SIZE,
    GRID_OFFSET_Y + row * CELL_SIZE,
    GRID_Z
  );
}

function initGrid(seededRng?: () => number) {
  const rng = seededRng || Math.random;
  // Clear existing
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = game.grid[r]?.[c];
      if (cell?.group) {
        gridGroup.remove(cell.group);
      }
    }
  }

  game.grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    game.grid[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      let type: GemType;
      // Avoid initial matches
      do {
        type = Math.floor(rng() * GEM_COUNT) as GemType;
      } while (
        (c >= 2 && game.grid[r][c - 1]?.type === type && game.grid[r][c - 2]?.type === type) ||
        (r >= 2 && game.grid[r - 1]?.[c]?.type === type && game.grid[r - 2]?.[c]?.type === type)
      );

      const group = createGemMesh(type);
      const pos = gridToWorld(r, c);
      group.position.copy(pos);
      gridGroup.add(group);

      game.grid[r][c] = {
        type,
        mesh: group.children[0] as Mesh,
        glowMesh: group.children[2] as Mesh,
        wireMesh: group.children[1] as LineSegments,
        group,
        row: r,
        col: c,
        targetY: pos.y,
        falling: false,
        matched: false,
        selected: false,
        animScale: 1.0,
        animPhase: (r * GRID_COLS + c) * 0.3,
      };
    }
  }
}

function findMatches(): MatchResult[] {
  const results: MatchResult[] = [];
  const visited = new Set<string>();

  // Horizontal
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS - 2; c++) {
      const t = game.grid[r][c]?.type;
      if (t === undefined) continue;
      let end = c + 1;
      while (end < GRID_COLS && game.grid[r][end]?.type === t) end++;
      const len = end - c;
      if (len >= 3) {
        const cells: [number, number][] = [];
        for (let i = c; i < end; i++) {
          const key = `${r},${i}`;
          if (!visited.has(key)) {
            visited.add(key);
            cells.push([r, i]);
          }
        }
        if (cells.length > 0) {
          results.push({ cells, isSpecial: len >= 4 });
        }
        c = end - 1;
      }
    }
  }

  // Vertical
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS - 2; r++) {
      const t = game.grid[r]?.[c]?.type;
      if (t === undefined) continue;
      let end = r + 1;
      while (end < GRID_ROWS && game.grid[end]?.[c]?.type === t) end++;
      const len = end - r;
      if (len >= 3) {
        const cells: [number, number][] = [];
        for (let i = r; i < end; i++) {
          const key = `${i},${c}`;
          if (!visited.has(key)) {
            visited.add(key);
            cells.push([i, c]);
          }
        }
        if (cells.length > 0) {
          results.push({ cells, isSpecial: len >= 4 });
        }
        r = end - 1;
      }
    }
  }

  return results;
}

function removeMatches(matches: MatchResult[]) {
  let totalGems = 0;
  for (const match of matches) {
    for (const [r, c] of match.cells) {
      const cell = game.grid[r][c];
      if (cell?.group) {
        // Particle burst
        const pos = gridToWorld(r, c);
        const color = GEM_CONFIGS[cell.type].color;
        spawnParticleBurst(pos, color, 8);

        gridGroup.remove(cell.group);
        game.gemsMatched[cell.type]++;
        totalGems++;
      }
      game.grid[r][c] = null;
    }

    // Score
    const basePoints = match.cells.length * 50;
    const comboMult = Math.min(game.combo + 1, 10);
    const cascadeMult = 1 + game.cascadeDepth * 0.5;
    const points = Math.floor(basePoints * comboMult * cascadeMult);
    game.score += points;

    if (match.cells.length >= 5) {
      checkAchievement('match_5');
    }
    if (match.cells.length >= 6) {
      checkAchievement('big_match');
    }
  }

  game.totalMatches += matches.length;
  game.totalGems += totalGems;
  game.lifetimeMatches += matches.length;
  game.lifetimeGems += totalGems;
  matchesThisRound += matches.length;
  recentMatchTimes.push(playTime);

  if (game.totalMatches >= 1) checkAchievement('first_match');
  if (matchesThisRound >= 10) checkAchievement('ten_matches');
  if (game.lifetimeMatches >= 50) checkAchievement('fifty_matches');
  if (game.lifetimeMatches >= 100) checkAchievement('hundred_matches');

  if (matches.length >= 3) checkAchievement('chain_3');

  game.combo++;
  if (game.combo > game.maxCombo) game.maxCombo = game.combo;
  if (game.combo > game.bestCombo) game.bestCombo = game.combo;
  if (game.combo >= 3) checkAchievement('combo_x3');
  if (game.combo >= 5) checkAchievement('combo_x5');
  if (game.combo >= 10) checkAchievement('combo_x10');

  // Score achievements
  if (game.score >= 1000) checkAchievement('score_1k');
  if (game.score >= 5000) checkAchievement('score_5k');
  if (game.score >= 10000) checkAchievement('score_10k');
  if (game.score >= 25000) checkAchievement('score_25k');

  for (let i = 0; i < GEM_COUNT; i++) {
    if (game.gemsMatched[i] >= 20) checkAchievement('clear_color');
  }

  if (game.lifetimeGems >= 500) checkAchievement('total_gems_500');
  if (game.lifetimeGems >= 1000) checkAchievement('total_gems_1000');

  audio.match(game.combo);
}

function applyGravity(): boolean {
  let fell = false;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (game.grid[r][c] === null) {
        // Find gem above
        for (let above = r + 1; above < GRID_ROWS; above++) {
          if (game.grid[above][c] !== null) {
            const cell = game.grid[above][c]!;
            game.grid[r][c] = cell;
            game.grid[above][c] = null;
            cell.row = r;
            cell.targetY = gridToWorld(r, c).y;
            cell.falling = true;
            fell = true;
            break;
          }
        }
      }
    }
  }
  return fell;
}

function refillGrid(): boolean {
  let filled = false;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (game.grid[r][c] === null) {
        const type = Math.floor(Math.random() * GEM_COUNT) as GemType;
        const group = createGemMesh(type);
        const pos = gridToWorld(r, c);
        group.position.set(pos.x, pos.y + CELL_SIZE * 3, pos.z);
        gridGroup.add(group);

        game.grid[r][c] = {
          type,
          mesh: group.children[0] as Mesh,
          glowMesh: group.children[2] as Mesh,
          wireMesh: group.children[1] as LineSegments,
          group,
          row: r,
          col: c,
          targetY: pos.y,
          falling: true,
          matched: false,
          selected: false,
          animScale: 1.0,
          animPhase: Math.random() * 6,
        };
        filled = true;
      }
    }
  }
  return filled;
}

function hasValidMoves(): boolean {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      // Try swap right
      if (c < GRID_COLS - 1) {
        swapCells(r, c, r, c + 1);
        if (findMatches().length > 0) { swapCells(r, c, r, c + 1); return true; }
        swapCells(r, c, r, c + 1);
      }
      // Try swap up
      if (r < GRID_ROWS - 1) {
        swapCells(r, c, r + 1, c);
        if (findMatches().length > 0) { swapCells(r, c, r + 1, c); return true; }
        swapCells(r, c, r + 1, c);
      }
    }
  }
  return false;
}

function swapCells(r1: number, c1: number, r2: number, c2: number) {
  const temp = game.grid[r1][c1];
  game.grid[r1][c1] = game.grid[r2][c2];
  game.grid[r2][c2] = temp;
  if (game.grid[r1][c1]) { game.grid[r1][c1]!.row = r1; game.grid[r1][c1]!.col = c1; }
  if (game.grid[r2][c2]) { game.grid[r2][c2]!.row = r2; game.grid[r2][c2]!.col = c2; }
}

// ─── PARTICLES ────────────────────────────────────────────────
function createParticle(): Particle {
  const geo = new SphereGeometry(0.01, 4, 4);
  const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending });
  const mesh = new Mesh(geo, mat);
  mesh.visible = false;
  world.scene.add(mesh);
  return { mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, active: false };
}

function spawnParticleBurst(pos: Vector3, color: number, count: number) {
  for (let i = 0; i < count; i++) {
    let p = particles.find(p => !p.active);
    if (!p) {
      if (particles.length < 120) {
        p = createParticle();
        particles.push(p);
      } else {
        p = particles[Math.floor(Math.random() * particles.length)];
      }
    }
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.05, pos.y + (Math.random() - 0.5) * 0.05, pos.z);
    (p.mesh.material as MeshBasicMaterial).color.set(color);
    (p.mesh.material as MeshBasicMaterial).opacity = 1.0;
    p.vx = (Math.random() - 0.5) * 2;
    p.vy = (Math.random() - 0.5) * 2 + 1;
    p.vz = (Math.random() - 0.5) * 0.5;
    p.life = 0;
    p.maxLife = 0.4 + Math.random() * 0.3;
  }
}

function updateParticles(dt: number) {
  for (const p of particles) {
    if (!p.active) continue;
    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active = false;
      p.mesh.visible = false;
      continue;
    }
    p.vy -= 3.0 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    (p.mesh.material as MeshBasicMaterial).opacity = 1.0 - p.life / p.maxLife;
  }
}

// ─── ENVIRONMENT ──────────────────────────────────────────────
function createEnvironment(scene: any) {
  const theme = THEMES[game.themeIdx];

  scene.fog = new Fog(theme.fog, 3, 15);
  scene.background = new Color(theme.bg);

  // Grid floor
  const floorGeo = new PlaneGeometry(20, 20, 20, 20);
  const floorMat = new MeshBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.08, wireframe: true });
  const floor = new Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  scene.add(floor);

  // Grid ceiling
  const ceil = floor.clone();
  ceil.position.y = 4;
  ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);

  // Back wall grid
  const wallGeo = new PlaneGeometry(20, 5, 20, 10);
  const wallMat = new MeshBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.04, wireframe: true });
  const wall = new Mesh(wallGeo, wallMat);
  wall.position.set(0, 2, -5);
  scene.add(wall);

  // Lights
  scene.add(new AmbientLight(0x111122, 0.4));
  const dir = new DirectionalLight(0xffffff, 0.3);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  const p1 = new PointLight(theme.grid, 0.8, 8);
  p1.position.set(-1.5, 2, -1);
  scene.add(p1);

  const p2 = new PointLight(theme.accent, 0.6, 8);
  p2.position.set(1.5, 2, -1);
  scene.add(p2);

  const p3 = new PointLight(0xffffff, 0.4, 6);
  p3.position.set(0, 1, -1.5);
  scene.add(p3);

  // Floating decorations
  const decoShapes = [
    new TorusGeometry(0.15, 0.03, 8, 12),
    new BoxGeometry(0.15, 0.15, 0.15),
    new SphereGeometry(0.1, 8, 6),
    new ConeGeometry(0.08, 0.2, 6),
  ];
  for (let i = 0; i < 14; i++) {
    const geo = decoShapes[i % decoShapes.length];
    const mat = new MeshBasicMaterial({ color: i % 2 === 0 ? theme.grid : theme.accent, transparent: true, opacity: 0.12, wireframe: true });
    const m = new Mesh(geo, mat);
    m.position.set((Math.random() - 0.5) * 8, 0.5 + Math.random() * 3, -3 - Math.random() * 4);
    m.userData.rotSpeed = 0.3 + Math.random() * 0.5;
    m.userData.bobSpeed = 0.5 + Math.random() * 0.3;
    m.userData.bobPhase = Math.random() * 6.28;
    m.userData.baseY = m.position.y;
    scene.add(m);
    gemGroups.push(m as any);
  }

  // Ambient particles
  for (let i = 0; i < 40; i++) {
    const geo = new SphereGeometry(0.008, 4, 4);
    const mat = new MeshBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.3, blending: AdditiveBlending });
    const m = new Mesh(geo, mat);
    m.position.set((Math.random() - 0.5) * 6, Math.random() * 3.5, -2 - Math.random() * 5);
    m.userData.drift = (Math.random() - 0.5) * 0.2;
    m.userData.pulse = Math.random() * 6.28;
    scene.add(m);
    gemGroups.push(m as any);
  }

  // Grid board frame
  const frameW = GRID_COLS * CELL_SIZE + 0.1;
  const frameH = GRID_ROWS * CELL_SIZE + 0.1;
  const frameCx = GRID_OFFSET_X + (GRID_COLS - 1) * CELL_SIZE * 0.5;
  const frameCy = GRID_OFFSET_Y + (GRID_ROWS - 1) * CELL_SIZE * 0.5;

  const frameMat = new MeshBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.15 });

  // Top/bottom bars
  for (const dy of [-0.5, 0.5]) {
    const bar = new Mesh(new BoxGeometry(frameW, 0.01, 0.01), frameMat);
    bar.position.set(frameCx, frameCy + dy * frameH, GRID_Z);
    scene.add(bar);
  }
  // Left/right bars
  for (const dx of [-0.5, 0.5]) {
    const bar = new Mesh(new BoxGeometry(0.01, frameH, 0.01), frameMat);
    bar.position.set(frameCx + dx * frameW, frameCy, GRID_Z);
    scene.add(bar);
  }

  scene.add(gridGroup);
}

// ─── ACHIEVEMENT CHECK ────────────────────────────────────────
function checkAchievement(id: string) {
  const a = achievements.find(x => x.id === id);
  if (a && !a.unlocked) {
    a.unlocked = true;
    audio.achievement();
    showToast('Achievement: ' + a.name);
    game.saveState();
  }
}

// ─── UI HELPERS ───────────────────────────────────────────────
const setText = (entity: any, id: string, text: string) => {
  if (!entity) return;
  const doc = entity.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
  if (!doc) return;
  const el = doc.getElementById(id) as UIKit.Text | undefined;
  el?.setProperties({ text });
};

function showPanel(name: string) {
  for (const [key, ent] of Object.entries(panelEntities)) {
    if (!ent?.object3D) continue;
    ent.object3D.visible = (key === name);
  }
}

function showToast(msg: string) {
  const ent = panelEntities['toast'];
  if (!ent) return;
  setText(ent, 'toast-text', msg);
  if (ent.object3D) ent.object3D.visible = true;
  setTimeout(() => { if (ent.object3D) ent.object3D.visible = false; }, 2500);
}

// ─── LEADERBOARD ──────────────────────────────────────────────
function saveScore() {
  try {
    const entries: LeaderboardEntry[] = JSON.parse(localStorage.getItem('neon-gems-lb') || '[]');
    entries.push({
      score: game.score,
      mode: game.mode,
      date: new Date().toLocaleDateString(),
    });
    entries.sort((a, b) => b.score - a.score);
    localStorage.setItem('neon-gems-lb', JSON.stringify(entries.slice(0, 20)));
  } catch {}
}

function getLeaderboard(): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem('neon-gems-lb') || '[]');
  } catch { return []; }
}

// ─── GAME FLOW ────────────────────────────────────────────────
function startGame() {
  game.score = 0;
  game.combo = 0;
  game.maxCombo = 0;
  game.moves = 0;
  game.totalMatches = 0;
  game.totalGems = 0;
  game.cascadeDepth = 0;
  game.selectedCell = null;
  game.swapAnim = null;
  game.processing = false;
  game.phase = 'idle';
  game.gemsMatched = [0, 0, 0, 0, 0, 0];
  playTime = 0;
  matchesThisRound = 0;
  recentMatchTimes = [];
  invalidSwaps = 0;
  zenGems = 0;
  cascadeScore = 0;
  boardEmpty = false;

  modesPlayed.add(game.mode);
  if (modesPlayed.size >= 6) checkAchievement('all_modes');
  themesUsed.add(game.themeIdx);
  if (themesUsed.size >= THEMES.length) checkAchievement('theme_all');

  switch (game.mode) {
    case 'classic':
      game.movesLeft = game.getMoveLimit();
      break;
    case 'timed':
      game.timeLeft = game.getTimeLimit();
      break;
    case 'puzzle':
      game.movesLeft = 15;
      game.puzzleColor = Math.floor(Math.random() * GEM_COUNT);
      game.puzzleTarget = 15;
      break;
    case 'daily':
      game.movesLeft = 25;
      break;
    default:
      game.movesLeft = 999;
      break;
  }

  if (game.mode === 'daily') {
    initGrid(mulberry32(dateSeed()));
  } else {
    initGrid();
  }

  game.countdownValue = 3;
  game.countdownTimer = 0;
  game.state = 'countdown';
  showPanel('countdown');
  setText(panelEntities['countdown'], 'cd-text', '3');
  audio.countdownTick();
  audio.startDrone();
}

function endGame() {
  game.state = 'game_over';
  game.totalGamesPlayed++;
  game.totalScore += game.score;

  const key = game.mode;
  if (!game.bestScores[key] || game.score > game.bestScores[key]) {
    game.bestScores[key] = game.score;
  }

  saveScore();
  game.saveState();

  // Achievement checks
  if (game.totalGamesPlayed >= 10) checkAchievement('games_10');
  if (game.totalGamesPlayed >= 50) checkAchievement('games_50');
  if (game.totalScore >= 50000) checkAchievement('total_score_50k');
  if (game.totalScore >= 100000) checkAchievement('total_score_100k');
  if (game.totalScore >= 1000) checkAchievement('lifetime_1k');
  if (game.mode === 'daily') {
    checkAchievement('daily_done');
    dailyStreak++;
    if (dailyStreak >= 3) checkAchievement('daily_3');
  }
  if (game.mode === 'timed' && game.score >= 5000) checkAchievement('timed_5k');
  if (game.mode === 'zen' && zenGems >= 100) checkAchievement('zen_100');
  if (game.mode === 'classic' && game.score >= game.getTargetScore()) checkAchievement('classic_win');
  if (game.mode === 'classic' && game.movesLeft <= 3 && game.score >= game.getTargetScore()) checkAchievement('comeback');
  if (invalidSwaps === 0 && game.moves >= 10) checkAchievement('no_miss');
  if (game.mode === 'puzzle' && game.gemsMatched[game.puzzleColor] >= game.puzzleTarget) checkAchievement('puzzle_win');
  if (playTime >= 300) checkAchievement('endurance');
  if (cascadeScore >= 100) checkAchievement('lucky_cascade');

  // 3 matches in 5 seconds
  const now = playTime;
  const recent = recentMatchTimes.filter(t => now - t < 5);
  if (recent.length >= 3) checkAchievement('fast_match');

  showPanel('gameover');
  updateGameOverPanel();
  audio.gameOver();
  audio.stopDrone();
}

function updateGameOverPanel() {
  const ent = panelEntities['gameover'];
  if (!ent) return;
  const won = game.mode === 'classic' ? game.score >= game.getTargetScore() : true;
  setText(ent, 'go-title', won ? 'WELL DONE!' : 'GAME OVER');
  setText(ent, 'go-score', 'Score: ' + game.score);
  setText(ent, 'go-matches', 'Matches: ' + game.totalMatches);
  setText(ent, 'go-gems', 'Gems: ' + game.totalGems);
  setText(ent, 'go-combo', 'Best Combo: x' + game.maxCombo);
  setText(ent, 'go-moves', 'Moves: ' + game.moves);
  setText(ent, 'go-mode', game.mode.toUpperCase());

  const bestKey = game.mode;
  const best = game.bestScores[bestKey] || 0;
  setText(ent, 'go-best', game.score >= best ? 'NEW BEST!' : 'Best: ' + best);
}

function updateHUD() {
  const ent = panelEntities['hud'];
  if (!ent) return;
  setText(ent, 'hud-score', '' + game.score);
  setText(ent, 'hud-combo', game.combo > 1 ? 'x' + game.combo : '');
  setText(ent, 'hud-mode', game.mode.toUpperCase());

  switch (game.mode) {
    case 'classic':
    case 'puzzle':
    case 'daily':
      setText(ent, 'hud-info', 'Moves: ' + game.movesLeft);
      break;
    case 'timed':
      setText(ent, 'hud-info', 'Time: ' + Math.ceil(game.timeLeft) + 's');
      break;
    case 'zen':
      setText(ent, 'hud-info', 'Gems: ' + zenGems);
      break;
    case 'endless':
      setText(ent, 'hud-info', 'Matches: ' + game.totalMatches);
      break;
  }

  if (game.mode === 'puzzle') {
    const cfg = GEM_CONFIGS[game.puzzleColor];
    setText(ent, 'hud-target', cfg.name + ': ' + game.gemsMatched[game.puzzleColor] + '/' + game.puzzleTarget);
  } else {
    setText(ent, 'hud-target', '');
  }
}

// ─── INPUT HANDLING ───────────────────────────────────────────
function handleGemClick(row: number, col: number) {
  if (game.state !== 'playing' || game.processing) return;

  if (game.selectedCell === null) {
    // Select first gem
    game.selectedCell = [row, col];
    const cell = game.grid[row][col];
    if (cell) {
      cell.selected = true;
      audio.select();
    }
  } else {
    const [sr, sc] = game.selectedCell;
    const dr = Math.abs(row - sr);
    const dc = Math.abs(col - sc);

    // Deselect if same cell
    if (sr === row && sc === col) {
      const cell = game.grid[sr][sc];
      if (cell) cell.selected = false;
      game.selectedCell = null;
      return;
    }

    // Check adjacency
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      // Attempt swap
      const cell1 = game.grid[sr][sc];
      if (cell1) cell1.selected = false;

      game.swapAnim = {
        r1: sr, c1: sc, r2: row, c2: col,
        progress: 0,
        startPos1: gridToWorld(sr, sc),
        startPos2: gridToWorld(row, col),
        endPos1: gridToWorld(row, col),
        endPos2: gridToWorld(sr, sc),
        reverting: false,
      };
      game.phase = 'swapping';
      game.processing = true;
      audio.swap();
    } else {
      // Not adjacent — select new gem
      const cell1 = game.grid[sr][sc];
      if (cell1) cell1.selected = false;
      game.selectedCell = [row, col];
      const cell2 = game.grid[row][col];
      if (cell2) cell2.selected = true;
      audio.select();
    }
  }
}

function getClickedGem(x: number, y: number): [number, number] | null {
  pointer.set(x, y);
  raycaster.setFromCamera(pointer, world.camera);

  let closest: [number, number] | null = null;
  let closestDist = Infinity;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = game.grid[r]?.[c];
      if (!cell?.group) continue;
      const intersects = raycaster.intersectObject(cell.group, true);
      if (intersects.length > 0 && intersects[0].distance < closestDist) {
        closestDist = intersects[0].distance;
        closest = [r, c];
      }
    }
  }
  return closest;
}

// ─── MAIN SYSTEM ──────────────────────────────────────────────

export class GameSystem extends createSystem({
  title: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
  modeSelect: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modeselect.json')] },
  difficulty: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/difficulty.json')] },
  hud: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  countdown: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/countdown.json')] },
  pause: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  gameover: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
  leaderboard: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
  achievementPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
  settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  help: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
  toast: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
  stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  skins: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/skins.json')] },
}) {
  init() {
    this.bindPanel('title', this.queries.title);
    this.bindPanel('modeSelect', this.queries.modeSelect);
    this.bindPanel('difficulty', this.queries.difficulty);
    this.bindPanel('hud', this.queries.hud);
    this.bindPanel('countdown', this.queries.countdown);
    this.bindPanel('pause', this.queries.pause);
    this.bindPanel('gameover', this.queries.gameover);
    this.bindPanel('leaderboard', this.queries.leaderboard);
    this.bindPanel('achievementPanel', this.queries.achievementPanel);
    this.bindPanel('settings', this.queries.settings);
    this.bindPanel('help', this.queries.help);
    this.bindPanel('toast', this.queries.toast);
    this.bindPanel('stats', this.queries.stats);
    this.bindPanel('skins', this.queries.skins);
  }

  private bindPanel(name: string, query: any) {
    query.subscribe('qualify', (entity: any) => {
      panelEntities[name] = entity;
      const doc = entity.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
      if (!doc) return;

      switch (name) {
        case 'title':
          this.bindButton(doc, 'btn-play', () => { game.state = 'mode_select'; showPanel('modeSelect'); audio.click(); });
          this.bindButton(doc, 'btn-scores', () => { game.state = 'leaderboard'; showPanel('leaderboard'); this.updateLeaderboard(); audio.click(); });
          this.bindButton(doc, 'btn-achieve', () => { game.state = 'achievements'; showPanel('achievementPanel'); this.updateAchievements(); audio.click(); });
          this.bindButton(doc, 'btn-stats', () => { game.state = 'stats'; showPanel('stats'); this.updateStats(); audio.click(); });
          this.bindButton(doc, 'btn-skins', () => { game.state = 'skins'; showPanel('skins'); this.updateSkins(); audio.click(); });
          this.bindButton(doc, 'btn-settings', () => { game.state = 'settings'; showPanel('settings'); this.updateSettings(); audio.click(); });
          this.bindButton(doc, 'btn-help', () => { game.state = 'help'; showPanel('help'); audio.click(); });
          break;

        case 'modeSelect':
          this.bindButton(doc, 'btn-classic', () => { game.mode = 'classic'; game.state = 'difficulty'; showPanel('difficulty'); audio.click(); });
          this.bindButton(doc, 'btn-timed', () => { game.mode = 'timed'; game.state = 'difficulty'; showPanel('difficulty'); audio.click(); });
          this.bindButton(doc, 'btn-zen', () => { game.mode = 'zen'; game.state = 'difficulty'; showPanel('difficulty'); audio.click(); });
          this.bindButton(doc, 'btn-endless', () => { game.mode = 'endless'; game.state = 'difficulty'; showPanel('difficulty'); audio.click(); });
          this.bindButton(doc, 'btn-daily', () => { game.mode = 'daily'; game.difficulty = 'medium'; startGame(); audio.click(); });
          this.bindButton(doc, 'btn-puzzle', () => { game.mode = 'puzzle'; game.state = 'difficulty'; showPanel('difficulty'); audio.click(); });
          this.bindButton(doc, 'btn-ms-back', () => { game.state = 'title'; showPanel('title'); audio.click(); });
          break;

        case 'difficulty':
          this.bindButton(doc, 'btn-easy', () => { game.difficulty = 'easy'; startGame(); audio.click(); });
          this.bindButton(doc, 'btn-medium', () => { game.difficulty = 'medium'; startGame(); audio.click(); });
          this.bindButton(doc, 'btn-hard', () => { game.difficulty = 'hard'; startGame(); audio.click(); });
          this.bindButton(doc, 'btn-diff-back', () => { game.state = 'mode_select'; showPanel('modeSelect'); audio.click(); });
          break;

        case 'pause':
          this.bindButton(doc, 'btn-resume', () => { game.state = 'playing'; showPanel('hud'); audio.click(); });
          this.bindButton(doc, 'btn-quit', () => { game.state = 'title'; showPanel('title'); audio.stopDrone(); audio.click(); });
          break;

        case 'gameover':
          this.bindButton(doc, 'btn-rematch', () => { startGame(); audio.click(); });
          this.bindButton(doc, 'btn-menu', () => { game.state = 'title'; showPanel('title'); audio.click(); });
          break;

        case 'leaderboard':
        case 'achievementPanel':
        case 'help':
        case 'stats':
        case 'skins':
          this.bindButton(doc, 'btn-back', () => { game.state = 'title'; showPanel('title'); audio.click(); });
          break;

        case 'settings':
          this.bindButton(doc, 'btn-set-back', () => { game.state = 'title'; showPanel('title'); game.saveState(); audio.click(); });
          this.bindButton(doc, 'btn-master-up', () => { game.masterVol = Math.min(1, game.masterVol + 0.1); audio.setVolumes(game.masterVol, game.sfxVol, game.musicVol); this.updateSettings(); });
          this.bindButton(doc, 'btn-master-dn', () => { game.masterVol = Math.max(0, game.masterVol - 0.1); audio.setVolumes(game.masterVol, game.sfxVol, game.musicVol); this.updateSettings(); });
          this.bindButton(doc, 'btn-sfx-up', () => { game.sfxVol = Math.min(1, game.sfxVol + 0.1); audio.setVolumes(game.masterVol, game.sfxVol, game.musicVol); this.updateSettings(); });
          this.bindButton(doc, 'btn-sfx-dn', () => { game.sfxVol = Math.max(0, game.sfxVol - 0.1); audio.setVolumes(game.masterVol, game.sfxVol, game.musicVol); this.updateSettings(); });
          this.bindButton(doc, 'btn-music-up', () => { game.musicVol = Math.min(1, game.musicVol + 0.1); audio.setVolumes(game.masterVol, game.sfxVol, game.musicVol); this.updateSettings(); });
          this.bindButton(doc, 'btn-music-dn', () => { game.musicVol = Math.max(0, game.musicVol - 0.1); audio.setVolumes(game.masterVol, game.sfxVol, game.musicVol); this.updateSettings(); });
          this.bindButton(doc, 'btn-theme-prev', () => { game.themeIdx = (game.themeIdx + THEMES.length - 1) % THEMES.length; this.updateSettings(); audio.click(); });
          this.bindButton(doc, 'btn-theme-next', () => { game.themeIdx = (game.themeIdx + 1) % THEMES.length; this.updateSettings(); audio.click(); });
          break;
      }

      // Default visibility
      if (name === 'title') {
        if (entity.object3D) entity.object3D.visible = true;
      } else if (name === 'toast') {
        if (entity.object3D) entity.object3D.visible = false;
      } else {
        if (entity.object3D) entity.object3D.visible = false;
      }
    });
  }

  private bindButton(doc: UIKitDocument, id: string, handler: () => void) {
    const el = doc.getElementById(id) as UIKit.Text | undefined;
    el?.addEventListener('click', handler);
  }

  update(delta: number, time: number) {
    // Countdown
    if (game.state === 'countdown') {
      game.countdownTimer += delta;
      if (game.countdownTimer >= 1.0) {
        game.countdownTimer = 0;
        game.countdownValue--;
        if (game.countdownValue <= 0) {
          game.state = 'playing';
          showPanel('hud');
          audio.countdownGo();
          audio.gameStart();
        } else {
          setText(panelEntities['countdown'], 'cd-text', '' + game.countdownValue);
          audio.countdownTick();
        }
      }
    }

    // Playing
    if (game.state === 'playing') {
      playTime += delta;

      // Timer mode
      if (game.mode === 'timed') {
        game.timeLeft -= delta;
        if (game.timeLeft <= 0) {
          game.timeLeft = 0;
          endGame();
          return;
        }
      }

      // Process grid states
      this.processGrid(delta);

      // Browser input
      if (!game.processing) {
        if ((this.input as any).keyboard?.getKeyDown('Escape') || (this.input as any).keyboard?.getKeyDown('KeyP')) {
          game.state = 'paused';
          showPanel('pause');
          return;
        }
      }

      // XR input
      const rightGp = (this.input as any).xr?.gamepads?.right;
      if (rightGp) {
        if (rightGp.getButtonDown(InputComponent.B_Button)) {
          game.state = 'paused';
          showPanel('pause');
          return;
        }
      }

      updateHUD();
    }

    // Animate gems
    this.animateGems(delta, time);
    updateParticles(delta);

    // Animate decorations
    for (const g of gemGroups) {
      if (g.userData.rotSpeed) {
        g.rotation.y += g.userData.rotSpeed * delta;
        g.rotation.x += g.userData.rotSpeed * 0.3 * delta;
      }
      if (g.userData.bobSpeed) {
        g.position.y = g.userData.baseY + Math.sin(time * g.userData.bobSpeed + g.userData.bobPhase) * 0.1;
      }
      if (g.userData.drift !== undefined) {
        g.position.x += g.userData.drift * delta;
        if (g.userData.pulse !== undefined) {
          ((g as any).material as any).opacity = 0.15 + Math.sin(time * 2 + g.userData.pulse) * 0.1;
        }
      }
    }
  }

  private processGrid(delta: number) {
    switch (game.phase) {
      case 'swapping':
        if (game.swapAnim) {
          game.swapAnim.progress += delta * SWAP_SPEED;
          const t = Math.min(game.swapAnim.progress, 1);

          const cell1 = game.grid[game.swapAnim.r1]?.[game.swapAnim.c1];
          const cell2 = game.grid[game.swapAnim.r2]?.[game.swapAnim.c2];

          if (cell1?.group) {
            cell1.group.position.lerpVectors(game.swapAnim.startPos1, game.swapAnim.endPos1, t);
          }
          if (cell2?.group) {
            cell2.group.position.lerpVectors(game.swapAnim.startPos2, game.swapAnim.endPos2, t);
          }

          if (t >= 1) {
            if (!game.swapAnim.reverting) {
              // Swap cells in grid
              swapCells(game.swapAnim.r1, game.swapAnim.c1, game.swapAnim.r2, game.swapAnim.c2);
              const matches = findMatches();
              if (matches.length > 0) {
                // Valid swap
                game.moves++;
                if (game.mode === 'classic' || game.mode === 'puzzle' || game.mode === 'daily') {
                  game.movesLeft--;
                }
                game.combo = 0;
                game.cascadeDepth = 0;
                removeMatches(matches);
                game.swapAnim = null;
                game.phase = 'matching';
                game.processTimer = MATCH_DELAY;
                game.selectedCell = null;
              } else {
                // Invalid swap — revert
                swapCells(game.swapAnim.r1, game.swapAnim.c1, game.swapAnim.r2, game.swapAnim.c2);
                game.swapAnim.reverting = true;
                game.swapAnim.progress = 0;
                const tmp1 = game.swapAnim.startPos1;
                game.swapAnim.startPos1 = game.swapAnim.endPos1;
                game.swapAnim.endPos1 = tmp1;
                const tmp2 = game.swapAnim.startPos2;
                game.swapAnim.startPos2 = game.swapAnim.endPos2;
                game.swapAnim.endPos2 = tmp2;
                audio.invalid();
                invalidSwaps++;
              }
            } else {
              // Revert complete
              game.swapAnim = null;
              game.phase = 'idle';
              game.processing = false;
              game.selectedCell = null;
            }
          }
        }
        break;

      case 'matching':
        game.processTimer -= delta;
        if (game.processTimer <= 0) {
          const fell = applyGravity();
          if (fell) {
            game.phase = 'falling';
          } else {
            refillGrid();
            game.phase = 'refilling';
            game.processTimer = REFILL_DELAY;
          }
        }
        break;

      case 'falling':
        {
          let allSettled = true;
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const cell = game.grid[r][c];
              if (cell?.falling && cell.group) {
                const dy = cell.targetY - cell.group.position.y;
                if (Math.abs(dy) < 0.005) {
                  cell.group.position.y = cell.targetY;
                  cell.falling = false;
                } else {
                  cell.group.position.y += Math.sign(dy) * FALL_SPEED * delta;
                  allSettled = false;
                }
              }
            }
          }
          if (allSettled) {
            refillGrid();
            game.phase = 'refilling';
            game.processTimer = REFILL_DELAY;
          }
        }
        break;

      case 'refilling':
        {
          game.processTimer -= delta;
          let allSettled = true;
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const cell = game.grid[r][c];
              if (cell?.falling && cell.group) {
                const dy = cell.targetY - cell.group.position.y;
                if (Math.abs(dy) < 0.005) {
                  cell.group.position.y = cell.targetY;
                  cell.falling = false;
                } else {
                  cell.group.position.y += Math.sign(dy) * FALL_SPEED * delta;
                  allSettled = false;
                }
              }
            }
          }
          if (allSettled && game.processTimer <= 0) {
            // Check for cascade matches
            const matches = findMatches();
            if (matches.length > 0) {
              game.cascadeDepth++;
              if (game.cascadeDepth >= 3) checkAchievement('cascade_3');
              if (game.cascadeDepth >= 5) checkAchievement('cascade_5');
              const beforeScore = game.score;
              removeMatches(matches);
              cascadeScore += game.score - beforeScore;
              audio.cascade(game.cascadeDepth);
              game.phase = 'matching';
              game.processTimer = MATCH_DELAY;
            } else {
              // Done processing
              game.phase = 'idle';
              game.processing = false;
              game.combo = 0;

              if (game.mode === 'zen') {
                zenGems = game.totalGems;
              }

              // Check board empty
              let empty = true;
              for (let r = 0; r < GRID_ROWS && empty; r++) {
                for (let c = 0; c < GRID_COLS && empty; c++) {
                  if (game.grid[r][c]) empty = false;
                }
              }
              if (empty) {
                checkAchievement('perfect_clear');
                boardEmpty = true;
              }

              // Check game over conditions
              if (game.mode !== 'zen') {
                if ((game.mode === 'classic' || game.mode === 'puzzle' || game.mode === 'daily') && game.movesLeft <= 0) {
                  endGame();
                  return;
                }
                if (game.mode === 'endless' && !hasValidMoves()) {
                  endGame();
                  return;
                }
              }
            }
          }
        }
        break;
    }
  }

  private animateGems(delta: number, time: number) {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = game.grid[r]?.[c];
        if (!cell?.group) continue;

        // Rotation
        cell.group.rotation.y = Math.sin(time * 0.8 + cell.animPhase) * 0.15;

        // Selection highlight
        if (cell.selected) {
          const s = 1.0 + Math.sin(time * 6) * 0.15;
          cell.group.scale.setScalar(s);
          if (cell.glowMesh) {
            (cell.glowMesh.material as MeshBasicMaterial).opacity = 0.3 + Math.sin(time * 8) * 0.1;
          }
        } else {
          cell.group.scale.setScalar(1.0);
          if (cell.glowMesh) {
            (cell.glowMesh.material as MeshBasicMaterial).opacity = 0.15;
          }
        }
      }
    }
  }

  private updateLeaderboard() {
    const ent = panelEntities['leaderboard'];
    if (!ent) return;
    const entries = getLeaderboard();
    for (let i = 0; i < 10; i++) {
      const e = entries[i];
      setText(ent, 'lb-rank-' + i, e ? '#' + (i + 1) : '');
      setText(ent, 'lb-score-' + i, e ? '' + e.score : '');
      setText(ent, 'lb-mode-' + i, e ? e.mode : '');
      setText(ent, 'lb-date-' + i, e ? e.date : '');
    }
  }

  private updateAchievements() {
    const ent = panelEntities['achievementPanel'];
    if (!ent) return;
    const count = achievements.filter(a => a.unlocked).length;
    setText(ent, 'ach-count', count + ' / ' + achievements.length);
    for (let i = 0; i < 15 && i < achievements.length; i++) {
      const a = achievements[i];
      setText(ent, 'ach-' + i, (a.unlocked ? '[x] ' : '[ ] ') + a.name + ' - ' + a.desc);
    }
  }

  private updateStats() {
    const ent = panelEntities['stats'];
    if (!ent) return;
    setText(ent, 'stat-games', 'Games: ' + game.totalGamesPlayed);
    setText(ent, 'stat-score', 'Total Score: ' + game.totalScore);
    setText(ent, 'stat-best', 'Best Score: ' + Math.max(0, ...Object.values(game.bestScores)));
    setText(ent, 'stat-combo', 'Best Combo: x' + game.bestCombo);
    setText(ent, 'stat-matches', 'Matches: ' + game.lifetimeMatches);
    setText(ent, 'stat-gems', 'Gems: ' + game.lifetimeGems);
    setText(ent, 'stat-cascades', 'Cascades: ' + game.totalCascades);
    const achCount = achievements.filter(a => a.unlocked).length;
    setText(ent, 'stat-achieve', 'Achievements: ' + achCount + '/' + achievements.length);
  }

  private updateSkins() {
    const ent = panelEntities['skins'];
    if (!ent) return;
    for (let i = 0; i < GEM_SKINS.length; i++) {
      const s = GEM_SKINS[i];
      const status = i === game.skinIdx ? '(ON)' : '';
      setText(ent, 'skin-' + i, s.name + ' ' + status);
      setText(ent, 'skin-info-' + i, s.unlock === 'default' ? 'Default' : 'Unlock: ' + s.unlock);
    }
  }

  private updateSettings() {
    const ent = panelEntities['settings'];
    if (!ent) return;
    setText(ent, 'set-master', 'Master: ' + Math.round(game.masterVol * 100) + '%');
    setText(ent, 'set-sfx', 'SFX: ' + Math.round(game.sfxVol * 100) + '%');
    setText(ent, 'set-music', 'Music: ' + Math.round(game.musicVol * 100) + '%');
    setText(ent, 'set-theme', 'Theme: ' + THEMES[game.themeIdx].name);
  }
}

// ─── MOUSE INPUT ──────────────────────────────────────────────
function setupMouseInput(canvas: HTMLElement) {
  canvas.addEventListener('click', (e: MouseEvent) => {
    if (game.state === 'playing' && !game.processing) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const gem = getClickedGem(x, y);
      if (gem) handleGemClick(gem[0], gem[1]);
    }
  });
}

// ─── INIT ─────────────────────────────────────────────────────
async function main() {
  const container = document.getElementById('app') as HTMLDivElement;

  world = await World.create(container, {
    xr: { offer: 'once' },
    input: { canvasPointerEvents: true },
    render: {
      defaultLighting: false,
    },
    features: {
      locomotion: false,
      grabbing: false,
      physics: false,
    },
  } as any);

  createEnvironment(world.scene);

  // Create UI panels
  const panelConfigs: { config: string; follower: boolean; screenSpace: boolean }[] = [
    { config: './ui/title.json', follower: false, screenSpace: false },
    { config: './ui/modeselect.json', follower: false, screenSpace: false },
    { config: './ui/difficulty.json', follower: false, screenSpace: false },
    { config: './ui/hud.json', follower: true, screenSpace: false },
    { config: './ui/countdown.json', follower: true, screenSpace: false },
    { config: './ui/pause.json', follower: false, screenSpace: false },
    { config: './ui/gameover.json', follower: false, screenSpace: false },
    { config: './ui/leaderboard.json', follower: false, screenSpace: false },
    { config: './ui/achievements.json', follower: false, screenSpace: false },
    { config: './ui/settings.json', follower: false, screenSpace: false },
    { config: './ui/help.json', follower: false, screenSpace: false },
    { config: './ui/toast.json', follower: true, screenSpace: false },
    { config: './ui/stats.json', follower: false, screenSpace: false },
    { config: './ui/skins.json', follower: false, screenSpace: false },
  ];

  for (const pc of panelConfigs) {
    const entity = world.createTransformEntity();
    entity.addComponent(PanelUI, { config: pc.config });
    if (pc.follower) {
      entity.addComponent(Follower, {
        target: world.player,
        offsetPosition: [0, pc.config.includes('toast') ? -0.3 : 0, -0.8] as [number, number, number],
      });
    } else {
      const obj = entity.object3D;
      if (obj) {
        obj.position.set(0, 1.4, -2.2);
      }
    }
  }

  world.registerSystem(GameSystem);

  // Mouse input
  const canvas = container.querySelector('canvas');
  if (canvas) setupMouseInput(canvas);

  // Delayed canvas listener setup
  setTimeout(() => {
    const c = container.querySelector('canvas');
    if (c && !canvas) setupMouseInput(c);
  }, 2000);
}

main().catch(console.error);
