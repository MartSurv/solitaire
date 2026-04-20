// ═══════════════════════════════════════════════════════
//  KLONDIKE SOLITAIRE
// ═══════════════════════════════════════════════════════

let stock = [],
  waste = [],
  foundations = [[], [], [], []],
  tableau = [[], [], [], [], [], [], []];
let score = 0,
  moveCount = 0,
  timerSec = 0,
  timerInterval = null;
let history = [],
  autoCompleting = false,
  dragState = null;

const SAVE_KEY = "solitaire_game",
  STATS_KEY = "solitaire_stats";

// ─── Persistence ────────────────────────────────────────
function loadStats() {
  try {
    return (
      JSON.parse(localStorage.getItem(STATS_KEY)) || {
        gamesPlayed: 0,
        gamesWon: 0,
        bestScore: 0,
        bestTime: 0,
        winStreak: 0,
        currentStreak: 0,
        totalTime: 0,
      }
    );
  } catch (e) {
    return {
      gamesPlayed: 0,
      gamesWon: 0,
      bestScore: 0,
      bestTime: 0,
      winStreak: 0,
      currentStreak: 0,
      totalTime: 0,
    };
  }
}
function saveStats(s) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch (e) {}
}

function saveGame() {
  try {
    const compact = (c) => ({ s: c.suit, r: c.rank, f: c.faceUp });
    const state = {
      stock: stock.map(compact),
      waste: waste.map(compact),
      foundations: foundations.map((f) => f.map(compact)),
      tableau: tableau.map((p) => p.map(compact)),
      score,
      moveCount,
      timerSec,
      history: history
        .slice(-10)
        .map((h) => ({
          stock: h.stock.map(compact),
          waste: h.waste.map(compact),
          foundations: h.foundations.map((f) => f.map(compact)),
          tableau: h.tableau.map((p) => p.map(compact)),
          score: h.score,
          moveCount: h.moveCount,
        })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function restoreCard(c) {
  return { suit: c.s, rank: c.r, faceUp: c.f, id: `${c.r}${c.s}` };
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    stock = s.stock.map(restoreCard);
    waste = s.waste.map(restoreCard);
    foundations = s.foundations.map((f) => f.map(restoreCard));
    tableau = s.tableau.map((p) => p.map(restoreCard));
    score = s.score;
    moveCount = s.moveCount;
    timerSec = s.timerSec || 0;
    history = (s.history || []).map((h) => ({
      stock: h.stock.map(restoreCard),
      waste: h.waste.map(restoreCard),
      foundations: h.foundations.map((f) => f.map(restoreCard)),
      tableau: h.tableau.map((p) => p.map(restoreCard)),
      score: h.score,
      moveCount: h.moveCount,
    }));
    return true;
  } catch (e) {
    return false;
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}

// ─── Stats / Timer ──────────────────────────────────────
function updStats() {
  document.getElementById("score").textContent = score;
  document.getElementById("moves").textContent = moveCount;
}
function addScore(n, el) {
  score = Math.max(0, score + n);
  updStats();
  if (n !== 0 && el) {
    const r = el.getBoundingClientRect(),
      gr = document.getElementById("game").getBoundingClientRect();
    showScorePop(
      n,
      r.left - gr.left + r.width / 2,
      r.top - gr.top + r.height / 2,
    );
    if (n > 0) playSound("score");
  }
}
function addMove() {
  moveCount++;
  updStats();
  saveGame();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!timerPaused) {
      timerSec++;
      document.getElementById("timer").textContent = fmt(timerSec);
    }
  }, 1000);
}

// ─── History ────────────────────────────────────────────
function saveState() {
  history.push({
    stock: stock.map((c) => ({ ...c })),
    waste: waste.map((c) => ({ ...c })),
    foundations: foundations.map((f) => f.map((c) => ({ ...c }))),
    tableau: tableau.map((p) => p.map((c) => ({ ...c }))),
    score,
    moveCount,
  });
  if (history.length > 60) history.shift();
}
function undo() {
  if (!history.length || autoCompleting) return;
  const s = history.pop();
  stock = s.stock;
  waste = s.waste;
  foundations = s.foundations;
  tableau = s.tableau;
  score = s.score;
  moveCount = s.moveCount;
  updStats();
  render();
  saveGame();
}

// ─── Validation ─────────────────────────────────────────
function canTab(card, pile) {
  if (!pile.length) return card.rank === "K";
  const t = pile[pile.length - 1];
  return (
    t.faceUp && isRed(card) !== isRed(t) && RV[card.rank] === RV[t.rank] - 1
  );
}
function isTopCard(srcT, srcI, cIdx) {
  return (
    (srcT === "tableau" && cIdx === tableau[srcI].length - 1) ||
    srcT === "waste" ||
    srcT === "foundation"
  );
}

function bounceAndScore(dstT, dstI, pts) {
  const el = findTopCardEl(dstT, dstI);
  if (el) {
    el.classList.add("bouncing");
    el.addEventListener("animationend", () => el.classList.remove("bouncing"), {
      once: true,
    });
    if (pts) addScore(pts, el);
  } else if (pts) addScore(pts);
}
function maybeFlipRevealed(srcT, srcI) {
  if (srcT === "tableau") {
    const p = tableau[srcI];
    if (p.length) {
      const re = findTopCardEl("tableau", srcI);
      if (re) {
        re.classList.add("flipping");
        addScore(5, re);
        setTimeout(() => re.classList.remove("flipping"), 350);
      }
    }
  }
}

// ─── Stock ──────────────────────────────────────────────
function drawStock() {
  saveState();
  playSound("draw");
  if (!stock.length) {
    if (!waste.length) return;
    stock = waste.reverse().map((c) => {
      c.faceUp = false;
      return c;
    });
    waste = [];
    addScore(-20);
  } else {
    const c = stock.pop();
    c.faceUp = true;
    waste.push(c);
  }
  addMove();
  render();
}

// ─── Move with FLIP animation ───────────────────────────
function doMove(srcT, srcI, cIdx, dstT, dstI, animate) {
  let srcRects = [];
  if (animate) {
    if (srcT === "tableau") {
      const pe = document.getElementById(`p${srcI}`);
      const all = pe.querySelectorAll(".card");
      for (let i = cIdx; i < tableau[srcI].length; i++) {
        if (all[i]) srcRects.push(all[i].getBoundingClientRect());
      }
    } else if (srcT === "waste") {
      const we = document.getElementById("waste");
      const el = we.querySelector(".card:last-child");
      if (el) srcRects = [el.getBoundingClientRect()];
    } else if (srcT === "foundation") {
      const el = document.getElementById(`f${srcI}`).querySelector(".card");
      if (el) srcRects = [el.getBoundingClientRect()];
    }
  }

  saveState();
  let movedCards;
  if (srcT === "tableau") {
    movedCards = tableau[srcI].splice(cIdx);
    const p = tableau[srcI];
    if (p.length && !p[p.length - 1].faceUp) {
      p[p.length - 1].faceUp = true;
      playSound("flip");
    }
  } else if (srcT === "waste") movedCards = [waste.pop()];
  else if (srcT === "foundation") movedCards = [foundations[srcI].pop()];

  let pts = 0;
  if (dstT === "tableau") {
    tableau[dstI].push(...movedCards);
    if (srcT === "waste") pts = 5;
    if (srcT === "foundation") pts = -15;
  } else if (dstT === "foundation") {
    foundations[dstI].push(...movedCards);
    pts = 10;
  }

  playSound("place");
  addMove();
  render();

  if (animate && srcRects.length) {
    let destEls = [];
    if (dstT === "tableau") {
      const pe = document.getElementById(`p${dstI}`);
      const all = pe.querySelectorAll(".card");
      for (let i = 0; i < movedCards.length; i++) {
        const idx = all.length - movedCards.length + i;
        if (all[idx]) destEls.push(all[idx]);
      }
    } else if (dstT === "foundation") {
      const el = document.getElementById(`f${dstI}`).querySelector(".card");
      if (el) destEls = [el];
    }

    const animData = destEls.map((el, i) => {
      const destRect = el.getBoundingClientRect();
      const sr = srcRects[i] || srcRects[0];
      const parent = el.parentElement;
      const nextSib = el.nextElementSibling;
      el.style.position = "fixed";
      el.style.left = sr.left + "px";
      el.style.top = sr.top + "px";
      el.style.width = destRect.width + "px";
      el.style.height = destRect.height + "px";
      el.style.margin = "0";
      el.style.zIndex = 10000 + i;
      el.classList.add("animating");
      document.body.appendChild(el);
      return { el, destRect, parent, nextSib };
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        animData.forEach(({ el, destRect }) => {
          el.style.transition =
            "left .28s cubic-bezier(.25,.46,.45,.94),top .28s cubic-bezier(.25,.46,.45,.94)";
          el.style.left = destRect.left + "px";
          el.style.top = destRect.top + "px";
        });
        const lastEl = animData[animData.length - 1].el;
        let done = false;
        function finish() {
          if (done) return;
          done = true;
          animData.forEach(({ el }) => {
            if (el.parentElement === document.body) el.remove();
          });
          render();
          bounceAndScore(dstT, dstI, pts);
        }
        lastEl.addEventListener("transitionend", finish, { once: true });
        setTimeout(finish, 350);
      });
    });

    maybeFlipRevealed(srcT, srcI);
  } else {
    bounceAndScore(dstT, dstI, pts);
    maybeFlipRevealed(srcT, srcI);
  }

  checkAutoComplete();
  checkWin();
}

