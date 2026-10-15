/* JOSH — Echoes of the Shattered World
   Main game engine: loop, input, physics, audio, sprite generation, state machine.
*/

const CANVAS_W = 960;
const CANVAS_H = 640;
const GRAVITY = 0.8;
const GROUND_FRICTION = 0.84;
const AIR_FRICTION = 0.965;
const ACCEL = 1.05;
const MAX_SPEED = 6;
const JUMP_FORCE = -15;
const DOUBLE_JUMP_FORCE = -13.5;
const WALL_SLIDE_MAX = 2.2;
const WALL_JUMP_X = 9;
const WALL_JUMP_Y = -13.5;

const STATE_MENU = 0;
const STATE_PLAYING = 1;
const STATE_DIALOGUE = 2;
const STATE_GAMEOVER = 3;
const STATE_VICTORY = 4;
const STATE_LEVEL_TRANSITION = 5;

const FRAGMENTS_PER_LEVEL = 3;
const NUM_LEVELS = 5;

let canvas, ctx;
let game;
let keys = {};
let camera = { x: 0, y: 0 };
let sprites = {};
let audioCtx = null;
let audioEnabled = false;

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
  gain.gain.setValueAtTime(vol || 0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

const sfx = {
  jump: () => { playTone(220, 'square', 0.12, 0.06); playTone(330, 'square', 0.08, 0.04, 0.06); },
  doubleJump: () => { playTone(420, 'triangle', 0.14, 0.05); playTone(640, 'triangle', 0.1, 0.04, 0.08); },
  land: () => { playTone(130, 'sawtooth', 0.07, 0.07); playTone(190, 'sawtooth', 0.06, 0.04, 0.04); },
  collect: () => { playTone(950, 'sine', 0.1, 0.06); playTone(1150, 'sine', 0.08, 0.05, 0.05); },
  talk: () => { playTone(220, 'sine', 0.05, 0.03); playTone(290, 'sine', 0.05, 0.03, 0.06); },
  death: () => { playTone(120, 'sawtooth', 0.35, 0.08); playTone(95, 'sawtooth', 0.3, 0.06, 0.15); playTone(75, 'sawtooth', 0.5, 0.05, 0.3); },
  win: () => { [440, 554, 659, 880].forEach((f, i) => playTone(f, 'square', 0.25, 0.05, i * 0.15)); },
  levelStart: () => { playTone(300, 'square', 0.14, 0.05); playTone(460, 'square', 0.14, 0.05, 0.14); playTone(620, 'square', 0.3, 0.06, 0.28); }
};

function createSprite(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  draw(cx, w, h);
  return c;
}

function generateSprites() {
  const skin = '#ffd47a';
  const hair = '#3a2f4a';
  const cloth = '#5b8cff';
  const accent = '#f0d16a';

  // Player: Josh, a small echo creature
  sprites.player = createSprite(30, 36, (cx, w, h) => {
    // body
    cx.fillStyle = cloth;
    cx.fillRect(6, 14, 18, 14);
    // head
    cx.fillStyle = skin;
    cx.fillRect(8, 2, 14, 14);
    // hair
    cx.fillStyle = hair;
    cx.fillRect(7, 0, 16, 6);
    // legs
    cx.fillStyle = '#2a2240';
    cx.fillRect(4, 26, 10, 8);
    cx.fillRect(16, 26, 10, 8);
    // tail
    cx.fillStyle = cloth;
    cx.fillRect(-2, 12, 8, 10);
    // eyes
    cx.fillStyle = '#222';
    cx.fillRect(11, 6, 4, 4);
    cx.fillRect(15, 6, 4, 4);
    cx.fillStyle = '#fff';
    cx.fillRect(12, 7, 2, 2);
    cx.fillRect(16, 7, 2, 2);
    // mouth
    cx.fillStyle = '#e06a6a';
    cx.fillRect(12, 20, 6, 2);
  });

  // Fragment (collectible)
  sprites.fragment = createSprite(24, 24, (cx, w, h) => {
    const grad = cx.createRadialGradient(12, 12, 2, 12, 12, 12);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#ffd700');
    cx.fillStyle = grad;
    cx.beginPath();
    cx.arc(12, 12, 11, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = '#ff8c00';
    cx.lineWidth = 2;
    cx.stroke();
    cx.fillStyle = '#fff';
    cx.fillRect(10, 4, 4, 10);
    cx.fillRect(10, 10, 4, 2);
  });

  // Exit portal
  sprites.exit = createSprite(40, 56, (cx, w, h) => {
    cx.fillStyle = '#2a2a40';
    cx.fillRect(14, 8, 12, 40);
    cx.fillStyle = '#6a5aff';
    cx.beginPath();
    cx.arc(20, 20, 10, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#a78bfa';
    cx.beginPath();
    cx.arc(20, 20, 6, 0, Math.PI * 2);
    cx.fill();
  });

  // Platform / ground tile
  sprites.platform = createSprite(40, 40, (cx, w, h) => {
    cx.fillStyle = '#5c6a42';
    cx.fillRect(0, 0, 40, 40);
    cx.fillStyle = '#4a5634';
    cx.fillRect(0, 34, 40, 6);
    cx.strokeStyle = '#3a4226';
    cx.lineWidth = 2;
    cx.strokeRect(2, 2, 36, 30);
    cx.fillStyle = '#7aa05a';
    cx.fillRect(6, 6, 8, 6);
    cx.fillRect(26, 10, 6, 6);
    cx.fillRect(14, 20, 6, 6);
  });

  // Floating platform variant
  sprites.fplatform = createSprite(40, 14, (cx, w, h) => {
    cx.fillStyle = '#6b7a50';
    cx.fillRect(2, 2, 36, 10);
    cx.fillStyle = '#55623c';
    cx.fillRect(2, 10, 36, 4);
    cx.strokeStyle = '#444e2f';
    cx.lineWidth = 2;
    cx.strokeRect(4, 4, 32, 6);
  });

  // Spike hazard
  sprites.spike = createSprite(40, 40, (cx, w, h) => {
    cx.fillStyle = '#555';
    cx.beginPath();
    cx.moveTo(0, 40); cx.lineTo(20, 0); cx.lineTo(40, 40); cx.closePath();
    cx.fill();
    cx.fillStyle = '#888';
    cx.beginPath();
    cx.moveTo(10, 40); cx.lineTo(20, 14); cx.lineTo(30, 40); cx.closePath();
    cx.fill();
  });

  // Lava
  sprites.lava = createSprite(40, 40, (cx, w, h) => {
    cx.fillStyle = '#2a1000';
    cx.fillRect(0, 0, 40, 40);
    cx.fillStyle = '#ff4500';
    cx.beginPath();
    cx.arc(12, 32, 10, 0, Math.PI * 2);
    cx.arc(28, 36, 10, 0, Math.PI * 2);
    cx.arc(20, 28, 10, 0, Math.PI * 2);
    cx.fill();
  });

  // Enemy: slug
  sprites.enemy = createSprite(34, 22, (cx, w, h) => {
    cx.fillStyle = '#7a2e2e';
    cx.beginPath();
    cx.ellipse(17, 12, 16, 9, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#5a1e1e';
    cx.beginPath();
    cx.ellipse(22, 10, 8, 6, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#333';
    cx.fillRect(24, 7, 4, 4);
  });

  // NPC
  sprites.npc = createSprite(30, 36, (cx, w, h) => {
    cx.fillStyle = '#8a7a55';
    cx.fillRect(6, 14, 18, 14);
    cx.fillStyle = skin;
    cx.fillRect(9, 2, 12, 14);
    cx.fillStyle = '#5a4a35';
    cx.fillRect(7, 0, 16, 6);
    cx.fillStyle = '#2a2240';
    cx.fillRect(5, 26, 10, 8);
    cx.fillRect(15, 26, 10, 8);
    cx.fillStyle = '#222';
    cx.fillRect(12, 6, 3, 3);
    cx.fillRect(15, 6, 3, 3);
    cx.fillStyle = '#e0c78a';
    cx.fillRect(12, 18, 6, 2);
    cx.strokeStyle = '#6a5a3a';
    cx.lineWidth = 2;
    cx.strokeRect(8, 14, 14, 12);
  });

  // Checkpoint flag
  sprites.checkpoint = createSprite(16, 40, (cx, w, h) => {
    cx.fillStyle = '#333';
    cx.fillRect(7, 0, 2, 40);
    cx.fillStyle = '#e04a4a';
    cx.fillRect(9, 4, 7, 10);
    cx.fillStyle = '#fff';
    cx.fillRect(9, 14, 2, 2);
  });
}

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4 - 1;
    this.life = 1;
    this.color = color;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15;
    this.life -= 0.04;
  }
  draw(ctx, cam) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - cam.x, this.y - cam.y, 4, 4);
    ctx.globalAlpha = 1;
  }
}

class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.dead = false;
    this.remove = false;
  }
  get rect() { return { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h }; }
  collidesWith(other) {
    const a = this.rect, b = other.rect;
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  update() {}
  draw(ctx, cam) {}
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 22, 32);
    this.dir = 1;
    this.jumps = 0;
    this.maxJumps = 2;
    this.wallDir = 0;
    this.wallSlide = false;
    this.invuln = 0;
    this.dead = false;
  }
  update(level) {
    if (this.dead) return;
    const grounded = this.onGround;
    // horizontal input
    let ax = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) { ax = -ACCEL; this.dir = -1; }
    if (keys['ArrowRight'] || keys['KeyD']) { ax = ACCEL; this.dir = 1; }
    this.vx += ax;
    // friction
    this.vx *= (grounded ? GROUND_FRICTION : AIR_FRICTION);
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
    // cap speed
    if (this.vx > MAX_SPEED) this.vx = MAX_SPEED;
    if (this.vx < -MAX_SPEED) this.vx = -MAX_SPEED;
    // gravity
    if (!grounded) this.vy += GRAVITY;
    if (this.vy > 20) this.vy = 20;

    // wall slide / jump
    this.wallDir = 0;
    this.wallSlide = false;
    if (!grounded && Math.abs(this.vx) > 0.5) {
      const probe = (this.dir > 0) ? { x: this.x + this.w + 2, y: this.y + 2, w: 2, h: this.h - 4 }
                                   : { x: this.x - 2, y: this.y + 2, w: 2, h: this.h - 4 };
      for (const p of level.platforms) {
        if (rectsOverlap(probe, p)) {
          this.wallDir = this.dir;
          this.wallSlide = true;
          if (this.vy > 0) this.vy = WALL_SLIDE_MAX;
          break;
        }
      }
    }

    // jump
    if (keys['ArrowUp'] || keys['KeyW'] || keys['Space']) {
      if (!this.jumpPressed) {
        this.jumpPressed = true;
        if (grounded) {
          this.vy = JUMP_FORCE;
          this.jumps = 1;
          sfx.jump();
        } else if (this.wallSlide) {
          this.vx = -this.wallDir * WALL_JUMP_X;
          this.vy = WALL_JUMP_Y;
          this.jumps = 1;
          sfx.jump();
        } else if (this.jumps < this.maxJumps) {
          this.vy = DOUBLE_JUMP_FORCE;
          this.jumps++;
          sfx.doubleJump();
          spawnParticles(this.x + this.w / 2, this.y + this.h, '#a78bfa', 6);
        }
      }
    } else {
      this.jumpPressed = false;
    }
    if (this.vy < 0 && !(keys['ArrowUp'] || keys['KeyW'] || keys['Space'])) {
      this.vy *= 0.8; // variable jump height
    }

    // apply motion
    this.x += this.vx;
    this.resolveX(level);
    this.y += this.vy;
    this.onGround = false;
    this.resolveY(level);

    // level bounds
    if (this.y > level.height + 200) this.kill();

    if (this.invuln > 0) this.invuln--;
  }
  resolveX(level) {
    const r = this.rect;
    for (const p of level.platforms) {
      if (rectsOverlap(r, p)) {
        if (this.vx > 0) { this.x = p.left - this.w; }
        else if (this.vx < 0) { this.x = p.right; }
        this.vx = 0;
      }
    }
  }
  resolveY(level) {
    const r = this.rect;
    for (const p of level.platforms) {
      if (rectsOverlap(r, p)) {
        if (this.vy > 0) {
          this.y = p.top - this.h;
          this.onGround = true;
          this.jumps = 0;
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
    if (this.dead) return;
    if (this.invuln > 0 && Math.floor(Date.now() / 60) % 2) return;
    ctx.drawImage(sprites.player, this.x - cam.x, this.y - cam.y);
  }
}

class Enemy extends Entity {
  constructor(x, y, range, speed) {
    super(x, y, 30, 18);
    this.startX = x;
    this.range = range;
    this.speed = speed;
    this.dir = 1;
  }
  update(level) {
    this.x += this.dir * this.speed;
    if (this.x < this.startX || this.x > this.startX + this.range) this.dir *= -1;
    const r = this.rect;
    for (const p of level.platforms) {
      if (rectsOverlap(r, p)) {
        this.dir *= -1;
        this.x += this.dir * 2;
        break;
      }
    }
  }
  draw(ctx, cam) {
    if (this.dead) return;
    ctx.save();
    if (this.dir < 0) { ctx.scale(-1, 1); ctx.drawImage(sprites.enemy, -this.x + cam.x - this.w, this.y - cam.y); }
    else ctx.drawImage(sprites.enemy, this.x - cam.x, this.y - cam.y);
    ctx.restore();
  }
}

class NPC extends Entity {
  constructor(x, y, name, dialogue, quest) {
    super(x, y, 26, 34);
    this.name = name;
    this.dialogue = dialogue;
    this.quest = quest;
    this.talked = false;
  }
  draw(ctx, cam) {
    ctx.drawImage(sprites.npc, this.x - cam.x, this.y - cam.y);
    if (this.talked && this.quest && !this.quest.done) {
      ctx.fillStyle = '#f0d16a';
      ctx.beginPath();
      ctx.arc(this.x + 13 - cam.x, this.y - 10 - cam.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class Collectible extends Entity {
  constructor(x, y, type) {
    super(x, y, 18, 18);
    this.type = type;
    this.floatOff = Math.random() * Math.PI * 2;
    this.baseY = y;
  }
  update() {
    this.y = this.baseY + Math.sin(Date.now() / 300 + this.floatOff) * 8;
  }
  draw(ctx, cam) {
    if (this.remove) return;
    ctx.drawImage(sprites.fragment, this.x - cam.x, this.y - cam.y - 2);
  }
}

class Spike extends Entity {
  constructor(x, y) { super(x, y, 40, 40); }
  draw(ctx, cam) {
    ctx.drawImage(sprites.spike, this.x - cam.x, this.y - cam.y);
  }
}

class Lava extends Entity {
  constructor(x, y) { super(x, y, 40, 40); }
  draw(ctx, cam) {
    ctx.drawImage(sprites.lava, this.x - cam.x, this.y - cam.y);
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
    const img = this.type === 'float' ? sprites.fplatform : sprites.platform;
    ctx.drawImage(img, this.x - cam.x, this.y - cam.y, this.w, this.h);
  }
}

class Exit extends Entity {
  constructor(x, y) { super(x, y, 32, 48); this.active = false; }
  draw(ctx, cam) {
    if (!this.active) {
      ctx.fillStyle = 'rgba(106,85,255,0.35)';
      ctx.fillRect(this.x - cam.x, this.y - cam.y, this.w, this.h);
      ctx.fillStyle = '#a78bfa';
      ctx.font = '12px monospace';
      ctx.fillText('??', this.x - cam.x + 8, this.y - cam.y + 26);
      return;
    }
    ctx.drawImage(sprites.exit, this.x - cam.x, this.y - cam.y);
  }
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
    this.ui = new UI();
    this.save = { worlds: {}, deaths: 0 };
    this.transitionTimer = 0;
    this.bindInput();
    generateSprites();
    this.ui.showMenu('start');
  }
  bindInput() {
    window.addEventListener('keydown', e => { keys[e.code] = true; });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    document.getElementById('btnStart').onclick = () => { initAudio(); this.startLevel(0); };
    document.getElementById('btnControls').onclick = () => { this.ui.showMenu('controls'); };
    document.getElementById('btnBack').onclick = () => { this.ui.showMenu('start'); };
    document.getElementById('btnRetry').onclick = () => { this.restartLevel(); };
    document.getElementById('btnMainMenu').onclick = () => { this.ui.showMenu('start'); };
    document.getElementById('btnPlayAgain').onclick = () => { this.resetGame(); this.ui.showMenu('start'); };
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyQ') this.ui.toggleQuestLog();
      if ((e.code === 'KeyR') && (this.state === STATE_PLAYING)) this.restartLevel();
    });
  }
  startLevel(index) {
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
    this.ui.hideDialogue();
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
    for (const e of (this.level.enemies || [])) this.entities.push(new Enemy(e.x, e.y, e.range || 80, e.speed || 1.6));
    for (const c of (this.level.fragments || [])) {
      const col = new Collectible(c.x, c.y, 'fragment');
      col.onCollect = () => this.collectFragment();
      this.entities.push(col);
    }
    for (const n of (this.level.npcs || [])) {
      this.entities.push(new NPC(n.x, n.y, n.name, n.dialogue, n.quest));
    }
  }
  collectFragment() {
    this.fragments++;
    sfx.collect();
    spawnParticles(this.player.x + 11, this.player.y, '#f0d16a', 10);
    this.ui.updateHUD();
    this.checkExit();
    if (this.fragments >= FRAGMENTS_PER_LEVEL) {
      (this.level.quests || []).forEach(q => { if (!q.done) this.completeQuest(q.id); });
    }
  }
  checkExit() {
    if (this.fragments >= FRAGMENTS_PER_LEVEL) this.exit.active = true;
  }
  restartLevel() {
    this.deaths++;
    this.ui.updateHUD();
    this.startLevel(this.levelIndex);
  }
  resetGame() {
    this.levelIndex = 0;
    this.fragments = 0;
    this.deaths = 0;
    this.ui.updateHUD();
  }
  playerDies() {
    this.player.kill();
    this.deaths++;
    this.ui.updateHUD();
    setTimeout(() => this.restartLevel(), 800);
  }
  openDialogue(npc) {
    if (this.state !== STATE_PLAYING) return;
    this.state = STATE_DIALOGUE;
    this.dialogue.active = true;
    this.dialogue.npc = npc;
    this.dialogue.name = npc.name;
    this.dialogue.lines = [...npc.dialogue];
    this.dialogue.index = 0;
    this.dialogue.onComplete = npc.onDialogueComplete ? npc.onDialogueComplete.bind(null, npc, this) : null;
    npc.talked = true;
    this.ui.showDialogue(this.dialogue);
    sfx.talk();
  }
  advanceDialogue() {
    if (!this.dialogue.active) return;
    this.dialogue.index++;
    if (this.dialogue.index >= this.dialogue.lines.length) {
      this.dialogue.active = false;
      this.ui.hideDialogue();
      this.state = STATE_PLAYING;
      if (this.dialogue.onComplete) this.dialogue.onComplete();
      this.dialogue.onComplete = null;
      this.dialogue.npc = null;
    } else {
      this.ui.showDialogue(this.dialogue);
      sfx.talk();
    }
  }
  completeQuest(questId) {
    const w = this.level;
    if (!w.quests) return;
    const q = w.quests.find(q => q.id === questId);
    if (q && !q.done) {
      q.done = true;
      this.ui.addToast(`Quest complete: ${q.title}`);
    }
  }
  victory() {
    this.state = STATE_VICTORY;
    sfx.win();
    this.ui.showMenu('victory');
  }
  update(dt) {
    if (this.state === STATE_PLAYING || this.state === STATE_DIALOGUE) {
      this.player.update(this.level);
      for (const e of this.entities) {
        if (e instanceof Platform) continue;
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
    // fragments
    for (const e of this.entities) {
      if (e instanceof Collectible && !e.remove && p.collidesWith(e)) {
        e.remove = true;
        e.onCollect();
      }
    }
    // exit
    if (this.exit && this.exit.active && p.collidesWith(this.exit)) {
      this.nextLevel();
    }
    // enemies & hazards
    const hurt = () => this.playerDies();
    for (const e of this.entities) {
      if (e instanceof Enemy && p.collidesWith(e)) {
        // stomp
        if (p.vy > 0 && p.rect.bottom - 6 <= e.rect.top + 4) {
          e.dead = true;
          p.vy = JUMP_FORCE * 0.75;
          this.player.jumps = 0;
          spawnParticles(e.x + 15, e.y, '#7a2e2e', 8);
          sfx.collect();
        } else {
          hurt();
        }
      }
      if ((e instanceof Spike || e instanceof Lava) && p.collidesWith(e)) hurt();
    }
    // npcs
    if ((keys['KeyE'] && !this.ePressed)) {
      for (const e of this.entities) {
        if (e instanceof NPC && p.collidesWith(e)) { this.openDialogue(e); break; }
      }
    }
    this.ePressed = keys['KeyE'];
  }
  updateCamera() {
    const p = this.player;
    let tx = p.x - CANVAS_W / 2 + p.w / 2;
    let ty = p.y - CANVAS_H / 2 + p.h / 2;
    tx = Math.max(0, Math.min(tx, this.level.width - CANVAS_W));
    ty = Math.max(0, Math.min(ty, this.level.height - CANVAS_H));
    camera.x += (tx - camera.x) * 0.12;
    camera.y += (ty - camera.y) * 0.12;
  }
  nextLevel() {
    if (this.levelIndex < NUM_LEVELS - 1) {
      this.state = STATE_LEVEL_TRANSITION;
      this.ui.hideDialogue();
      setTimeout(() => this.startLevel(this.levelIndex + 1), 900);
    } else {
      this.victory();
    }
  }
  draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (this.level) {
      // background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, this.level.skyTop || '#6fa8dc');
      grad.addColorStop(1, this.level.skyBot || '#2d4a6a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      // draw platforms / static env
      for (const e of this.entities) {
        if (e instanceof Platform || e instanceof Spike || e instanceof Lava) e.draw(ctx, camera);
      }
      // exit
      if (this.exit) this.exit.draw(ctx, camera);
      // dynamic entities
      this.player.draw(ctx, camera);
      for (const e of this.entities) {
        if (!(e instanceof Platform || e instanceof Spike || e instanceof Lava)) e.draw(ctx, camera);
      }
      for (const p of particles) p.draw(ctx, camera);
      ctx.restore();
    }
    this.ui.draw();
  }
  loop(ts) {
    const dt = Math.min((ts - (this.lastTs || ts)) / 1000, 0.05);
    this.lastTs = ts;
    this.update(dt);
    this.draw();
    requestAnimationFrame(ts => this.loop(ts));
  }
  start() { requestAnimationFrame(ts => this.loop(ts)); }
}

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
    this.toastTimer = 0;
    this.toastText = '';
    this.toastEl = document.createElement('div');
    this.toastEl.style.cssText = 'position:absolute;top:18px;left:50%;transform:translateX(-50%);background:rgba(18,20,30,0.9);color:#e0c78a;padding:8px 16px;border-radius:8px;border:2px solid #e0c78a;font-weight:700;pointer-events:none;z-index:25;opacity:0;transition:opacity .2s;';
    document.getElementById('game-container').appendChild(this.toastEl);
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
    ['startMenu','controlsMenu','gameOverMenu','victoryMenu','overlay'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(name + 'Menu')?.classList.remove('hidden');
    if (name === 'start' || name === 'victory') document.getElementById('overlay').classList.remove('hidden');
  }
  addToast(text) {
    this.toastText = text;
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = 1;
    this.toastTimer = 120;
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
    if (this.toastTimer > 0) {
      this.toastTimer--;
      if (this.toastTimer === 0) this.toastEl.style.opacity = 0;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  game = new Game();
  game.start();
});
