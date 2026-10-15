/* JOSH — Echoes of the Shattered World
   Full game engine with Kenney CC0 assets, polished platformer physics,
   8 realms, NPC dialogue, quests, particles, and audio.
*/

const CANVAS_W = 960;
const CANVAS_H = 640;
const TILE = 18;
const GRAVITY = 0.75;
const MAX_FALL = 18;
const GROUND_FRICTION = 0.82;
const AIR_FRICTION = 0.955;
const ACCEL = 1.1;
const MAX_SPEED = 5.5;
const JUMP_FORCE = -14;
const DOUBLE_JUMP_FORCE = -12.5;
const COYOTE_TIME = 0.09;
const JUMP_BUFFER = 0.09;

const STATE_MENU = 0;
const STATE_PLAYING = 1;
const STATE_DIALOGUE = 2;
const STATE_VICTORY = 3;
const STATE_LEVEL_TRANSITION = 4;

const FRAGMENTS_PER_LEVEL = 3;
const NUM_LEVELS = 8;

let canvas, ctx;
let game;
let keys = {};
let justPressed = {};
let camera = { x: 0, y: 0 };
let sprites = {};
let audioCtx = null;
let audioEnabled = false;
let lastTime = 0;

// ── Audio ──────────────────────────────────────────────────────────
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx) audioEnabled = true;
}
function playTone(freq, type, duration, vol, start) {
  if (!audioEnabled || !audioCtx) return;
  const t = audioCtx.currentTime + (start || 0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol || 0.07, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}
const sfx = {
  jump: () => { playTone(200, 'square', 0.1, 0.06); playTone(300, 'square', 0.08, 0.05, 0.05); },
  doubleJump: () => { playTone(400, 'triangle', 0.12, 0.05); playTone(600, 'triangle', 0.1, 0.04, 0.07); },
  land: () => { playTone(120, 'sawtooth', 0.06, 0.07); playTone(180, 'sawtooth', 0.05, 0.04, 0.04); },
  collect: () => { playTone(900, 'sine', 0.08, 0.06); playTone(1100, 'sine', 0.07, 0.05, 0.05); },
  talk: () => { playTone(220, 'sine', 0.05, 0.03); playTone(280, 'sine', 0.05, 0.03, 0.06); },
  death: () => { playTone(100, 'sawtooth', 0.3, 0.08); playTone(75, 'sawtooth', 0.4, 0.05, 0.15); },
  win: () => { [440, 554, 659, 880].forEach((f, i) => playTone(f, 'square', 0.2, 0.05, i * 0.12)); },
  levelStart: () => { playTone(280, 'square', 0.12, 0.05); playTone(440, 'square', 0.12, 0.05, 0.12); playTone(600, 'square', 0.25, 0.06, 0.24); },
};

// ── Asset loading ──────────────────────────────────────────────────
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load: ' + path));
    img.src = path;
  });
}

async function loadAllAssets() {
  const base = 'assets';
  // Player: 8-frame run cycle (characters tile_0000-0007)
  sprites.player = [];
  for (let i = 0; i < 8; i++) {
    sprites.player.push(await loadImage(`${base}/characters/tile_${String(i).padStart(4, '0')}.png`));
  }
  // Enemy: 3 frames (characters tile_0008-0010)
  sprites.enemy = [];
  for (let i = 8; i <= 10; i++) {
    sprites.enemy.push(await loadImage(`${base}/characters/tile_${String(i).padStart(4, '0')}.png`));
  }
  // NPC
  sprites.npc = await loadImage(`${base}/characters/tile_0000.png`);
  // Ground/platform tiles
  sprites.platform = await loadImage(`${base}/tiles/tile_0000.png`);
  sprites.platformAlt = await loadImage(`${base}/tiles/tile_0030.png`);
  sprites.platformAlt2 = await loadImage(`${base}/tiles/tile_0060.png`);
  // Hazards
  sprites.spike = await loadImage(`${base}/tiles/tile_0015.png`);
  sprites.lava = await loadImage(`${base}/tiles/tile_0090.png`);
  // Collectible fragment
  sprites.fragment = await loadImage(`${base}/tiles/tile_0165.png`);
  // Checkpoint
  sprites.checkpoint = await loadImage(`${base}/tiles/tile_0045.png`);
  // Exit portal
  sprites.exit = await loadImage(`${base}/tiles/tile_0150.png`);
  // Backgrounds for realms (tileable 24x24)
  sprites.bgSky = await loadImage(`${base}/backgrounds/tile_0000.png`);
  sprites.bgCloud = await loadImage(`${base}/backgrounds/tile_0008.png`);
  sprites.bgOrange = await loadImage(`${base}/backgrounds/tile_0004.png`);
  sprites.bgGreen = await loadImage(`${base}/backgrounds/tile_0014.png`);
  sprites.bgDark = await loadImage(`${base}/backgrounds/tile_0020.png`);
  sprites.bgWhite = await loadImage(`${base}/backgrounds/tile_0016.png`);
}