function findTopCardEl(type, idx) {
  if (type === "foundation")
    return document.getElementById(`f${idx}`).querySelector(".card:last-child");
  if (type === "tableau")
    return document.getElementById(`p${idx}`).querySelector(".card:last-child");
  return null;
}

// ─── Click: smart auto-move ─────────────────────────────
function handleClick(card, srcT, srcI, cIdx, el) {
  if (autoCompleting || !card.faceUp) return;
  clearHints();
  if (isTopCard(srcT, srcI, cIdx)) {
    const fi = findFnd(card, foundations);
    if (fi >= 0) {
      doMove(srcT, srcI, cIdx, "foundation", fi, true);
      return;
    }
  }
  for (let pi = 0; pi < 7; pi++) {
    if (srcT === "tableau" && pi === srcI) continue;
    if (canTab(card, tableau[pi])) {
      if (card.rank === "K" && !tableau[pi].length) continue;
      doMove(srcT, srcI, cIdx, "tableau", pi, true);
      return;
    }
  }
  if (card.rank === "K") {
    if (srcT === "tableau" && cIdx === 0) return;
    for (let pi = 0; pi < 7; pi++) {
      if (srcT === "tableau" && pi === srcI) continue;
      if (!tableau[pi].length) {
        doMove(srcT, srcI, cIdx, "tableau", pi, true);
        return;
      }
    }
  }
  if (el) {
    playSound("invalid");
    el.classList.add("shaking");
    el.addEventListener("animationend", () => el.classList.remove("shaking"), {
      once: true,
    });
  }
}

