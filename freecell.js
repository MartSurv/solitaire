// ═══════════════════════════════════════════════════════
//  FREECELL GAME
// ═══════════════════════════════════════════════════════

let cells = [null, null, null, null];
let foundations = [[], [], [], []];
let tableau = [[], [], [], [], [], [], [], []];
let moveCount = 0;
const timer = createTimer();
let autoCompleting = false;

const SAVE_KEY = "freecell_game";

// ─── Persistence ────────────────────────────────────
const cc = (c) => (c ? { s: c.suit, r: c.rank } : null);
function rc(c) {
  return c ? { suit: c.s, rank: c.r, faceUp: true, id: `${c.r}${c.s}` } : null;
}

function snapshotState() {
  return {
    cells: cells.map(cc),
    foundations: foundations.map((f) => f.map(cc)),
    tableau: tableau.map((p) => p.map(cc)),
    moveCount,
  };
}
function restoreState(s) {
  cells = s.cells.map(rc);
  foundations = s.foundations.map((f) => f.map(rc));
  tableau = s.tableau.map((p) => p.map(rc));
  moveCount = s.moveCount;
}

const history = createGameHistory({ snapshot: snapshotState, restore: restoreState });

const saver = createDebouncedSaver({
  key: SAVE_KEY,
  serialize: () => {
    const state = snapshotState();
    state.timerSec = timer.get();
    state.history = history.exportRecent(10);
    return state;
  },
});
const saveGame = () => saver.save();
const clearSave = () => saver.clear();

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    restoreState(s);
    timer.set(s.timerSec || 0);
    history.loadFrom(s.history);
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Stats / Timer ──────────────────────────────────
function updStats() {
  document.getElementById("moves").textContent = moveCount;
}
function addMove() {
  moveCount++;
  timer.start();
  updStats();
  saveGame();
}

// ─── History ────────────────────────────────────────
const saveState = () => history.save();
function undo() {
  if (autoCompleting || !history.undo()) return;
  updStats();
  render();
  saveGame();
}
function redo() {
  if (autoCompleting || !history.redo()) return;
  updStats();
  render();
  saveGame();
}

// ─── Validation ─────────────────────────────────────
function canTab(card, pile) {
  if (!pile.length) return true;
  const t = pile[pile.length - 1];
  return isRed(card) !== isRed(t) && RV[card.rank] === RV[t.rank] - 1;
}

function maxMovable(excludePile) {
  let freeCells = cells.filter((c) => c === null).length;
  let emptyCols = 0;
  for (let i = 0; i < 8; i++) {
    if (i !== excludePile && !tableau[i].length) emptyCols++;
  }
  return (1 + freeCells) * Math.pow(2, emptyCols);
}

function isValidRun(pile, fromIdx) {
  for (let i = fromIdx; i < pile.length - 1; i++) {
    if (isRed(pile[i]) === isRed(pile[i + 1])) return false;
    if (RV[pile[i].rank] !== RV[pile[i + 1].rank] + 1) return false;
  }
  return true;
}

// ─── Move ───────────────────────────────────────────
function doMove(srcT, srcI, cIdx, dstT, dstI) {
  saveState();
  let movedCards;
  if (srcT === "tableau") movedCards = tableau[srcI].splice(cIdx);
  else if (srcT === "cell") {
    movedCards = [cells[srcI]];
    cells[srcI] = null;
  } else if (srcT === "foundation") movedCards = [foundations[srcI].pop()];

  if (dstT === "tableau") tableau[dstI].push(...movedCards);
  else if (dstT === "foundation") {
    foundations[dstI].push(...movedCards);
    playSound("score");
    const el = document.getElementById(`f${dstI}`);
    if (el) {
      const r = el.getBoundingClientRect(),
        gr = document.getElementById("game").getBoundingClientRect();
      showScorePop(
        10,
        r.left - gr.left + r.width / 2,
        r.top - gr.top + r.height / 2,
      );
    }
  } else if (dstT === "cell") cells[dstI] = movedCards[0];

  playSound("place");
  addMove();
  render();
  checkAutoComplete();
  checkWin();
}