// ── Particles ──────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 5;
    this.vy = (Math.random() - 0.5) * 5 - 1;
    this.life = 1;
    this.color = color;
    this.size = 3 + Math.random() * 3;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2;
    this.life -= 0.05;
  }
  draw(ctx, cam) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - cam.x, this.y - cam.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}
let particles = [];
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

// ── Entities ───────────────────────────────────────────────────────
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.dead = false;
    this.remove = false;
  }
  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }
  collidesWith(other) {
    return this.left < other.right && this.right > other.left && this.top < other.bottom && this.bottom > other.top;
  }
  update() {}
  draw(ctx, cam) {}
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 16, 22);
    this.dir = 1;
    this.jumps = 0;
    this.maxJumps = 2;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.invuln = 0;
    this.dead = false;
    this.frame = 0;
    this.frameTimer = 0;
    this.jumpPressed = false;
  }
  update(level) {
    if (this.dead) {
      this.vy += GRAVITY;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
      this.y += this.vy;
      if (this.y > level.height + 200) this.kill();
      return;
    }
    this.onGround = false;

    // coyote time
    if (this.onGround) this.coyote = COYOTE_TIME;
    else this.coyote = Math.max(0, this.coyote - (1 / 60));

    // jump buffer
    if (this.jumpBuffer > 0) this.jumpBuffer -= (1 / 60);

    // horizontal input
    let ax = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) { ax = -ACCEL; this.dir = -1; }
    if (keys['ArrowRight'] || keys['KeyD']) { ax = ACCEL; this.dir = 1; }
    this.vx += ax;
    this.vx *= (this.onGround ? GROUND_FRICTION : AIR_FRICTION);
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
    if (this.vx > MAX_SPEED) this.vx = MAX_SPEED;
    if (this.vx < -MAX_SPEED) this.vx = -MAX_SPEED;

    // gravity
    if (!this.onGround) {
      this.vy += GRAVITY;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    }

    // jump input
    if ((keys['ArrowUp'] || keys['KeyW'] || keys['Space']) && !this.jumpPressed) {
      this.jumpPressed = true;
      this.jumpBuffer = JUMP_BUFFER;
    } else if (!(keys['ArrowUp'] || keys['KeyW'] || keys['Space'])) {
      this.jumpPressed = false;
    }

    // execute buffered jump
    if (this.jumpBuffer > 0) {
      if (this.coyote > 0 || this.onGround) {
        this.vy = JUMP_FORCE;
        this.jumps = 1;
        this.coyote = 0;
        this.jumpBuffer = 0;
        sfx.jump();
        spawnParticles(this.x + this.w / 2, this.y + this.h, '#b8d4ff', 6);
      } else if (this.jumps < this.maxJumps) {
        this.vy = DOUBLE_JUMP_FORCE;
        this.jumps++;
        this.jumpBuffer = 0;
        sfx.doubleJump();
        spawnParticles(this.x + this.w / 2, this.y + this.h, '#a78bfa', 8);
      }
    }

    // variable jump height
    if (this.vy < 0 && !(keys['ArrowUp'] || keys['KeyW'] || keys['Space'])) {
      this.vy *= 0.85;
    }

    // reset jumps on ground
    const wasOnGround = this.onGround;
    this.x += this.vx;
    this.resolveX(level);
    this.y += this.vy;
    this.resolveY(level);

    if (this.onGround && !wasOnGround) {
      this.jumps = 0;
      sfx.land();
      spawnParticles(this.x + this.w / 2, this.y + this.h, '#8a734a', 5);
    }

    // level bounds
    if (this.y > level.height + 150) this.kill();

    // animation
    this.frameTimer += (1 / 60);
    if (this.onGround && Math.abs(this.vx) > 0.5) {
      if (this.frameTimer > 0.08) { this.frame = (this.frame + 1) % 8; this.frameTimer = 0; }
    } else {
      this.frame = 0;
      this.frameTimer = 0;
    }

    if (this.invuln > 0) this.invuln -= (1 / 60);
  }
  resolveX(level) {
    const r = { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h };
    for (const p of level.platforms) {
      if (rectsOverlap(r, p)) {
        if (this.vx > 0) this.x = p.left - this.w;
        else if (this.vx < 0) this.x = p.right;
        this.vx = 0;
      }
    }
  }
  resolveY(level) {
    const r = { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h };
    for (const p of level.platforms) {
      if (rectsOverlap(r, p)) {
        if (this.vy > 0) {
          this.y = p.top - this.h;
          this.onGround = true;
        } else if (this.vy < 0) {
          this.y = p.bottom;
        }
        this.vy = 0;
      }
    }
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    sfx.death();
    spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#ff6b6b', 14);
  }
  draw(ctx, cam) {
    if (this.dead && this.invuln <= 0) return;
    if (this.invuln > 0 && Math.floor(Date.now() / 80) % 2) return;
    const img = sprites.player[this.frame];
    ctx.save();
    if (this.dir < 0) { ctx.scale(-1, 1); ctx.drawImage(img, -this.x + cam.x - this.w, this.y - cam.y, this.w, this.h); }
    else ctx.drawImage(img, this.x - cam.x, this.y - cam.y, this.w, this.h);
    ctx.restore();
  }
}