function handleRightClick(card, srcT, srcI, cIdx, e) {
  e.preventDefault();
  if (autoCompleting || !card.faceUp || !isTopCard(srcT, srcI, cIdx)) return;
  const fi = findFnd(card, foundations);
  if (fi >= 0) doMove(srcT, srcI, cIdx, "foundation", fi, true);
}

// ─── Hint system ────────────────────────────────────────
// Score a foundation move: safer/earlier ranks rank higher so we don't
// bury a card the tableau might still need.
function scoreFoundationMove(card) {
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
  // Classic safety rule: only auto-promote when both opposite-color
  // foundations are within one rank — otherwise the card may still be
  // needed on the tableau.
  return RV[card.rank] <= minOpp + 2 ? 200 : 60;
}

// True if some King is movable into an empty column — i.e. emptying
// one would actually help. Excludes the column we're about to empty.
function hasUsefulKing(excludePi) {
  if (waste.length && waste[waste.length - 1].rank === "K") return true;
  for (let pi = 0; pi < 7; pi++) {
    if (pi === excludePi) continue;
    const p = tableau[pi];
    for (let ci = 0; ci < p.length; ci++) {
      if (!p[ci].faceUp) continue;
      // King buried under face-downs — moving it to an empty col unburies them
      if (p[ci].rank === "K" && ci > 0 && !p[ci - 1].faceUp) return true;
    }
  }
  return false;
}