// ─── Click: smart auto-move ─────────────────────────
function handleClick(card, srcT, srcI, cIdx, el) {
  if (autoCompleting) return;
  clearHints();
  const isSingle =
    srcT === "cell" ||
    (srcT === "tableau" && cIdx === tableau[srcI].length - 1);

  // Foundation
  if (isSingle) {
    const fi = findFnd(card, foundations);
    if (fi >= 0) {
      doMove(srcT, srcI, cIdx, "foundation", fi);
      return;
    }
  }

  // Tableau stack
  if (srcT === "tableau" && isValidRun(tableau[srcI], cIdx)) {
    const stackSize = tableau[srcI].length - cIdx;
    for (let pi = 0; pi < 8; pi++) {
      if (pi === srcI) continue;
      if (
        canTab(card, tableau[pi]) &&
        tableau[pi].length > 0 &&
        stackSize <= maxMovable(pi)
      ) {
        doMove(srcT, srcI, cIdx, "tableau", pi);
        return;
      }
    }
    for (let pi = 0; pi < 8; pi++) {
      if (pi === srcI) continue;
      if (!tableau[pi].length && stackSize <= maxMovable(pi)) {
        doMove(srcT, srcI, cIdx, "tableau", pi);
        return;
      }
    }
  }
  if (srcT === "cell") {
    for (let pi = 0; pi < 8; pi++)
      if (canTab(card, tableau[pi]) && tableau[pi].length > 0) {
        doMove(srcT, srcI, 0, "tableau", pi);
        return;
      }
    for (let pi = 0; pi < 8; pi++)
      if (!tableau[pi].length) {
        doMove(srcT, srcI, 0, "tableau", pi);
        return;
      }
  }

  // Free cell
  if (isSingle) {
    for (let ci = 0; ci < 4; ci++)
      if (cells[ci] === null) {
        doMove(srcT, srcI, cIdx, "cell", ci);
        return;
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
  if (autoCompleting) return;
  const fi = findFnd(card, foundations);
  if (fi >= 0) doMove(srcT, srcI, cIdx, "foundation", fi);
}

// ─── Hint ───────────────────────────────────────────
function findHint() {
  const moves = [];
  const freeCount = cells.filter((c) => c === null).length;

  // Cell → foundation (always a small win: frees a cell)
  for (let ci = 0; ci < 4; ci++) {
    const c = cells[ci];
    if (!c) continue;
    const fi = findFnd(c, foundations);
    if (fi >= 0) {
      moves.push({
        srcT: "cell", srcI: ci,
        dstT: "foundation", dstI: fi,
        score: scoreFoundationMove(c, foundations) + 50,
      });
    }
  }

  // Tableau top → foundation
  for (let pi = 0; pi < 8; pi++) {
    const p = tableau[pi];
    if (!p.length) continue;
    const top = p[p.length - 1];
    const fi = findFnd(top, foundations);
    if (fi >= 0) {
      let s = scoreFoundationMove(top, foundations);
      // Reveals a card that itself can go to foundation — chain reaction
      if (p.length >= 2 && findFnd(p[p.length - 2], foundations) >= 0) s += 200;
      // Empties a cascade — huge in FreeCell (doubles movable stack size)
      if (p.length === 1) s += 300;
      moves.push({
        srcT: "tableau", srcI: pi, cIdx: p.length - 1,
        dstT: "foundation", dstI: fi, score: s,
      });
    }
  }

  // Tableau → tableau (single card or valid run)
  for (let pi = 0; pi < 8; pi++) {
    const p = tableau[pi];
    if (!p.length) continue;
    for (let ci = 0; ci < p.length; ci++) {
      if (!isValidRun(p, ci)) continue;
      const stackSize = p.length - ci;
      for (let di = 0; di < 8; di++) {
        if (di === pi) continue;
        if (stackSize > maxMovable(di)) continue;
        const dst = tableau[di];
        if (dst.length && !canTab(p[ci], dst)) continue;

        let s = 30;
        // Reveals a foundation-playable card underneath.
        if (ci > 0 && findFnd(p[ci - 1], foundations) >= 0) s += 600;
        // Empties a cascade — huge, but only if destination isn't also empty
        // (that would be a pure lateral shuffle).
        if (ci === 0) s += dst.length ? 800 : -100;
        // Prefer consolidating onto an existing run rather than opening space.
        if (dst.length) s += 20;
        // Bigger purposeful moves rank slightly higher.
        s += Math.min(stackSize, 5) * 5;
        moves.push({
          srcT: "tableau", srcI: pi, cIdx: ci,
          dstT: "tableau", dstI: di, score: s,
        });
      }
    }
  }

  // Cell → tableau (frees a cell — more valuable when cells are full)
  for (let ci = 0; ci < 4; ci++) {
    const c = cells[ci];
    if (!c) continue;
    for (let pi = 0; pi < 8; pi++) {
      const dst = tableau[pi];
      if (dst.length && !canTab(c, dst)) continue;
      let s = 120 + (4 - freeCount) * 30;
      // Burning a cell card into an empty column usually costs more than it
      // saves (empty columns are worth more than free cells for big moves).
      if (!dst.length) s -= 100;
      moves.push({
        srcT: "cell", srcI: ci,
        dstT: "tableau", dstI: pi, score: s,
      });
    }
  }

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
  let srcEl = null;
  if (h.srcT === "cell")
    srcEl = document.getElementById(`c${h.srcI}`).querySelector(".card");
  else if (h.srcT === "tableau") {
    const all = document.getElementById(`p${h.srcI}`).querySelectorAll(".card");
    srcEl = all[h.cIdx];
  }
  if (srcEl) srcEl.classList.add("hinted");
  if (h.dstT === "tableau") {
    const pe = document.getElementById(`p${h.dstI}`);
    (pe.querySelector(".card:last-child") || pe).classList.add("hinted");
  }
  hintTimeout = setTimeout(clearHints, 2500);
}

// ─── Win / Auto ─────────────────────────────────────
function checkWin() {
  if (foundations.every((f) => f.length === 13)) {
    timer.stop();
    autoCompleting = false;
    document.getElementById("autoBanner").classList.remove("show");
    setTimeout(() => {
      playSound("win");
      clearSave();
      if (window.triggerWinEffect) window.triggerWinEffect();
      runWinCascade();
      setTimeout(() => {
        document.getElementById("fMoves").textContent = moveCount;
        document.getElementById("fTime").textContent = fmt(timer.get());
        document.getElementById("winOverlay").classList.add("show");
      }, 3000);
    }, 400);
  }
}

function checkAutoComplete() {
  if (autoCompleting) return;
  const allOrdered = tableau.every((p) => {
    for (let i = 0; i < p.length - 1; i++)
      if (RV[p[i].rank] < RV[p[i + 1].rank]) return false;
    return true;
  });
  if (allOrdered && cells.every((c) => c === null))
    document.getElementById("autoBanner").classList.add("show");
  else checkStuck();
}

function checkStuck() {
  if (autoCompleting) return;
  document.getElementById("stuckBanner").classList.remove("show");
  for (let ci = 0; ci < 4; ci++) {
    if (cells[ci] && findFnd(cells[ci], foundations) >= 0) return;
  }
  for (let pi = 0; pi < 8; pi++) {
    const p = tableau[pi];
    if (p.length && findFnd(p[p.length - 1], foundations) >= 0) return;
  }
  if (cells.some((c) => c === null)) return;
  for (let pi = 0; pi < 8; pi++) {
    const p = tableau[pi];
    if (!p.length) continue;
    for (let ci = 0; ci < p.length; ci++) {
      if (!isValidRun(p, ci)) continue;
      for (let di = 0; di < 8; di++) {
        if (di === pi) continue;
        if (canTab(p[ci], tableau[di]) && p.length - ci <= maxMovable(di))
          return;
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
  for (let ci = 0; ci < 4; ci++) {
    if (!cells[ci]) continue;
    const fi = findFnd(cells[ci], foundations);
    if (fi >= 0) {
      doMove("cell", ci, 0, "foundation", fi);
      moved = true;
      break;
    }
  }
  if (!moved) {
    for (let pi = 0; pi < 8; pi++) {
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
  renderCells();
  renderFnd();
  renderTab();
  document.getElementById("undoBtn").disabled = !history.canUndo();
  document.getElementById("redoBtn").disabled = !history.canRedo();
}

function renderCells() {
  cells.forEach((c, ci) => {
    const el = document.getElementById(`c${ci}`);
    el.querySelectorAll(".card").forEach((x) => x.remove());
    if (c) {
      const ce = mkEl(c);
      ce.style.cssText = "position:absolute;left:0;top:0";
      drag.bind(ce, c, "cell", ci, 0);
      el.appendChild(ce);
    }
  });
}

function renderFnd() {
  foundations.forEach((f, fi) => {
    const el = document.getElementById(`f${fi}`);
    el.querySelectorAll(".card").forEach((x) => x.remove());
    if (f.length) {
      const c = f[f.length - 1],
        ce = mkEl(c);
      ce.style.cssText = "position:absolute;left:0;top:0";
      drag.bind(ce, c, "foundation", fi, f.length - 1);
      el.appendChild(ce);
    }
  });
}

function renderTab() {
  const cs = getComputedStyle(document.documentElement);
  const fan = parseFloat(cs.getPropertyValue("--fan-fc")) || 24;
  const cardH = parseFloat(cs.getPropertyValue("--ch")) || 147;
  tableau.forEach((pile, pi) => {
    const el = document.getElementById(`p${pi}`);
    el.querySelectorAll(".card").forEach((x) => x.remove());
    pile.forEach((c, ci) => {
      const ce = mkEl(c);
      const top = ci * fan;
      ce.style.cssText = `position:absolute;left:0;top:${top}px;z-index:${ci + 1}`;
      drag.bind(ce, c, "tableau", pi, ci);
      el.appendChild(ce);
    });
    let h = cardH;
    pile.forEach((c, i) => {
      if (i > 0) h += fan;
    });
    el.style.minHeight = h + "px";
  });
}

// ═══════════════════════════════════════════════════════
//  INTERACTION
// ═══════════════════════════════════════════════════════
const drag = createDragController({
  fanVar: "--fan-fc",
  fanFallback: 24,
  canDragStart: () => !autoCompleting,
  collectDragGroup: (el, card, srcT, srcI, cIdx) => {
    if (srcT === "tableau" && isValidRun(tableau[srcI], cIdx)) {
      const all = document.getElementById(`p${srcI}`).querySelectorAll(".card");
      const cards = [], els = [];
      for (let i = cIdx; i < tableau[srcI].length; i++) {
        cards.push(tableau[srcI][i]);
        els.push(all[i]);
      }
      return { cards, els };
    }
    return { cards: [card], els: [el] };
  },
  onShowDrop: (ds) => showDrop(ds.cards[0], ds.srcT, ds.srcI, ds.cards.length),
  onClick: handleClick,
  onRightClick: handleRightClick,
  dropHandlers: [
    (target, ds) => {
      const fs = target.closest(".foundation");
      if (!fs || ds.cards.length !== 1) return false;
      const fi = +fs.id[1];
      if (!canFnd(ds.cards[0], fi, foundations)) return false;
      doMove(ds.srcT, ds.srcI, ds.cIdx, "foundation", fi);
      return true;
    },
    (target, ds) => {
      const cs = target.closest(".freecell-slot");
      if (!cs || ds.cards.length !== 1) return false;
      const ci = +cs.id[1];
      if (cells[ci] !== null) return false;
      doMove(ds.srcT, ds.srcI, ds.cIdx, "cell", ci);
      return true;
    },
    (target, ds) => {
      const pe = target.closest(".pile");
      if (!pe) return false;
      const pi = +pe.id[1];
      if (!canTab(ds.cards[0], tableau[pi])) return false;
      if (ds.cards.length > maxMovable(pi)) return false;
      doMove(ds.srcT, ds.srcI, ds.cIdx, "tableau", pi);
      return true;
    },
  ],
  onDropFail: () => { playSound("invalid"); render(); },
  onCancel: () => render(),
});

function showDrop(card, srcT, srcI, stackSize) {
  for (let fi = 0; fi < 4; fi++)
    if (stackSize === 1 && canFnd(card, fi, foundations))
      document
        .getElementById(`f${fi}`)
        .classList.add("highlight", "highlight-pulse");
  for (let ci = 0; ci < 4; ci++)
    if (stackSize === 1 && cells[ci] === null)
      document.getElementById(`c${ci}`).classList.add("highlight");
  for (let pi = 0; pi < 8; pi++) {
    if (srcT === "tableau" && pi === srcI) continue;
    if (canTab(card, tableau[pi]) && stackSize <= maxMovable(pi))
      document.getElementById(`p${pi}`).classList.add("highlight");
  }
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
function newGame() {
  if (window._stopCascade) window._stopCascade();
  timer.reset();
  document.getElementById("winOverlay").classList.remove("show");
  document.getElementById("autoBanner").classList.remove("show");
  document.getElementById("stuckBanner").classList.remove("show");
  autoCompleting = false;
  drag.reset();
  clearSave();

  const deck = shuffle(mkDeck(true));
  cells = [null, null, null, null];
  foundations = [[], [], [], []];
  tableau = [[], [], [], [], [], [], [], []];
  history.clear();
  moveCount = 0;
  updStats();

  let idx = 0;
  for (let ci = 0; ci < 8; ci++) {
    const count = ci < 4 ? 7 : 6;
    for (let ri = 0; ri < count; ri++) tableau[ci].push(deck[idx++]);
  }

  render();
  saveGame();
}

function resumeGame() {
  if (!loadGame()) return false;
  updStats();
  render();
  if (timer.get() > 0) timer.start();
  return true;
}

document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;
document.getElementById("newBtn").onclick = newGame;
document.getElementById("autoBtn").onclick = runAuto;
document.getElementById("stuckNewBtn").onclick = newGame;
document.getElementById("playAgainBtn").onclick = newGame;
document.getElementById("hintBtn").onclick = showHint;
document.getElementById("settingsBtn").onclick = openSettings;
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }
  if (e.key === "h" || e.key === "H") showHint();
});

initSettings(render);
if (!resumeGame()) newGame();