class Enemy extends Entity {
  constructor(x, y, range, speed) {
    super(x, y, 20, 20);
    this.startX = x;
    this.range = range;
    this.speed = speed;
    this.dir = 1;
    this.frame = 0;
    this.frameTimer = 0;
  }
  update(level) {
    this.x += this.dir * this.speed;
    const r = { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h };
    let hitWall = false;
    for (const p of level.platforms) {
      if (rectsOverlap(r, p)) { hitWall = true; break; }
    }
    if (this.x < this.startX || this.x > this.startX + this.range || hitWall) {
      this.dir *= -1;
      this.x += this.dir * 2;
    }
    this.frameTimer += (1 / 60);
    if (this.frameTimer > 0.15) { this.frame = (this.frame + 1) % sprites.enemy.length; this.frameTimer = 0; }
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const img = sprites.enemy[this.frame];
    ctx.save();
    if (this.dir < 0) { ctx.scale(-1, 1); ctx.drawImage(img, -this.x + cam.x - this.w, this.y - cam.y, this.w, this.h); }
    else ctx.drawImage(img, this.x - cam.x, this.y - cam.y, this.w, this.h);
    ctx.restore();
  }
}

class NPC extends Entity {
  constructor(x, y, name, dialogue, questId) {
    super(x, y, 20, 24);
    this.name = name;
    this.dialogue = dialogue;
    this.questId = questId;
    this.talked = false;
  }
  draw(ctx, cam) {
    ctx.drawImage(sprites.npc, this.x - cam.x, this.y - cam.y, this.w, this.h);
    if (this.talked) {
      ctx.fillStyle = '#f0d16a';
      ctx.beginPath();
      ctx.arc(this.x + 10 - cam.x, this.y - 8 - cam.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class Collectible extends Entity {
  constructor(x, y) {
    super(x, y, 14, 14);
    this.baseY = y;
    this.floatOff = Math.random() * Math.PI * 2;
  }
  update() {
    this.y = this.baseY + Math.sin(Date.now() / 300 + this.floatOff) * 6;
  }
  draw(ctx, cam) {
    if (this.remove) return;
    ctx.drawImage(sprites.fragment, this.x - cam.x, this.y - cam.y - 2, this.w, this.h);
  }
}

class Spike extends Entity {
  constructor(x, y) { super(x, y, TILE, TILE); }
  draw(ctx, cam) {
    ctx.drawImage(sprites.spike, this.x - cam.x, this.y - cam.y, TILE, TILE);
  }
}

class Lava extends Entity {
  constructor(x, y) { super(x, y, TILE, TILE); }
  draw(ctx, cam) {
    ctx.drawImage(sprites.lava, this.x - cam.x, this.y - cam.y, TILE, TILE);
  }
}

class Platform {
  constructor(x, y, w, h, type = 'ground') {
    this.x = x; this.y = y; this.w = w; this.h = h; this.type = type;
  }
  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }
  draw(ctx, cam) {
    let img = sprites.platform;
    if (this.type === 'alt') img = sprites.platformAlt;
    else if (this.type === 'alt2') img = sprites.platformAlt2;
    ctx.drawImage(img, this.x - cam.x, this.y - cam.y, this.w, this.h);
  }
}

class Exit extends Entity {
  constructor(x, y) { super(x, y, 24, 36); this.active = false; this.pulse = 0; }
  draw(ctx, cam) {
    this.pulse += 0.05;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.pulse);
    if (!this.active) {
      ctx.fillStyle = 'rgba(167, 139, 250, 0.35)';
      ctx.fillRect(this.x - cam.x, this.y - cam.y, this.w, this.h);
      ctx.fillStyle = '#a78bfa';
      ctx.font = '12px monospace';
      ctx.fillText('??', this.x - cam.x + 6, this.y - cam.y + 20);
    } else {
      ctx.drawImage(sprites.exit, this.x - cam.x, this.y - cam.y, this.w, this.h);
    }
    ctx.restore();
  }
}

class Checkpoint extends Entity {
  constructor(x, y) { super(x, y, TILE, TILE); this.active = false; }
  draw(ctx, cam) {
    ctx.drawImage(sprites.checkpoint, this.x - cam.x, this.y - cam.y, TILE, TILE);
    if (this.active) {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(this.x + 9 - cam.x, this.y - 6 - cam.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// ── Game ───────────────────────────────────────────────────────────
class Game {
  constructor() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    this.state = STATE_MENU;
    this.levelIndex = 0;
    this.fragments = 0;
    this.deaths = 0;
    this.player = null;
    this.level = null;
    this.entities = [];
    this.exit = null;
    this.dialogue = { active: false, name: '', lines: [], index: 0, npc: null, onComplete: null };
    this.ui = null;
  }
  bindInput() {
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      justPressed[e.code] = true;
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    document.getElementById('btnStart').onclick = () => { initAudio(); this.startLevel(0); };
    document.getElementById('btnControls').onclick = () => { this.showMenu('controls'); };
    document.getElementById('btnBack').onclick = () => { this.showMenu('start'); };
    document.getElementById('btnRetry').onclick = () => { this.restartLevel(); };
    document.getElementById('btnMainMenu').onclick = () => { this.showMenu('start'); };
    document.getElementById('btnPlayAgain').onclick = () => { this.resetGame(); this.showMenu('start'); };
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyQ') this.ui.toggleQuestLog();
      if (e.code === 'KeyR' && this.state === STATE_PLAYING) this.restartLevel();
    });
  }
  async startLevel(index) {
    this.state = STATE_LEVEL_TRANSITION;
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.fragments = 0;
    this.player = new Player(this.level.playerStart.x, this.level.playerStart.y);
    this.entities = [];
    this.exit = new Exit(this.level.exit.x, this.level.exit.y);
    this.exit.active = false;
    this.dialogue.active = false;
    particles = [];
    this.ui.updateHUD();
    if (this.ui) this.ui.hideDialogue();
    setTimeout(() => {
      this.state = STATE_PLAYING;
      this.setupLevelEntities();
      sfx.levelStart();
    }, 700);
  }
  setupLevelEntities() {
    this.entities = [];
    for (const p of this.level.platforms) this.entities.push(new Platform(p.x, p.y, p.w, p.h, p.type || 'ground'));
    for (const s of (this.level.spikes || [])) this.entities.push(new Spike(s.x, s.y));
    for (const l of (this.level.lava || [])) this.entities.push(new Lava(l.x, l.y));
    for (const e of (this.level.enemies || [])) this.entities.push(new Enemy(e.x, e.y, e.range || 80, e.speed || 1.5));
    for (const c of (this.level.fragments || [])) {
      const col = new Collectible(c.x, c.y);
      col.onCollect = () => this.collectFragment();
      this.entities.push(col);
    }
    for (const n of (this.level.npcs || [])) {
      const npc = new NPC(n.x, n.y, n.name, n.dialogue, n.quest);
      this.entities.push(npc);
    }
    for (const cp of (this.level.checkpoints || [])) {
      this.entities.push(new Checkpoint(cp.x, cp.y));
    }
  }
  collectFragment() {
    this.fragments++;
    sfx.collect();
    spawnParticles(this.player.x + 8, this.player.y, '#f0d16a', 10);
    if (this.ui) this.ui.updateHUD();
    this.checkExit();
    if (this.fragments >= FRAGMENTS_PER_LEVEL) {
      (this.level.quests || []).forEach(q => { if (!q.done) this.completeQuest(q.id); });
    }
  }
  checkExit() {
    if (this.fragments >= FRAGMENTS_PER_LEVEL) this.exit.active = true;
  }
  completeQuest(questId) {
    const q = (this.level.quests || []).find(q => q.id === questId);
    if (q && !q.done) {
      q.done = true;
      this.addToast(`Quest complete: ${q.title}`);
    }
  }
  addToast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 2500);
  }
  restartLevel() {
    this.deaths++;
    if (this.ui) this.ui.updateHUD();
    this.startLevel(this.levelIndex);
  }
  resetGame() {
    this.levelIndex = 0;
    this.fragments = 0;
    this.deaths = 0;
    if (this.ui) this.ui.updateHUD();
  }
  playerDies() {
    this.player.kill();
    this.deaths++;
    if (this.ui) this.ui.updateHUD();
    setTimeout(() => this.restartLevel(), 700);
  }
  openDialogue(npc) {
    if (this.state !== STATE_PLAYING) return;
    this.state = STATE_DIALOGUE;
    this.dialogue.active = true;
    this.dialogue.npc = npc;
    this.dialogue.name = npc.name;
    this.dialogue.lines = [...npc.dialogue];
    this.dialogue.index = 0;
    npc.talked = true;
    if (this.ui) this.ui.showDialogue(this.dialogue);
    sfx.talk();
  }
  advanceDialogue() {
    if (!this.dialogue.active) return;
    this.dialogue.index++;
    if (this.dialogue.index >= this.dialogue.lines.length) {
      this.dialogue.active = false;
      if (this.ui) this.ui.hideDialogue();
      this.state = STATE_PLAYING;
      if (this.dialogue.onComplete) this.dialogue.onComplete();
      this.dialogue.onComplete = null;
      this.dialogue.npc = null;
    } else {
      if (this.ui) this.ui.showDialogue(this.dialogue);
      sfx.talk();
    }
  }
  victory() {
    this.state = STATE_VICTORY;
    sfx.win();
    if (this.ui) this.ui.showMenu('victory');
  }
  update() {
    justPressed = {};
    if (this.state === STATE_PLAYING || this.state === STATE_DIALOGUE) {
      this.player.update(this.level);
      for (const e of this.entities) {
        if (e instanceof Platform || e instanceof Spike || e instanceof Lava || e instanceof Checkpoint) continue;
        e.update(this.level);
      }
      updateParticles();
      this.checkCollisions();
      this.updateCamera();
    }
  }
  checkCollisions() {
    const p = this.player;
    if (p.dead) return;
    for (const e of this.entities) {
      if (e instanceof Collectible && !e.remove && p.collidesWith(e)) {
        e.remove = true;
        e.onCollect();
      }
    }
    if (this.exit && this.exit.active && p.collidesWith(this.exit)) {
      this.nextLevel();
    }
    const hurt = () => this.playerDies();
    for (const e of this.entities) {
      if (e instanceof Enemy && p.collidesWith(e)) {
        if (p.vy > 0 && p.bottom - 6 <= e.top + 4) {
          e.dead = true;
          p.vy = JUMP_FORCE * 0.7;
          p.jumps = 0;
          spawnParticles(e.x + 10, e.y, '#7a2e2e', 8);
          sfx.collect();
        } else {
          hurt();
        }
      }
      if ((e instanceof Spike || e instanceof Lava) && p.collidesWith(e)) hurt();
    }
    if (justPressed['KeyE']) {
      for (const e of this.entities) {
        if (e instanceof NPC && p.collidesWith(e)) { this.openDialogue(e); break; }
      }
    }
  }
  updateCamera() {
    const p = this.player;
    let tx = p.x - CANVAS_W / 2 + p.w / 2;
    let ty = p.y - CANVAS_H / 2 + p.h / 2;
    tx = Math.max(0, Math.min(tx, this.level.width - CANVAS_W));
    ty = Math.max(0, Math.min(ty, this.level.height - CANVAS_H));
    camera.x += (tx - camera.x) * 0.1;
    camera.y += (ty - camera.y) * 0.1;
  }
  nextLevel() {
    if (this.levelIndex < NUM_LEVELS - 1) {
      this.state = STATE_LEVEL_TRANSITION;
      if (this.ui) this.ui.hideDialogue();
      setTimeout(() => this.startLevel(this.levelIndex + 1), 900);
    } else {
      this.victory();
    }
  }
  draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (this.level) {
      ctx.fillStyle = this.level.skyTop || '#6fa8dc';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      this.drawBackground(ctx);
      for (const e of this.entities) {
        if (e instanceof Platform || e instanceof Spike || e instanceof Lava) e.draw(ctx, camera);
      }
      if (this.exit) this.exit.draw(ctx, camera);
      for (const e of this.entities) {
        if (e instanceof Checkpoint) e.draw(ctx, camera);
      }
      this.player.draw(ctx, camera);
      for (const e of this.entities) {
        if (!(e instanceof Platform || e instanceof Spike || e instanceof Lava || e instanceof Checkpoint)) e.draw(ctx, camera);
      }
      for (const p of particles) p.draw(ctx, camera);
      ctx.restore();
    }
    this.ui.draw();
  }
  drawBackground(ctx) {
    const bg = this.level.bgTile || sprites.bgSky;
    const bw = 24, bh = 24;
    const startX = Math.floor(camera.x / bw) - 1;
    const endX = Math.floor((camera.x + CANVAS_W) / bw) + 1;
    const startY = Math.floor(camera.y / bh) - 1;
    const endY = Math.floor((camera.y + CANVAS_H) / bh) + 1;
    for (let gy = startY; gy <= endY; gy++) {
      for (let gx = startX; gx <= endX; gx++) {
        ctx.drawImage(bg, gx * bw - camera.x, gy * bh - camera.y, bw, bh);
      }
    }
  }
  loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    this.update();
    this.draw();
    requestAnimationFrame(t => this.loop(t));
  }
  start() { lastTime = performance.now(); requestAnimationFrame(t => this.loop(t)); }
}

