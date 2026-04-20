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
//  THREE.JS — win burst only
// ═══════════════════════════════════════════════════════
(function () {
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

  window.triggerWinEffect = function () {
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
})();

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

function initThemes(onChangeCallback) {
  const picker = document.getElementById("themePicker");
  if (!picker) return;
  const cur = localStorage.getItem(THEME_KEY) || "0";
  applyTheme(+cur);
  THEMES.forEach((t, i) => {
    const btn = document.createElement("div");
    btn.className = "theme-btn" + (i === +cur ? " active" : "");
    btn.style.background = t.bg;
    btn.style.borderColor = i === +cur ? "#e8c840" : "transparent";
    btn.title = t.name;
    btn.onclick = () => {
      applyTheme(i);
      localStorage.setItem(THEME_KEY, i);
      picker.querySelectorAll(".theme-btn").forEach((b, j) => {
        b.classList.toggle("active", j === i);
        b.style.borderColor = j === i ? "#e8c840" : "transparent";
      });
      if (onChangeCallback) onChangeCallback();
    };
    picker.appendChild(btn);
  });
}

// ═══════════════════════════════════════════════════════
//  SETTINGS (card size, felt color, card back, reduce motion)
// ═══════════════════════════════════════════════════════
const PREFS_KEY = "solitaire_prefs";
const SIZES = [
  { id: "tiny", label: "Tiny" },
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
  { id: "huge", label: "Huge" },
];
const FELTS = [
  { id: "green", label: "Green", color: "#1a6b3c" },
  { id: "blue", label: "Blue", color: "#1e3f6b" },
  { id: "burgundy", label: "Burgundy", color: "#6b1a1a" },
  { id: "charcoal", label: "Charcoal", color: "#2a2a2a" },
  { id: "purple", label: "Purple", color: "#4a1a6b" },
];
const DEFAULT_PREFS = {
  size: "medium",
  felt: "green",
  back: 0,
  reduceMotion: false,
};

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
  SIZES.forEach((s) => body.classList.remove(`size-${s.id}`));
  FELTS.forEach((f) => body.classList.remove(`felt-${f.id}`));
  body.classList.add(`size-${prefs.size}`);
  body.classList.add(`felt-${prefs.felt}`);
  body.classList.toggle("reduce-motion", !!prefs.reduceMotion);
  applyTheme(prefs.back || 0);
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
  h2.textContent = "Settings";
  const p = document.createElement("p");
  p.textContent = "Customize how the game looks.";
  modal.appendChild(h2);
  modal.appendChild(p);

  const sizeGroup = mkDiv("setting-group");
  sizeGroup.appendChild(mkDiv("setting-label", "Card Size"));
  const sizeHost = mkDiv("seg");
  sizeHost.id = "setSize";
  sizeGroup.appendChild(sizeHost);
  modal.appendChild(sizeGroup);

  const feltGroup = mkDiv("setting-group");
  feltGroup.appendChild(mkDiv("setting-label", "Felt Color"));
  const feltHost = mkDiv("swatches");
  feltHost.id = "setFelt";
  feltGroup.appendChild(feltHost);
  modal.appendChild(feltGroup);

  const backGroup = mkDiv("setting-group");
  backGroup.appendChild(mkDiv("setting-label", "Card Back"));
  const backHost = mkDiv("themes");
  backHost.id = "themePicker";
  backGroup.appendChild(backHost);
  modal.appendChild(backGroup);

  const motionGroup = mkDiv("setting-group setting-row");
  motionGroup.appendChild(mkDiv("setting-label", "Reduce Motion"));
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

  const close = document.createElement("button");
  close.className = "btn gold";
  close.id = "settingsCloseBtn";
  close.textContent = "Done";
  modal.appendChild(close);

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
  SIZES.forEach((s) => {
    const b = document.createElement("button");
    b.className = "seg-btn" + (s.id === prefs.size ? " active" : "");
    b.textContent = s.label;
    b.onclick = () => {
      prefs.size = s.id;
      savePrefs(prefs);
      applyPrefs(prefs);
      sizeEl
        .querySelectorAll(".seg-btn")
        .forEach((x, i) => x.classList.toggle("active", SIZES[i].id === s.id));
      if (onChangeCallback) onChangeCallback();
    };
    sizeEl.appendChild(b);
  });

  const feltEl = document.getElementById("setFelt");
  FELTS.forEach((f) => {
    const b = document.createElement("div");
    b.className = "swatch" + (f.id === prefs.felt ? " active" : "");
    b.style.background = f.color;
    b.title = f.label;
    b.onclick = () => {
      prefs.felt = f.id;
      savePrefs(prefs);
      applyPrefs(prefs);
      feltEl
        .querySelectorAll(".swatch")
        .forEach((x, i) => x.classList.toggle("active", FELTS[i].id === f.id));
      if (onChangeCallback) onChangeCallback();
    };
    feltEl.appendChild(b);
  });

  initThemes(() => {
    prefs.back = +localStorage.getItem(THEME_KEY) || 0;
    savePrefs(prefs);
    if (onChangeCallback) onChangeCallback();
  });

  const rm = document.getElementById("setReduceMotion");
  rm.checked = !!prefs.reduceMotion;
  rm.onchange = () => {
    prefs.reduceMotion = rm.checked;
    savePrefs(prefs);
    applyPrefs(prefs);
    if (onChangeCallback) onChangeCallback();
  };
}

function openSettings() {
  document.getElementById("settingsOverlay").classList.add("show");
}
