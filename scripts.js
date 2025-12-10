// server.js
// Minimal authoritative server for Web Platform Fighter
// Run: npm install ws
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const TICK_RATE = 60;
const SNAPSHOT_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;

let nextPlayerId = 1;
let clients = {};          // id -> { ws, inputBuffer: [] }
let players = {};          // id -> playerState
let projectiles = {};      // id -> projectileState
let nextProjId = 1;
let tick = 0;

// Platforms (must match client)
const PLATFORMS = [
  {x: 80, y: 340, w: 220, h: 16},
  {x: 420, y: 280, w: 180, h: 16},
  {x: 720, y: 340, w: 220, h: 16},
];

// create default player on connect
function makeDefaultPlayer(id) {
  return {
    id,
    x: 120 + (Math.random()*200|0),
    y: 300,
    vx: 0, vy: 0,
    w: 36, h: 56,
    grounded: false,
    facing: 1,
    hp: 100,
    dashCooldown: 0,
    ultCharge: 0,
    lastShotTick: -1000,
  };
}

wss.on('connection', (ws) => {
  const id = 'p'+(nextPlayerId++);
  clients[id] = { ws, inputBuffer: [] };
  players[id] = makeDefaultPlayer(id);

  // send welcome
  ws.send(JSON.stringify({ type: 'welcome', id }));
  console.log('connected', id);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'input' && data.input) {
        clients[id].inputBuffer.push(data.input);
      } else if (data.type === 'ping') {
        // respond? not necessary here
      }
    } catch (e) { console.error('bad msg', e); }
  });

  ws.on('close', () => {
    console.log('disconnect', id);
    delete clients[id];
    delete players[id];
  });
});

