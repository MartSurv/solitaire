// ═══════════════════════════════════════════════════════
//  SOUND ENGINE
// ═══════════════════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null,
  reverbNode = null,
  noiseBuffer = null;

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new AudioCtx();
  const rate = audioCtx.sampleRate,
    len = rate * 0.8;
  const impulse = audioCtx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  reverbNode = audioCtx.createConvolver();
  reverbNode.buffer = impulse;
  const nLen = rate * 2;
  noiseBuffer = audioCtx.createBuffer(1, nLen, rate);
  const nData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nLen; i++) nData[i] = Math.random() * 2 - 1;
}

function noiseBurst(dest, t, dur, freq, Q, gain, type = "bandpass") {
  const s = audioCtx.createBufferSource();
  s.buffer = noiseBuffer;
  const f = audioCtx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.Q.setValueAtTime(Q, t);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(t);
  s.stop(t + dur);
  return { src: s, filt: f, gain: g };
}

function tonalPing(dest, t, freq, dur, vol, wave = "sine") {
  const o = audioCtx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol * 0.8, t + dur * 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur);
}

function playSound(type) {
  try {
    ensureAudio();
    const now = audioCtx.currentTime,
      dry = audioCtx.destination;
    const wet = audioCtx.createGain();
    wet.gain.value = 0.15;
    wet.connect(reverbNode);
    reverbNode.connect(dry);
    if (type === "place") {
      noiseBurst(dry, now, 0.06, 1200, 1.5, 0.12);
      noiseBurst(dry, now, 0.08, 200, 2, 0.1, "lowpass");
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(50, now + 0.05);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      o.connect(g);
      g.connect(dry);
      o.start(now);
      o.stop(now + 0.06);
    } else if (type === "flip") {
      const nb = noiseBurst(dry, now, 0.07, 3000, 0.8, 0.06, "highpass");
      nb.filt.frequency.exponentialRampToValueAtTime(800, now + 0.07);
      noiseBurst(dry, now, 0.015, 4000, 3, 0.04);
      tonalPing(wet, now, 2400, 0.04, 0.015);
    } else if (type === "draw") {
      const nb = noiseBurst(dry, now, 0.05, 600, 1, 0.06);
      nb.filt.frequency.linearRampToValueAtTime(2000, now + 0.04);
      noiseBurst(dry, now + 0.01, 0.02, 3500, 4, 0.05);
    } else if (type === "invalid") {
      noiseBurst(dry, now, 0.06, 300, 2, 0.07, "lowpass");
      noiseBurst(dry, now + 0.08, 0.06, 250, 2, 0.05, "lowpass");
      const o = audioCtx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(90, now);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.04, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.connect(g);
      g.connect(dry);
      o.start(now);
      o.stop(now + 0.15);
    } else if (type === "score") {
      tonalPing(dry, now, 1320, 0.12, 0.04);
      tonalPing(dry, now, 1980, 0.1, 0.02);
      tonalPing(wet, now, 2640, 0.08, 0.015);
      noiseBurst(wet, now, 0.04, 6000, 3, 0.01);
    } else if (type === "hint") {
      tonalPing(dry, now, 880, 0.08, 0.03);
      tonalPing(wet, now, 1320, 0.06, 0.015);
    } else if (type === "win") {
      [523, 659, 784, 988, 1047].forEach((f, i) => {
        const t = now + i * 0.12;
        tonalPing(dry, t, f, 0.5 - i * 0.05, 0.06);
        tonalPing(wet, t, f * 2, 0.35, 0.015);
        tonalPing(dry, t, f * 0.5, 0.3, 0.02, "triangle");
        noiseBurst(wet, t, 0.03, 5000 + i * 500, 4, 0.008);
      });
      const ct = now + 5 * 0.12;
      [523, 659, 784, 1047].forEach((f) => {
        tonalPing(wet, ct, f, 1.2, 0.035);
        tonalPing(wet, ct, f * 2, 0.8, 0.01);
      });
      noiseBurst(wet, ct, 0.3, 4000, 0.5, 0.02, "highpass");
    }
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════
//  SCORE POPUP
// ═══════════════════════════════════════════════════════
function showScorePop(pts, x, y) {
  const el = document.createElement("div");
  el.className = "score-pop" + (pts < 0 ? " negative" : "");
  el.textContent = (pts > 0 ? "+" : "") + pts;
  el.style.left = x + "px";
  el.style.top = y + "px";
  document.getElementById("game").appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ═══════════════════════════════════════════════════════
//  THREE.JS — win burst only (lazy-loaded on first win)
// ═══════════════════════════════════════════════════════
let _threeLoader = null;
function loadThreeJs() {
  if (_threeLoader) return _threeLoader;
  _threeLoader = new Promise((resolve, reject) => {
    if (typeof THREE !== "undefined") return resolve();
    const s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("three.js failed to load"));
    document.head.appendChild(s);
  });
  return _threeLoader;
}

let _threeBurst = null;
function initThreeScene() {
  if (_threeBurst) return;
  const canvas = document.getElementById("bg");
  if (!canvas || typeof THREE === "undefined") return;
  const W = () => innerWidth,
    H = () => innerHeight;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(W(), H());
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(60, W() / H(), 0.1, 100);
  cam.position.z = 30;
  let winP = null,
    winT = 0,
    animating = false;

  _threeBurst = function () {
    if (winP) {
      scene.remove(winP);
      winP.geometry.dispose();
    }
    const C = 400,
      g = new THREE.BufferGeometry(),
      p = new Float32Array(C * 3),
      co = new Float32Array(C * 3),
      vs = [];
    const pal = [
      0xe8c840, 0xff7043, 0x66bb6a, 0x42a5f5, 0xab47bc, 0xef5350,
    ].map((c) => new THREE.Color(c));
    for (let i = 0; i < C; i++) {
      p[i * 3] = (Math.random() - 0.5) * 2;
      p[i * 3 + 1] = 0;
      p[i * 3 + 2] = (Math.random() - 0.5) * 2;
      const c = pal[~~(Math.random() * pal.length)];
      co[i * 3] = c.r;
      co[i * 3 + 1] = c.g;
      co[i * 3 + 2] = c.b;
      vs.push({
        x: (Math.random() - 0.5) * 0.7,
        y: Math.random() * 0.6 + 0.3,
        z: (Math.random() - 0.5) * 0.7,
      });
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(co, 3));
    winP = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.15,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    winP.userData.vs = vs;
    scene.add(winP);
    winT = 0;
    if (!animating) {
      animating = true;
      anim();
    }
  };

  function anim() {
    if (!winP) {
      animating = false;
      renderer.clear();
      return;
    }
    requestAnimationFrame(anim);
    if (document.hidden) return;
    winT++;
    const wp = winP.geometry.attributes.position.array,
      vs = winP.userData.vs;
    for (let i = 0; i < vs.length; i++) {
      wp[i * 3] += vs[i].x;
      wp[i * 3 + 1] += vs[i].y;
      wp[i * 3 + 2] += vs[i].z;
      vs[i].y -= 0.009;
    }
    winP.geometry.attributes.position.needsUpdate = true;
    winP.material.opacity = Math.max(0, 1 - winT / 180);
    if (winT > 180) {
      scene.remove(winP);
      winP.geometry.dispose();
      winP = null;
    }
    renderer.render(scene, cam);
  }

  addEventListener("resize", () => {
    renderer.setSize(W(), H());
    cam.aspect = W() / H();
    cam.updateProjectionMatrix();
  });
}

window.triggerWinEffect = async function () {
  try {
    await loadThreeJs();
    initThreeScene();
    if (_threeBurst) _threeBurst();
  } catch (err) {
    console.warn("Win effect unavailable:", err);
  }
};

// ═══════════════════════════════════════════════════════
//  WIN CASCADE — bouncing cards on canvas
// ═══════════════════════════════════════════════════════
function runWinCascade() {
  const cvs = document.getElementById("winCanvas"),
    ctx = cvs.getContext("2d");
  cvs.width = innerWidth;
  cvs.height = innerHeight;
  const W = cvs.width,
    H = cvs.height,
    cw = 70,
    ch = 98;
  const suits = ["♠", "♥", "♦", "♣"],
    colors = { "♠": "#1a1a1a", "♣": "#1a1a1a", "♥": "#c0392b", "♦": "#c0392b" };
  const ranks = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  const cards = [];
  for (let fi = 0; fi < 4; fi++)
    for (let ri = 12; ri >= 0; ri--)
      cards.push({
        x: W * 0.55 + fi * 85,
        y: 40,
        vx: (Math.random() - 0.5) * 6 + (fi - 1.5) * 2,
        vy: Math.random() * -4 - 2,
        suit: suits[fi],
        rank: ranks[ri],
        color: colors[suits[fi]],
        delay: fi * 200 + (12 - ri) * 80,
        active: false,
        bounces: 0,
      });
  const start = performance.now();
  let running = true;
  function draw(now) {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    const elapsed = now - start;
    let any = false;
    for (const c of cards) {
      if (elapsed < c.delay) {
        any = true;
        continue;
      }
      if (!c.active) c.active = true;
      c.vy += 0.35;
      c.x += c.vx;
      c.y += c.vy;
      if (c.y + ch > H && c.bounces < 4) {
        c.y = H - ch;
        c.vy *= -0.7;
        c.bounces++;
      }
      if (c.y < H + 50) any = true;
      if (c.y > H + 100) continue;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,.3)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.roundRect(c.x, c.y, cw, ch, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = c.color;
      ctx.font = "bold 14px system-ui";
      ctx.fillText(c.rank, c.x + 5, c.y + 16);
      ctx.font = "12px system-ui";
      ctx.fillText(c.suit, c.x + 5, c.y + 30);
      ctx.font = "28px system-ui";
      ctx.fillText(c.suit, c.x + cw / 2 - 10, c.y + ch / 2 + 8);
      ctx.restore();
    }
    if (any && elapsed < 15000) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(draw);
  window._stopCascade = () => {
    running = false;
    ctx.clearRect(0, 0, W, H);
  };
}

// ═══════════════════════════════════════════════════════
//  SHARED CARD CONSTANTS & UTILITIES
// ═══════════════════════════════════════════════════════
const SUITS = ["♠", "♥", "♦", "♣"];
const SC = { "♠": "black", "♣": "black", "♥": "red", "♦": "red" };
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const RV = {};
RANKS.forEach((r, i) => (RV[r] = i));
const FACE_CARDS = ["J", "Q", "K"];

function mkCard(s, r, faceUp = false) {
  return { suit: s, rank: r, faceUp, id: `${r}${s}` };
}
function mkDeck(allFaceUp) {
  const d = [];
  for (const s of SUITS)
    for (const r of RANKS) d.push(mkCard(s, r, !!allFaceUp));
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function isRed(c) {
  return SC[c.suit] === "red";
}
function fmt(s) {
  return `${~~(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function canFnd(card, fi, foundations) {
  const f = foundations[fi];
  if (!f.length) return card.rank === "A";
  const t = f[f.length - 1];
  return card.suit === t.suit && RV[card.rank] === RV[t.rank] + 1;
}
function findFnd(card, foundations) {
  for (let fi = 0; fi < 4; fi++) if (canFnd(card, fi, foundations)) return fi;
  return -1;
}

// Card element creation
function mkEl(card) {
  const isFace = FACE_CARDS.includes(card.rank);
  const el = document.createElement("div");
  el.className = `card ${card.faceUp ? "face-up" : "face-down"} ${SC[card.suit]}${isFace ? " face-card" : ""}`;
  const center = isFace
    ? `<div class="card-center"><span class="face-letter">${card.rank}</span><span class="big-suit">${card.suit}</span></div>`
    : `<div class="card-center"><span class="big-suit">${card.suit}</span></div>`;
  el.innerHTML = `<div class="card-face card-front"><div class="pip pip-tl"><span class="r">${card.rank}</span><span class="s">${card.suit}</span></div>${center}<div class="pip pip-br"><span class="r">${card.rank}</span><span class="s">${card.suit}</span></div></div><div class="card-face card-back"></div>`;
  return el;
}

// Pointer helpers
function getXY(e, end) {
  const t = end ? e.changedTouches : e.touches;
  if (t && t.length) return { x: t[0].clientX, y: t[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function clearHL() {
  document.querySelectorAll(".highlight,.highlight-pulse").forEach((e) => {
    e.classList.remove("highlight", "highlight-pulse");
  });
}

// Drag controller — shared card drag/drop behavior for Klondike & FreeCell.
// Consumers provide game-specific hooks; controller owns the pointer lifecycle.
function createDragController({
  canDragStart,
  collectDragGroup,
  fanVar,
  fanFallback,
  onShowDrop,
  onClick,
  onRightClick,
  dropHandlers,
  onDropFail,
  onCancel,
}) {
  let dragState = null;

  function removeEls() {
    if (dragState) dragState.els.forEach((d) => d.remove());
  }

  function bind(el, card, srcT, srcI, cIdx) {
    function onStart(e) {
      if (!canDragStart(card, srcT, srcI, cIdx)) return;
      if (e.type === "mousedown" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      clearHints();
      const { cards, els } = collectDragGroup(el, card, srcT, srcI, cIdx);
      const rect = el.getBoundingClientRect();
      const pt = getXY(e);
      dragState = {
        cards, els, srcT, srcI, cIdx,
        ox: pt.x - rect.left,
        oy: pt.y - rect.top,
        sx: pt.x, sy: pt.y,
        dragging: false,
        clickEl: el,
        fan:
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(fanVar),
          ) || fanFallback,
      };
    }
    el.addEventListener("mousedown", onStart);
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("contextmenu", (e) =>
      onRightClick(card, srcT, srcI, cIdx, e),
    );
  }

  function onMove(e) {
    if (!dragState) return;
    const pt = e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : getXY(e);
    if (!dragState.dragging) {
      if (Math.abs(pt.x - dragState.sx) < 5 && Math.abs(pt.y - dragState.sy) < 5)
        return;
      dragState.dragging = true;
      dragState.els.forEach((de) => {
        de.classList.add("dragging");
        document.body.appendChild(de);
      });
      onShowDrop(dragState);
    }
    dragState.els.forEach((de, i) => {
      de.style.position = "fixed";
      de.style.left = pt.x - dragState.ox + "px";
      de.style.top = pt.y - dragState.oy + i * dragState.fan + "px";
      de.style.zIndex = 10000 + i;
    });
    e.preventDefault();
  }

  function onUp(e) {
    if (!dragState) return;
    clearHL();
    const pt = getXY(e, true);
    if (!dragState.dragging) {
      const { cards, srcT, srcI, cIdx, clickEl } = dragState;
      dragState = null;
      onClick(cards[0], srcT, srcI, cIdx, clickEl);
      return;
    }
    dragState.els.forEach((de) => (de.style.display = "none"));
    const target = document.elementFromPoint(pt.x, pt.y);
    dragState.els.forEach((de) => (de.style.display = ""));
    let ok = false;
    if (target) {
      for (const h of dropHandlers) {
        if (h(target, dragState)) { ok = true; break; }
      }
    }
    removeEls();
    if (!ok) onDropFail();
    dragState = null;
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("mouseup", onUp);
  document.addEventListener("touchend", onUp);
  document.addEventListener("touchcancel", () => {
    if (!dragState) return;
    removeEls();
    onCancel();
    dragState = null;
  });

  function reset() {
    if (!dragState) return;
    removeEls();
    dragState = null;
  }

  return { bind, reset };
}

// Undo/redo history. Game provides snapshot/restore; controller owns the stacks.
// snapshot() returns an opaque, JSON-serializable state object.
// restore(s) applies that object back to the game.
function createGameHistory({ snapshot, restore, maxDepth = 60 }) {
  let past = [];
  let future = [];
  const trim = (arr) => {
    if (arr.length > maxDepth) arr.splice(0, arr.length - maxDepth);
  };
  return {
    save() {
      past.push(snapshot());
      trim(past);
      future = [];
    },
    undo() {
      if (!past.length) return false;
      future.push(snapshot());
      trim(future);
      restore(past.pop());
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(snapshot());
      trim(past);
      restore(future.pop());
      return true;
    },
    clear() {
      past = [];
      future = [];
    },
    loadFrom(pastArr) {
      past = Array.isArray(pastArr) ? pastArr.slice() : [];
      future = [];
    },
    exportRecent(n = 10) {
      return past.slice(-n);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

function createTimer({ displayId = "timer" } = {}) {
  let sec = 0;
  let interval = null;
  const render = () => {
    const el = document.getElementById(displayId);
    if (el) el.textContent = fmt(sec);
  };
  return {
    start() {
      if (interval) return;
      interval = setInterval(() => {
        if (timerPaused) return;
        sec++;
        render();
      }, 1000);
    },
    stop() {
      clearInterval(interval);
      interval = null;
    },
    reset() {
      clearInterval(interval);
      interval = null;
      sec = 0;
      render();
    },
    get: () => sec,
    set(v) {
      sec = v;
      render();
    },
    isRunning: () => interval !== null,
  };
}

// Hint helpers
let hintTimeout = null;
function clearHints() {
  document
    .querySelectorAll(".hinted")
    .forEach((e) => e.classList.remove("hinted"));
  if (hintTimeout) clearTimeout(hintTimeout);
}

// Timer pause on tab hidden
let timerPaused = false;
document.addEventListener("visibilitychange", () => {
  timerPaused = document.hidden;
});

// Theme system
const THEMES = [
  {
    name: "Classic Blue",
    bg: "linear-gradient(145deg,#1e3a6e,#152d5a)",
    border: "#2a5298",
  },
  {
    name: "Royal Red",
    bg: "linear-gradient(145deg,#8b1a1a,#5c1010)",
    border: "#b22222",
  },
  {
    name: "Forest Green",
    bg: "linear-gradient(145deg,#1a5c1a,#0d3d0d)",
    border: "#2e8b2e",
  },
  {
    name: "Midnight",
    bg: "linear-gradient(145deg,#2a2a2a,#1a1a1a)",
    border: "#444",
  },
];
const THEME_KEY = "solitaire_theme";

function applyTheme(idx) {
  const t = THEMES[idx] || THEMES[0];
  document.documentElement.style.setProperty("--cur-back", t.bg);
  document.documentElement.style.setProperty("--cur-border", t.border);
}

// Score a foundation move — safer/earlier ranks higher so autoplay doesn't
// bury a card the tableau may still need. Classic Klondike/FreeCell safety rule.
function scoreFoundationMove(card, foundations) {
  if (card.rank === "A") return 400;
  if (card.rank === "2") return 350;
  const cardRed = isRed(card);
  let minOpp = 99;
  for (let fi = 0; fi < 4; fi++) {
    const suit = SUITS[fi];
    const fRed = SC[suit] === "red";
    if (fRed === cardRed) continue;
    const f = foundations[fi];
    const top = f.length ? RV[f[f.length - 1].rank] : -1;
    if (top < minOpp) minOpp = top;
  }
  return RV[card.rank] <= minOpp + 2 ? 200 : 60;
}

// ═══════════════════════════════════════════════════════
//  SETTINGS (card size, felt color, card back, reduce motion)
// ═══════════════════════════════════════════════════════
const PREFS_KEY = "solitaire_prefs";
const SIZES = [
  { id: "tiny", label: "Mažiausios" },
  { id: "small", label: "Mažos" },
  { id: "medium", label: "Vidutinės" },
  { id: "large", label: "Didelės" },
  { id: "huge", label: "Didžiausios" },
];
const FELTS = [
  { id: "green", label: "Žalias", color: "#1a6b3c" },
  { id: "blue", label: "Mėlynas", color: "#1e3f6b" },
  { id: "burgundy", label: "Bordinis", color: "#6b1a1a" },
  { id: "charcoal", label: "Juodas", color: "#2a2a2a" },
  { id: "purple", label: "Violetinis", color: "#4a1a6b" },
];
const DEFAULT_PREFS = {
  size: "medium",
  felt: "green",
  customFelt: null,
  feltImage: null,
  back: 0,
  customBack: null,
  reduceMotion: false,
};

function darkenHex(hex, pct) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  r = Math.max(0, Math.floor(r * (1 - pct)));
  g = Math.max(0, Math.floor(g * (1 - pct)));
  b = Math.max(0, Math.floor(b * (1 - pct)));
  return (
    "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")
  );
}

function getPrefs() {
  let prefs;
  try {
    prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    prefs = {};
  }
  const legacy = localStorage.getItem(THEME_KEY);
  if (legacy != null && prefs.back == null) prefs.back = +legacy;
  return { ...DEFAULT_PREFS, ...prefs };
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyPrefs(prefs) {
  const body = document.body;
  const root = document.documentElement;
  SIZES.forEach((s) => body.classList.remove(`size-${s.id}`));
  FELTS.forEach((f) => body.classList.remove(`felt-${f.id}`));
  body.classList.add(`size-${prefs.size}`);
  body.classList.toggle("reduce-motion", !!prefs.reduceMotion);

  body.classList.remove("felt-image");
  body.style.backgroundImage = "";
  if (prefs.felt === "image" && prefs.feltImage) {
    body.classList.add("felt-image");
    body.style.backgroundImage = `url(${prefs.feltImage})`;
    body.style.setProperty("--felt", "#1a1a1a");
  } else if (prefs.felt === "custom" && prefs.customFelt) {
    body.style.setProperty("--felt", prefs.customFelt);
  } else {
    body.style.removeProperty("--felt");
    body.classList.add(`felt-${prefs.felt}`);
  }

  if (prefs.back === "custom" && prefs.customBack) {
    const c = prefs.customBack;
    root.style.setProperty(
      "--cur-back",
      `linear-gradient(145deg, ${c}, ${darkenHex(c, 0.3)})`,
    );
    root.style.setProperty("--cur-border", darkenHex(c, 0.15));
  } else {
    applyTheme(typeof prefs.back === "number" ? prefs.back : 0);
  }
}

function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function mkDiv(className, textOrChildren) {
  const d = document.createElement("div");
  if (className) d.className = className;
  if (typeof textOrChildren === "string") d.textContent = textOrChildren;
  else if (Array.isArray(textOrChildren))
    textOrChildren.forEach((c) => d.appendChild(c));
  return d;
}

function buildSettingsModal() {
  if (document.getElementById("settingsOverlay")) return;
  const overlay = mkDiv("overlay");
  overlay.id = "settingsOverlay";

  const modal = mkDiv("modal settings-modal");
  const h2 = document.createElement("h2");
  h2.textContent = "Nustatymai";
  const p = document.createElement("p");
  p.textContent = "Pritaikyk žaidimo išvaizdą.";
  modal.appendChild(h2);
  modal.appendChild(p);

  const sizeGroup = mkDiv("setting-group");
  sizeGroup.appendChild(mkDiv("setting-label", "Kortų dydis"));
  const sizeHost = mkDiv("seg");
  sizeHost.id = "setSize";
  sizeGroup.appendChild(sizeHost);
  modal.appendChild(sizeGroup);

  const feltGroup = mkDiv("setting-group");
  feltGroup.appendChild(mkDiv("setting-label", "Staltiesės spalva"));
  const feltHost = mkDiv("swatches");
  feltHost.id = "setFelt";
  feltGroup.appendChild(feltHost);
  modal.appendChild(feltGroup);

  const backGroup = mkDiv("setting-group");
  backGroup.appendChild(mkDiv("setting-label", "Kortų nugarėlė"));
  const backHost = mkDiv("themes");
  backHost.id = "themePicker";
  backGroup.appendChild(backHost);
  modal.appendChild(backGroup);

  const motionGroup = mkDiv("setting-group setting-row");
  motionGroup.appendChild(mkDiv("setting-label", "Mažiau animacijų"));
  const sw = document.createElement("label");
  sw.className = "switch";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = "setReduceMotion";
  const slider = document.createElement("span");
  slider.className = "slider";
  sw.appendChild(cb);
  sw.appendChild(slider);
  motionGroup.appendChild(sw);
  modal.appendChild(motionGroup);

  const footer = mkDiv("modal-footer");
  const reset = document.createElement("button");
  reset.className = "btn";
  reset.id = "resetDefaultsBtn";
  reset.textContent = "Atstatyti numatytus";
  const close = document.createElement("button");
  close.className = "btn gold";
  close.id = "settingsCloseBtn";
  close.textContent = "Gerai";
  footer.appendChild(reset);
  footer.appendChild(close);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });
  close.onclick = () => overlay.classList.remove("show");
}

function initSettings(onChangeCallback) {
  buildSettingsModal();
  const prefs = getPrefs();
  applyPrefs(prefs);

  const sizeEl = document.getElementById("setSize");
  const updateSizeActive = () => {
    sizeEl.querySelectorAll(".seg-btn").forEach((x) => {
      x.classList.toggle("active", x.dataset.id === prefs.size);
    });
  };
  SIZES.forEach((s) => {
    const b = document.createElement("button");
    b.className = "seg-btn";
    b.dataset.id = s.id;
    b.textContent = s.label;
    b.onclick = () => {
      prefs.size = s.id;
      savePrefs(prefs);
      applyPrefs(prefs);
      updateSizeActive();
      if (onChangeCallback) onChangeCallback();
    };
    sizeEl.appendChild(b);
  });
  updateSizeActive();

  const feltEl = document.getElementById("setFelt");
  const updateFeltActive = () => {
    feltEl.querySelectorAll(".swatch").forEach((x) => {
      const id = x.dataset.id;
      x.classList.toggle("active", id === prefs.felt);
    });
  };
  FELTS.forEach((f) => {
    const b = document.createElement("div");
    b.className = "swatch";
    b.dataset.id = f.id;
    b.style.background = f.color;
    b.title = f.label;
    b.onclick = () => {
      prefs.felt = f.id;
      savePrefs(prefs);
      applyPrefs(prefs);
      updateFeltActive();
      if (onChangeCallback) onChangeCallback();
    };
    feltEl.appendChild(b);
  });
  // Custom felt color picker
  const feltCustom = document.createElement("label");
  feltCustom.className = "swatch custom-swatch";
  feltCustom.dataset.id = "custom";
  feltCustom.title = "Custom color";
  if (prefs.customFelt) feltCustom.style.background = prefs.customFelt;
  const feltInput = document.createElement("input");
  feltInput.type = "color";
  feltInput.value = prefs.customFelt || "#1a6b3c";
  feltInput.oninput = () => {
    prefs.felt = "custom";
    prefs.customFelt = feltInput.value;
    feltCustom.style.background = feltInput.value;
    applyPrefs(prefs);
    updateFeltActive();
    if (onChangeCallback) onChangeCallback();
  };
  feltInput.onchange = () => savePrefs(prefs);
  feltCustom.appendChild(feltInput);
  feltEl.appendChild(feltCustom);

  // Custom felt image upload
  const feltImageSwatch = document.createElement("label");
  feltImageSwatch.className = "swatch image-swatch";
  feltImageSwatch.dataset.id = "image";
  feltImageSwatch.title = "Upload image";
  if (prefs.feltImage)
    feltImageSwatch.style.backgroundImage = `url(${prefs.feltImage})`;
  const feltFileInput = document.createElement("input");
  feltFileInput.type = "file";
  feltFileInput.accept = "image/*";
  feltFileInput.onchange = async () => {
    const file = feltFileInput.files && feltFileInput.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      prefs.felt = "image";
      prefs.feltImage = dataUrl;
      feltImageSwatch.style.backgroundImage = `url(${dataUrl})`;
      savePrefs(prefs);
      applyPrefs(prefs);
      updateFeltActive();
      if (onChangeCallback) onChangeCallback();
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      feltFileInput.value = "";
    }
  };
  feltImageSwatch.appendChild(feltFileInput);
  feltEl.appendChild(feltImageSwatch);
  updateFeltActive();

  // Card back picker (preset themes + custom color)
  const backEl = document.getElementById("themePicker");
  const updateBackActive = () => {
    backEl.querySelectorAll(".theme-btn").forEach((x) => {
      const v = x.dataset.id;
      const isActive =
        v === "custom"
          ? prefs.back === "custom"
          : +v === (typeof prefs.back === "number" ? prefs.back : -1);
      x.classList.toggle("active", isActive);
      x.style.borderColor = isActive ? "#e8c840" : "transparent";
    });
  };
  THEMES.forEach((t, i) => {
    const btn = document.createElement("div");
    btn.className = "theme-btn";
    btn.dataset.id = String(i);
    btn.style.background = t.bg;
    btn.title = t.name;
    btn.onclick = () => {
      prefs.back = i;
      savePrefs(prefs);
      applyPrefs(prefs);
      updateBackActive();
      if (onChangeCallback) onChangeCallback();
    };
    backEl.appendChild(btn);
  });
  // Custom card back color
  const backCustom = document.createElement("label");
  backCustom.className = "theme-btn custom-swatch";
  backCustom.dataset.id = "custom";
  backCustom.title = "Custom color";
  if (prefs.customBack) backCustom.style.background = prefs.customBack;
  const backInput = document.createElement("input");
  backInput.type = "color";
  backInput.value = prefs.customBack || "#1e3a6e";
  backInput.oninput = () => {
    prefs.back = "custom";
    prefs.customBack = backInput.value;
    backCustom.style.background = backInput.value;
    applyPrefs(prefs);
    updateBackActive();
    if (onChangeCallback) onChangeCallback();
  };
  backInput.onchange = () => savePrefs(prefs);
  backCustom.appendChild(backInput);
  backEl.appendChild(backCustom);
  updateBackActive();

  const rm = document.getElementById("setReduceMotion");
  rm.checked = !!prefs.reduceMotion;
  rm.onchange = () => {
    prefs.reduceMotion = rm.checked;
    savePrefs(prefs);
    applyPrefs(prefs);
    if (onChangeCallback) onChangeCallback();
  };

  const syncAll = () => {
    updateSizeActive();
    updateFeltActive();
    feltInput.value = prefs.customFelt || "#1a6b3c";
    feltCustom.style.background = prefs.customFelt || "";
    feltImageSwatch.style.backgroundImage = prefs.feltImage
      ? `url(${prefs.feltImage})`
      : "";
    updateBackActive();
    backInput.value = prefs.customBack || "#1e3a6e";
    backCustom.style.background = prefs.customBack || "";
    rm.checked = !!prefs.reduceMotion;
  };

  document.getElementById("resetDefaultsBtn").onclick = () => {
    Object.keys(prefs).forEach((k) => delete prefs[k]);
    Object.assign(prefs, DEFAULT_PREFS);
    savePrefs(prefs);
    applyPrefs(prefs);
    syncAll();
    if (onChangeCallback) onChangeCallback();
  };
}

function openSettings() {
  document.getElementById("settingsOverlay").classList.add("show");
}