function findHint() {
  const moves = [];

  if (waste.length) {
    const c = waste[waste.length - 1];
    const cIdx = waste.length - 1;
    const fi = findFnd(c, foundations);
    if (fi >= 0) {
      moves.push({
        srcT: "waste", srcI: 0, cIdx,
        dstT: "foundation", dstI: fi,
        score: scoreFoundationMove(c) + 30,
      });
    }
    for (let pi = 0; pi < 7; pi++) {
      if (!canTab(c, tableau[pi])) continue;
      // Avoid "burning" a K from waste onto an empty column if we have
      // a tableau K buried under face-downs — unburying that is better.
      const emptyDst = !tableau[pi].length;
      let s = 80;
      if (c.rank === "K" && emptyDst && hasUsefulKing(-1)) s = 70;
      moves.push({
        srcT: "waste", srcI: 0, cIdx,
        dstT: "tableau", dstI: pi, score: s,
      });
    }
  }

  for (let pi = 0; pi < 7; pi++) {
    const p = tableau[pi];
    if (!p.length) continue;

    const top = p[p.length - 1];
    const fi = findFnd(top, foundations);
    if (fi >= 0) {
      const exposesDown = p.length >= 2 && !p[p.length - 2].faceUp;
      moves.push({
        srcT: "tableau", srcI: pi, cIdx: p.length - 1,
        dstT: "foundation", dstI: fi,
        score: scoreFoundationMove(top) + (exposesDown ? 1000 : 0),
      });
    }

    for (let ci = 0; ci < p.length; ci++) {
      if (!p[ci].faceUp) continue;
      for (let di = 0; di < 7; di++) {
        if (di === pi) continue;
        if (!canTab(p[ci], tableau[di])) continue;
        if (p[ci].rank === "K" && ci === 0 && !tableau[di].length) continue;

        let s = 30;
        // Unblock face-down cards — the whole point of "smart" hinting.
        if (ci > 0 && !p[ci - 1].faceUp) {
          let buried = 0;
          for (let i = ci - 1; i >= 0 && !p[i].faceUp; i--) buried++;
          s += 1000 + buried * 50;
        }
        // Empties a column — only a win if some King can use it.
        if (ci === 0) {
          s += hasUsefulKing(pi) ? 500 : -20;
        }
        // Prefer moving onto a non-empty pile (consolidates runs).
        if (tableau[di].length) s += 5;
        moves.push({
          srcT: "tableau", srcI: pi, cIdx: ci,
          dstT: "tableau", dstI: di, score: s,
        });
      }
    }
  }

  if (stock.length) moves.push({ srcT: "stock", score: 5 });

  if (!moves.length) return null;
  moves.sort((a, b) => b.score - a.score);
  return moves[0];
}

function showHint() {
  clearHints();
  const h = findHint();
  if (!h) {
    playSound("invalid");
    return;
  }
  playSound("hint");
  if (h.srcT === "stock") {
    document.getElementById("stock").classList.add("hinted");
    hintTimeout = setTimeout(clearHints, 2000);
    return;
  }
  let srcEl = null;
  if (h.srcT === "waste")
    srcEl = document.getElementById("waste").querySelector(".card:last-child");
  else if (h.srcT === "tableau") {
    const all = document.getElementById(`p${h.srcI}`).querySelectorAll(".card");
    srcEl = all[h.cIdx];
  }
  let dstEl = null;
  if (h.dstT === "foundation") dstEl = document.getElementById(`f${h.dstI}`);
  else if (h.dstT === "tableau") {
    const pe = document.getElementById(`p${h.dstI}`);
    dstEl = pe.querySelector(".card:last-child") || pe;
  }
  if (srcEl) srcEl.classList.add("hinted");
  if (dstEl) dstEl.classList.add("hinted");
  hintTimeout = setTimeout(clearHints, 2500);
}

// ─── Win / Auto ─────────────────────────────────────────
function checkWin() {
  if (foundations.every((f) => f.length === 13)) {
    clearInterval(timerInterval);
    autoCompleting = false;
    document.getElementById("autoBanner").classList.remove("show");
    setTimeout(showWin, 400);
  }
}
function showWin() {
  playSound("win");
  clearSave();
  const stats = loadStats();
  stats.gamesWon++;
  stats.currentStreak++;
  if (stats.currentStreak > stats.winStreak)
    stats.winStreak = stats.currentStreak;
  if (score > stats.bestScore) stats.bestScore = score;
  if (!stats.bestTime || timerSec < stats.bestTime) stats.bestTime = timerSec;
  stats.totalTime += timerSec;
  saveStats(stats);
  if (window.triggerWinEffect) window.triggerWinEffect();
  runWinCascade();
  setTimeout(() => {
    document.getElementById("fScore").textContent = score;
    document.getElementById("fMoves").textContent = moveCount;
    document.getElementById("fTime").textContent = fmt(timerSec);
    document.getElementById("fWins").textContent = stats.gamesWon;
    document.getElementById("fBest").textContent = stats.bestScore;
    document.getElementById("fStreak").textContent = stats.winStreak;
    document.getElementById("winOverlay").classList.add("show");
  }, 3000);
}

function checkAutoComplete() {
  if (autoCompleting) return;
  if (!stock.length && tableau.every((p) => p.every((c) => c.faceUp)))
    document.getElementById("autoBanner").classList.add("show");
  else checkStuck();
}