// ── UI ─────────────────────────────────────────────────────────────
class UI {
  constructor() {
    this.fragEl = document.getElementById('fragCount');
    this.worldEl = document.getElementById('worldName');
    this.deathEl = document.getElementById('deathCount');
    this.dialogueEl = document.getElementById('dialogue');
    this.dNameEl = document.getElementById('dialogueName');
    this.dTextEl = document.getElementById('dialogueText');
    this.questLogEl = document.getElementById('questLog');
    this.questListEl = document.getElementById('questLogList');
    this.questOpen = false;
  }
  updateHUD() {
    this.fragEl.textContent = `${game.fragments}/${FRAGMENTS_PER_LEVEL}`;
    this.deathEl.textContent = game.deaths;
    this.worldEl.textContent = (game.level && game.level.name) || '—';
  }
  showDialogue(d) {
    this.dNameEl.textContent = d.name;
    this.dTextEl.textContent = d.lines[d.index];
    this.dialogueEl.classList.remove('hidden');
  }
  hideDialogue() { this.dialogueEl.classList.add('hidden'); }
  showMenu(name) {
    ['startMenu', 'controlsMenu', 'gameOverMenu', 'victoryMenu'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById('overlay').classList.remove('hidden');
    const el = document.getElementById(name + 'Menu');
    if (el) el.classList.remove('hidden');
  }
  toggleQuestLog() {
    if (game.state === STATE_MENU) return;
    this.questOpen = !this.questOpen;
    this.questLogEl.classList.toggle('hidden', !this.questOpen);
    if (this.questOpen) this.refreshQuestLog();
  }
  refreshQuestLog() {
    if (!game.level || !game.level.quests) { this.questListEl.innerHTML = '<div style="color:#888">No quests.</div>'; return; }
    let html = '';
    for (const q of game.level.quests) {
      html += `<div class="quest ${q.done ? 'done' : ''}"><div class="qname">${q.title}</div><div class="qdesc">${q.desc}</div></div>`;
    }
    this.questListEl.innerHTML = html || '<div style="color:#888">No quests.</div>';
  }
  draw() {
    this.updateHUD();
  }
}

// ── Boot ───────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadAllAssets();
  game = new Game();
  game.ui = new UI();
  game.start();
});