// helper collision: simple AABB
function aabbOverlap(a, b) {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

// server physics constants
const GRAV = 1500;
const SPEED = 240;
const JUMP_V = -430;
const DASH_V = 520;
const FRICTION = 0.9;

// apply input to player (server authoritative)
function applyInputServer(p, input, dt) {
  // clamp input to reasonable values
  const left = !!input.left;
  const right = !!input.right;
  const jump = !!input.jump;
  const dash = !!input.dash;
  const shoot = !!input.shoot;
  const ultHold = !!input.ultHold;

  // horizontal
  let ax = 0;
  if (left) ax -= 1;
  if (right) ax += 1;
  p.vx = ax * SPEED;
  if (ax !== 0) p.facing = ax>0?1:-1;

  // dash handling with cooldown
  if (dash && p.dashCooldown <= 0) {
    p._dashing = true;
    p._dashTimer = 0.12;
    p.vx = p.facing * DASH_V;
    p.dashCooldown = 1.25; // seconds
  }
  if (p._dashing) {
    p._dashTimer -= dt;
    if (p._dashTimer <= 0) { p._dashing = false; p._dashTimer = 0; }
  }

  // gravity
  p.vy += GRAV * dt;

  // jump
  if (jump && p.grounded) {
    p.vy = JUMP_V; p.grounded = false;
  }

  // integrate
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // platform collisions: simple - push up if intersect
  // ground plane
  if (p.y > 420 - p.h) {
    p.y = 420 - p.h; p.vy = 0; p.grounded = true;
  }
  // platform list
  PLATFORMS.forEach(pl => {
    // treat as platform from top only
    const withinX = p.x + p.w > pl.x && p.x < pl.x + pl.w;
    const wasAbove = (p.y + p.h - p.vy*dt) <= pl.y; // previous top <= platform y
    if (withinX && p.y + p.h >= pl.y && wasAbove) {
      p.y = pl.y - p.h;
      p.vy = 0;
      p.grounded = true;
    }
  });

  // cooldown progression
  if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

  // friction damp
  if (p.grounded) p.vx *= FRICTION;
  
  // shooting (spawn projectile) - limit rate
  if (shoot && (tick - p.lastShotTick) > 10) {
    spawnProjectile(p);
    p.lastShotTick = tick;
  }

  // ultimate charge/release: simple charge up while holding
  if (ultHold) {
    p.ultCharge += dt;
    if (p.ultCharge > 2.0) p.ultCharge = 2.0;
  } else {
    if (p.ultCharge >= 0.8) {
      // release big wave: spawn several projectiles in fan
      spawnUltimate(p, p.ultCharge);
    }
    p.ultCharge = 0;
  }

  // bounds clamp
  p.x = Math.max(8, Math.min(992 - p.w, p.x));
}

// spawn a projectile from player p
function spawnProjectile(p) {
  const id = 'proj' + (nextProjId++);
  const speed = 480;
  projectiles[id] = {
    id, owner: p.id,
    x: p.x + p.w/2 + (p.facing>0? 20 : -20),
    y: p.y + p.h/2 - 6,
    vx: p.facing * speed,
    vy: 0,
    r: 7,
    life: 1.9, // seconds
    damage: 12
  };
}

// ultimate: spawn multiple projectiles in arc depending on charge
function spawnUltimate(p, charge) {
  const idBase = 'ult' + (nextProjId++);
  const n = Math.round(3 + charge*4); // between 3..7
  const speed = 360 + charge*260;
  for (let i=0;i<n;i++) {
    const angle = -0.4 + (i/(n-1)) * 0.8; // fan up
    const dir = p.facing;
    const id = idBase + '_' + i;
    projectiles[id] = {
      id, owner: p.id,
      x: p.x + p.w/2,
      y: p.y + p.h/2,
      vx: Math.cos(angle) * speed * dir,
      vy: Math.sin(angle) * speed,
      r: 10,
      life: 2.2,
      damage: 18
    };
  }
}

// server tick loop
setInterval(() => {
  const dt = TICK_MS / 1000;
  tick++;

  // process inputs for each player
  for (const id in clients) {
    const client = clients[id];
    const p = players[id];
    if (!p) continue;

    // consume all inputs in buffer (or only last? we process all to be robust)
    while (client.inputBuffer.length > 0) {
      const input = client.inputBuffer.shift();
      // server authoritative apply
      applyInputServer(p, input, dt);
    }
    // if no input, still integrate physics for player (gravity, friction)
    // we still call with empty input
    // applyInputServer(p, {}, dt); -- but careful not to double-apply if inputs processed
  }

  // simulate projectiles
  for (const pid in projectiles) {
    const pr = projectiles[pid];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    // gravity effect on ult projectiles
    pr.vy += 400 * dt;

    // check collision with players
    for (const plId in players) {
      const pl = players[plId];
      if (plId === pr.owner) continue; // friendly fire off
      // AABB vs circle
      const closestX = Math.max(pl.x, Math.min(pr.x, pl.x + pl.w));
      const closestY = Math.max(pl.y, Math.min(pr.y, pl.y + pl.h));
      const dx = pr.x - closestX, dy = pr.y - closestY;
      if (dx*dx + dy*dy <= (pr.r*pr.r)) {
        // hit!
        pl.hp -= pr.damage;
        // knockback
        pl.vx += Math.sign(pr.vx) * 180;
        pl.vy -= 160;
        pr.life = -1; // remove
      }
    }

    // remove if out of bounds or life depleted
    if (pr.life <= 0 || pr.x < -50 || pr.x > 1100 || pr.y > 1200) {
      delete projectiles[pid];
    }
  }

  // broadcast snapshot at SNAPSHOT_RATE
}, TICK_MS);

// snapshot broadcast separately at SNAPSHOT_RATE
setInterval(() => {
  const snap = {
    type: 'snapshot',
    tick,
    time: Date.now(), // clients can use for interpolation
    players: Object.values(players).map(p => ({
      id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, w: p.w, h: p.h, hp: p.hp,
      facing: p.facing, dashCooldown: p.dashCooldown, ultCharge: p.ultCharge
    })),
    projectiles: Object.values(projectiles).map(pr => ({
      id: pr.id, x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, r: pr.r
    }))
  };
  const raw = JSON.stringify(snap);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(raw);
  });
}, 1000 / SNAPSHOT_RATE);

console.log('Authoritative server running on ws://localhost:8080');