function checkStuck() {
  if (autoCompleting || stock.length) return;
  document.getElementById("stuckBanner").classList.remove("show");
  if (waste.length) {
    const c = waste[waste.length - 1];
    if (findFnd(c, foundations) >= 0) return;
    for (let pi = 0; pi < 7; pi++) if (canTab(c, tableau[pi])) return;
  }
  for (let pi = 0; pi < 7; pi++) {
    const p = tableau[pi];
    if (!p.length) continue;
    if (findFnd(p[p.length - 1], foundations) >= 0) return;
    for (let ci = 0; ci < p.length; ci++) {
      if (!p[ci].faceUp) continue;
      for (let di = 0; di < 7; di++) {
        if (di === pi) continue;
        if (canTab(p[ci], tableau[di])) return;
      }
    }
  }
  document.getElementById("stuckBanner").classList.add("show");
}

function runAuto() {
  autoCompleting = true;
  document.getElementById("autoBanner").classList.remove("show");
  autoStep();
}
function autoStep() {
  if (!autoCompleting) return;
  let moved = false;
  if (waste.length) {
    const fi = findFnd(waste[waste.length - 1], foundations);
    if (fi >= 0) {
      doMove("waste", 0, waste.length - 1, "foundation", fi);
      moved = true;
    }
  }
  if (!moved) {
    for (let pi = 0; pi < 7; pi++) {
      const p = tableau[pi];
      if (!p.length) continue;
      const fi = findFnd(p[p.length - 1], foundations);
      if (fi >= 0) {
        doMove("tableau", pi, p.length - 1, "foundation", fi);
        moved = true;
        break;
      }
    }
  }
  checkWin();
  if (moved && !foundations.every((f) => f.length === 13))
    setTimeout(autoStep, 70);
  else autoCompleting = false;
}

// ═══════════════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════════════
function render() {
  document.querySelectorAll(".card").forEach((e) => e.remove());
  renderStock();
  renderWaste();
  renderFnd();
  renderTab();
}

function renderStock() {
  const el = document.getElementById("stock");
  el.className = `slot stock${stock.length ? "" : " empty"}`;
  el.onmousedown = el.ontouchstart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    drawStock();
  };
  stock.slice(-3).forEach((c, i) => {
    const ce = mkEl(c);
    ce.style.cssText = `position:absolute;left:0;top:${-i * 1.5}px;z-index:${i};pointer-events:none`;
    el.appendChild(ce);
  });
}

function renderWaste() {
  const el = document.getElementById("waste");
  el.innerHTML = "";
  const show = waste.slice(-3);
  show.forEach((c, i) => {
    const ce = mkEl(c);
    ce.style.cssText = `position:absolute;left:${i * 20}px;top:0;z-index:${i + 1}`;
    if (i === show.length - 1) bind(ce, c, "waste", 0, waste.length - 1);
    else ce.style.pointerEvents = "none";
    el.appendChild(ce);
  });
}

function renderFnd() {
  foundations.forEach((f, fi) => {
    const el = document.getElementById(`f${fi}`);
    el.querySelectorAll(".card").forEach((c) => c.remove());
    if (f.length) {
      const c = f[f.length - 1],
        ce = mkEl(c);
      ce.style.cssText = "position:absolute;left:0;top:0";
      bind(ce, c, "foundation", fi, f.length - 1);
      el.appendChild(ce);
    }
  });
}

function renderTab() {
  const cs = getComputedStyle(document.documentElement);
  const fanUp = parseFloat(cs.getPropertyValue("--fan-up")) || 28;
  const fanDown = parseFloat(cs.getPropertyValue("--fan-down")) || 8;
  const cardH = parseFloat(cs.getPropertyValue("--ch")) || 147;
  tableau.forEach((pile, pi) => {
    const el = document.getElementById(`p${pi}`);
    el.querySelectorAll(".card").forEach((c) => c.remove());
    pile.forEach((c, ci) => {
      const ce = mkEl(c);
      let top = 0;
      for (let k = 0; k < ci; k++) top += pile[k].faceUp ? fanUp : fanDown;
      ce.style.cssText = `position:absolute;left:0;top:${top}px;z-index:${ci + 1}`;
      if (c.faceUp) bind(ce, c, "tableau", pi, ci);
      el.appendChild(ce);
    });
    let h = cardH;
    pile.forEach((c, i) => {
      if (i > 0) h += c.faceUp ? fanUp : fanDown;
    });
    el.style.minHeight = h + "px";
  });
}

// ═══════════════════════════════════════════════════════
//  INTERACTION
// ═══════════════════════════════════════════════════════
function bind(el, card, srcT, srcI, cIdx) {
  function onStart(e) {
    if (autoCompleting || !card.faceUp) return;
    if (e.type === "mousedown" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    clearHints();
    let dCards = [],
      dEls = [];
    if (srcT === "tableau") {
      const pEl = document.getElementById(`p${srcI}`),
        all = pEl.querySelectorAll(".card");
      for (let i = cIdx; i < tableau[srcI].length; i++) {
        dCards.push(tableau[srcI][i]);
        dEls.push(all[i]);
      }
    } else {
      dCards = [card];
      dEls = [el];
    }
    const rect = el.getBoundingClientRect();
    const pt = getXY(e);
    dragState = {
      cards: dCards,
      els: dEls,
      srcT,
      srcI,
      cIdx,
      ox: pt.x - rect.left,
      oy: pt.y - rect.top,
      sx: pt.x,
      sy: pt.y,
      dragging: false,
      clickEl: el,
    };
  }
  el.addEventListener("mousedown", onStart);
  el.addEventListener("touchstart", onStart, { passive: false });
  el.addEventListener("contextmenu", (e) =>
    handleRightClick(card, srcT, srcI, cIdx, e),
  );
}

function onPointerMove(e) {
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
    showDrop(dragState.cards[0], dragState.srcT, dragState.srcI);
  }
  const dragFan =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--fan-up"),
    ) || 28;
  dragState.els.forEach((de, i) => {
    de.style.position = "fixed";
    de.style.left = pt.x - dragState.ox + "px";
    de.style.top = pt.y - dragState.oy + i * dragFan + "px";
    de.style.zIndex = 10000 + i;
  });
  e.preventDefault();
}
document.addEventListener("mousemove", onPointerMove);
document.addEventListener("touchmove", onPointerMove, { passive: false });

function onPointerUp(e) {
  if (!dragState) return;
  clearHL();
  const pt = getXY(e, true);
  if (!dragState.dragging) {
    const { cards, srcT, srcI, cIdx, clickEl } = dragState;
    dragState = null;
    handleClick(cards[0], srcT, srcI, cIdx, clickEl);
    return;
  }
  dragState.els.forEach((de) => (de.style.display = "none"));
  const target = document.elementFromPoint(pt.x, pt.y);
  dragState.els.forEach((de) => (de.style.display = ""));
  let ok = false;
  if (target) {
    const fs = target.closest(".foundation");
    if (fs && dragState.cards.length === 1) {
      const fi = +fs.id[1];
      if (canFnd(dragState.cards[0], fi, foundations)) {
        dragState.els.forEach((d) => d.remove());
        doMove(
          dragState.srcT,
          dragState.srcI,
          dragState.cIdx,
          "foundation",
          fi,
        );
        ok = true;
      }
    }
    if (!ok) {
      const pe = target.closest(".pile");
      if (pe) {
        const pi = +pe.id[1];
        if (canTab(dragState.cards[0], tableau[pi])) {
          dragState.els.forEach((d) => d.remove());
          doMove(dragState.srcT, dragState.srcI, dragState.cIdx, "tableau", pi);
          ok = true;
        }
      }
    }
  }
  if (!ok) {
    playSound("invalid");
    dragState.els.forEach((d) => d.remove());
    render();
  }
  dragState = null;
}
document.addEventListener("mouseup", onPointerUp);
document.addEventListener("touchend", onPointerUp);
document.addEventListener("touchcancel", () => {
  if (dragState) {
    dragState.els.forEach((d) => d.remove());
    render();
    dragState = null;
  }
});

function showDrop(card, srcT, srcI) {
  for (let fi = 0; fi < 4; fi++)
    if (canFnd(card, fi, foundations)) {
      const e = document.getElementById(`f${fi}`);
      e.classList.add("highlight", "highlight-pulse");
    }
  for (let pi = 0; pi < 7; pi++) {
    if (srcT === "tableau" && pi === srcI) continue;
    if (canTab(card, tableau[pi]))
      document.getElementById(`p${pi}`).classList.add("highlight");
  }
}

// ═══════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════
let kbSelected = null;

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === "h" || e.key === "H") {
    showHint();
    return;
  }
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(
      e.key,
    )
  ) {
    e.preventDefault();
    if (!kbSelected) {
      kbSelected = { type: "tableau", idx: 0, cardIdx: getDeepestFaceUp(0) };
      highlightKB();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      executeKBAction();
      return;
    }

    if (e.key === "ArrowLeft") {
      if (kbSelected.type === "tableau")
        kbSelected.idx = Math.max(0, kbSelected.idx - 1);
      else if (kbSelected.type === "foundation")
        kbSelected.idx = Math.max(0, kbSelected.idx - 1);
      else if (kbSelected.type === "waste")
        kbSelected = { type: "stock", idx: 0 };
    } else if (e.key === "ArrowRight") {
      if (kbSelected.type === "tableau")
        kbSelected.idx = Math.min(6, kbSelected.idx + 1);
      else if (kbSelected.type === "foundation")
        kbSelected.idx = Math.min(3, kbSelected.idx + 1);
      else if (kbSelected.type === "stock")
        kbSelected = { type: "waste", idx: 0 };
    } else if (e.key === "ArrowUp") {
      if (kbSelected.type === "tableau") {
        if (kbSelected.idx < 2) kbSelected = { type: "stock", idx: 0 };
        else if (kbSelected.idx < 4) kbSelected = { type: "waste", idx: 0 };
        else kbSelected = { type: "foundation", idx: kbSelected.idx - 3 };
      }
    } else if (e.key === "ArrowDown") {
      if (kbSelected.type === "stock" || kbSelected.type === "waste") {
        kbSelected = {
          type: "tableau",
          idx: kbSelected.type === "waste" ? 1 : 0,
          cardIdx: 0,
        };
        kbSelected.cardIdx = getDeepestFaceUp(kbSelected.idx);
      } else if (kbSelected.type === "foundation") {
        kbSelected = { type: "tableau", idx: kbSelected.idx + 3, cardIdx: 0 };
        kbSelected.cardIdx = getDeepestFaceUp(kbSelected.idx);
      } else
        kbSelected.cardIdx = Math.min(
          tableau[kbSelected.idx].length - 1,
          (kbSelected.cardIdx || 0) + 1,
        );
    }

    if (
      kbSelected.type === "tableau" &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    )
      kbSelected.cardIdx = getDeepestFaceUp(kbSelected.idx);
    highlightKB();
  }
});

function getDeepestFaceUp(pi) {
  const p = tableau[pi];
  for (let i = 0; i < p.length; i++) if (p[i].faceUp) return i;
  return Math.max(0, p.length - 1);
}

function highlightKB() {
  document.querySelectorAll(".kb-hl").forEach((e) => {
    e.classList.remove("kb-hl");
    e.style.outline = "";
  });
  let el = null;
  if (kbSelected.type === "stock") el = document.getElementById("stock");
  else if (kbSelected.type === "waste") {
    const w = document.getElementById("waste");
    el = w.querySelector(".card:last-child") || w;
  } else if (kbSelected.type === "foundation")
    el =
      document.getElementById(`f${kbSelected.idx}`).querySelector(".card") ||
      document.getElementById(`f${kbSelected.idx}`);
  else {
    const pe = document.getElementById(`p${kbSelected.idx}`);
    const all = pe.querySelectorAll(".card");
    el = all[kbSelected.cardIdx] || pe;
  }
  if (el) {
    el.classList.add("kb-hl");
    el.style.outline = "3px solid #e8c840";
    el.style.outlineOffset = "2px";
    el.style.borderRadius = "var(--cr)";
  }
}

function executeKBAction() {
  if (!kbSelected) return;
  if (kbSelected.type === "stock") {
    drawStock();
    return;
  }
  if (kbSelected.type === "waste" && waste.length) {
    handleClick(
      waste[waste.length - 1],
      "waste",
      0,
      waste.length - 1,
      document.getElementById("waste").querySelector(".card:last-child"),
    );
    return;
  }
  if (kbSelected.type === "foundation") {
    const f = foundations[kbSelected.idx];
    if (f.length)
      handleClick(
        f[f.length - 1],
        "foundation",
        kbSelected.idx,
        f.length - 1,
        null,
      );
    return;
  }
  if (kbSelected.type === "tableau") {
    const p = tableau[kbSelected.idx];
    if (p.length && p[kbSelected.cardIdx] && p[kbSelected.cardIdx].faceUp) {
      const all = document
        .getElementById(`p${kbSelected.idx}`)
        .querySelectorAll(".card");
      handleClick(
        p[kbSelected.cardIdx],
        "tableau",
        kbSelected.idx,
        kbSelected.cardIdx,
        all[kbSelected.cardIdx],
      );
    }
  }
}

// ═══════════════════════════════════════════════════════
//  STATS MODAL
// ═══════════════════════════════════════════════════════
function showStatsModal() {
  const stats = loadStats();
  const winRate = stats.gamesPlayed
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
    : 0;
  const avgTime = stats.gamesWon
    ? Math.round(stats.totalTime / stats.gamesWon)
    : 0;
  document.getElementById("statsGrid").innerHTML = [
    ["Games Played", stats.gamesPlayed],
    ["Games Won", stats.gamesWon],
    ["Win Rate", winRate + "%"],
    ["Best Score", stats.bestScore || "—"],
    ["Best Time", stats.bestTime ? fmt(stats.bestTime) : "—"],
    ["Avg Win Time", avgTime ? fmt(avgTime) : "—"],
    ["Win Streak", stats.winStreak],
    ["Current Streak", stats.currentStreak],
  ]
    .map(
      ([l, v]) =>
        `<div class="stats-row"><span class="label">${l}</span><span class="val">${v}</span></div>`,
    )
    .join("");
  document.getElementById("statsOverlay").classList.add("show");
}

// ═══════════════════════════════════════════════════════
//  DEAL ANIMATION
// ═══════════════════════════════════════════════════════
function dealAnimation() {
  const stockRect = document.getElementById("stock").getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  const fanUp = parseFloat(cs.getPropertyValue("--fan-up")) || 28;
  const fanDown = parseFloat(cs.getPropertyValue("--fan-down")) || 8;
  tableau.forEach((pile, pi) => {
    const pileEl = document.getElementById(`p${pi}`);
    const cards = pileEl.querySelectorAll(".card");
    cards.forEach((ce, ci) => {
      const destRect = ce.getBoundingClientRect();
      ce.style.transition = "none";
      ce.style.left =
        stockRect.left - destRect.left + parseFloat(ce.style.left) + "px";
      ce.style.top =
        stockRect.top - destRect.top + parseFloat(ce.style.top) + "px";
      ce.style.opacity = "0";
      const delay = pi * 50 + ci * 30;
      setTimeout(() => {
        ce.classList.add("dealing");
        ce.style.opacity = "1";
        let top = 0;
        for (let k = 0; k < ci; k++) top += pile[k].faceUp ? fanUp : fanDown;
        ce.style.left = "0";
        ce.style.top = top + "px";
        if (ci === pile.length - 1) playSound("flip");
        setTimeout(() => ce.classList.remove("dealing"), 400);
      }, delay + 50);
    });
  });
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
function newGame(skipStats) {
  if (window._stopCascade) window._stopCascade();
  clearInterval(timerInterval);
  document.getElementById("winOverlay").classList.remove("show");
  document.getElementById("autoBanner").classList.remove("show");
  document.getElementById("stuckBanner").classList.remove("show");
  autoCompleting = false;
  dragState = null;
  kbSelected = null;
  clearSave();
  if (!skipStats) {
    const stats = loadStats();
    stats.gamesPlayed++;
    stats.currentStreak = 0;
    saveStats(stats);
  }
  const deck = shuffle(mkDeck());
  stock = [];
  waste = [];
  foundations = [[], [], [], []];
  tableau = [[], [], [], [], [], [], []];
  history = [];
  score = 0;
  moveCount = 0;
  timerSec = 0;
  updStats();
  document.getElementById("timer").textContent = "0:00";
  for (let c = 0; c < 7; c++)
    for (let r = 0; r <= c; r++) {
      const card = deck.pop();
      if (r === c) card.faceUp = true;
      tableau[c].push(card);
    }
  stock = deck.reverse();
  render();
  startTimer();
  saveGame();
  setTimeout(dealAnimation, 30);
}

function resumeGame() {
  if (!loadGame()) return false;
  updStats();
  document.getElementById("timer").textContent = fmt(timerSec);
  render();
  startTimer();
  return true;
}

// Bindings
document.getElementById("undoBtn").onclick = undo;
document.getElementById("newBtn").onclick = () => newGame();
document.getElementById("autoBtn").onclick = runAuto;
document.getElementById("stuckNewBtn").onclick = () => newGame();
document.getElementById("playAgainBtn").onclick = () => newGame();
document.getElementById("hintBtn").onclick = showHint;
document.getElementById("statsBtn").onclick = showStatsModal;
document.getElementById("settingsBtn").onclick = openSettings;
document.getElementById("statsOverlay").addEventListener("click", (e) => {
  if (e.target.classList.contains("overlay"))
    e.target.classList.remove("show");
});

initSettings(render);
if (!resumeGame()) newGame(true);
