// ═══════════════════════════════════════════════════════
//  UNO — klasikinis kortų žaidimas (2–4 žaidėjai)
// ═══════════════════════════════════════════════════════

const UNO_COLORS = ["r", "y", "g", "b"];
const UNO_COLOR_NAMES = { r: "Raudona", y: "Geltona", g: "Žalia", b: "Mėlyna" };
const UNO_NUM_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const UNO_ACTION_VALUES = ["skip", "rev", "+2"];
const UNO_VALUE_LABEL = { skip: "⦸", rev: "⇄", "+2": "+2", wild: "★", "+4": "+4" };

const STORAGE_KEY = "uno_state_v1";
const UNO_DEADLINE_MS = 2000;
const UNO_COLOR_HEX = { r: "#d81e2a", y: "#f0b000", g: "#2d8f3c", b: "#1e5fb8" };

const STATE = {
  deck: [],
  discard: [],
  currentColor: null,
  direction: 1,
  currentPlayerId: 0,
  players: [],
  numPlayers: 4,
  phase: "idle",
  pendingWild: null,
  drewThisTurn: false,
  unoWatching: -1,
  gameActive: false,
  busy: false,
};

const topCard = () => STATE.discard[STATE.discard.length - 1];

const bot = createDeferredScheduler();
const scheduleBot = bot.schedule;
const cancelBot = bot.cancel;

const unoTimer = createDeferredScheduler();

const saver = createDebouncedSaver({
  key: STORAGE_KEY,
  serialize: () => ({
    deck: STATE.deck,
    discard: STATE.discard,
    currentColor: STATE.currentColor,
    direction: STATE.direction,
    currentPlayerId: STATE.currentPlayerId,
    players: STATE.players,
    numPlayers: STATE.numPlayers,
    phase: STATE.phase,
    pendingWild: STATE.pendingWild,
    drewThisTurn: STATE.drewThisTurn,
    gameActive: STATE.gameActive,
  }),
});

function saveState() {
  if (!STATE.gameActive) return;
  saver.save();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

const clearStoredState = () => saver.clear();

function nextPlayerId(from = STATE.currentPlayerId, dir = STATE.direction) {
  return (from + dir + STATE.numPlayers) % STATE.numPlayers;
}

function playerOf(id) { return STATE.players[id]; }
function isHuman(id) { return id === 0; }

function buildUnoDeck() {
  const deck = [];
  for (const c of UNO_COLORS) {
    deck.push({ color: c, value: "0" });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color: c, value: String(n) });
      deck.push({ color: c, value: String(n) });
    }
    for (const v of UNO_ACTION_VALUES) {
      deck.push({ color: c, value: v });
      deck.push({ color: c, value: v });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "w", value: "wild" });
    deck.push({ color: "w", value: "+4" });
  }
  return shuffle(deck);
}

function canPlay(card, color, value) {
  if (card.color === "w") return true;
  if (card.color === color) return true;
  if (card.value === value) return true;
  return false;
}

function drawFromDeck(n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (STATE.deck.length === 0) reshuffleDiscard();
    if (STATE.deck.length === 0) break;
    drawn.push(STATE.deck.pop());
  }
  return drawn;
}

function reshuffleDiscard() {
  if (STATE.discard.length <= 1) return;
  const keep = STATE.discard.pop();
  STATE.deck = shuffle(STATE.discard);
  STATE.discard = [keep];
}

function mkSpan(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

function mkUnoCardEl(card, faceUp = true) {
  const el = document.createElement("div");
  if (!faceUp) {
    el.className = "uno-card face-down";
    return el;
  }
  el.className = `uno-card color-${card.color}`;
  const label = UNO_VALUE_LABEL[card.value] || card.value;
  const oval = document.createElement("div");
  oval.className = "oval";
  el.appendChild(oval);
  el.appendChild(mkSpan("val-sm", label));
  el.appendChild(mkSpan("val", label));
  el.appendChild(mkSpan("val-sm br", label));
  return el;
}

function startGame(numPlayers) {
  cancelBot();
  unoTimer.cancel();
  numPlayers = numPlayers || 4;
  STATE.numPlayers = numPlayers;
  STATE.players = [];
  STATE.players.push({ id: 0, name: "Tu", isBot: false, hand: [], calledUno: false });
  for (let i = 1; i < numPlayers; i++) {
    STATE.players.push({
      id: i,
      name: numPlayers === 2 ? "Kompiuteris" : `Kompiuteris ${i}`,
      isBot: true,
      hand: [],
      calledUno: false,
    });
  }

  const deck = buildUnoDeck();
  for (let i = 0; i < 7; i++) {
    for (let pi = 0; pi < numPlayers; pi++) {
      STATE.players[pi].hand.push(deck.pop());
    }
  }
  let first = deck.pop();
  while (first.value === "+4") {
    deck.unshift(first);
    first = deck.pop();
  }
  STATE.deck = deck;
  STATE.discard = [first];
  STATE.currentColor = first.color === "w" ? UNO_COLORS[Math.floor(Math.random() * 4)] : first.color;
  STATE.direction = 1;
  STATE.currentPlayerId = 0;
  STATE.phase = "play";
  STATE.pendingWild = null;
  STATE.drewThisTurn = false;
  STATE.unoWatching = -1;
  STATE.gameActive = true;
  STATE.busy = false;

  applyStartCardEffect(first);

  setMsg("Pradedam!");
  saveState();
  render();
  maybeBotAct();
}

function applyStartCardEffect(card) {
  if (card.value === "skip") {
    STATE.currentPlayerId = nextPlayerId();
  } else if (card.value === "rev") {
    STATE.direction = -1;
    STATE.currentPlayerId = nextPlayerId(0, -1);
  } else if (card.value === "+2") {
    const victim = playerOf(0);
    victim.hand.push(...drawFromDeck(2));
    STATE.currentPlayerId = 1 % STATE.numPlayers;
  }
}

function restoreGame(snap) {
  cancelBot();
  unoTimer.cancel();
  Object.assign(STATE, {
    deck: snap.deck,
    discard: snap.discard,
    currentColor: snap.currentColor,
    direction: snap.direction,
    currentPlayerId: snap.currentPlayerId,
    players: snap.players,
    numPlayers: snap.numPlayers,
    phase: snap.phase,
    pendingWild: snap.pendingWild,
    drewThisTurn: snap.drewThisTurn,
    gameActive: snap.gameActive,
    busy: false,
    unoWatching: -1,
  });
  setMsg("Tęsiama partija");
  render();
  maybeBotAct();
}

function maybeBotAct() {
  if (!STATE.gameActive) return;
  if (STATE.phase === "gameOver") return;
  const p = playerOf(STATE.currentPlayerId);
  if (!p) return;
  if (STATE.phase === "pickColor" && p.isBot) {
    STATE.busy = true;
    render();
    scheduleBot(() => botPickColor(), 600);
    return;
  }
  if (!p.isBot) {
    STATE.busy = false;
    render();
    return;
  }
  STATE.busy = true;
  render();
  scheduleBot(() => botPlay(), 700);
}

function botPlay() {
  const p = playerOf(STATE.currentPlayerId);
  if (!p) return;
  const top = topCard();
  const playable = p.hand.filter((c) => canPlay(c, STATE.currentColor, top.value));
  if (playable.length === 0) {
    const drawn = drawFromDeck(1);
    if (drawn.length === 0) { advanceTurn(); return; }
    p.hand.push(drawn[0]);
    setMsg(`${p.name} ima kortą`);
    playSound("place");
    saveState();
    render();
    if (canPlay(drawn[0], STATE.currentColor, top.value)) {
      scheduleBot(() => playCardAsBot(drawn[0]), 500);
    } else {
      scheduleBot(() => advanceTurn(), 400);
    }
    return;
  }
  playable.sort((a, b) => botCardScore(a) - botCardScore(b));
  playCardAsBot(playable[0]);
}

function botCardScore(c) {
  if (c.value === "+4") return 5;
  if (c.value === "wild") return 4;
  if (UNO_NUM_VALUES.includes(c.value)) return 3;
  return 1;
}

function playCardAsBot(card) {
  const p = playerOf(STATE.currentPlayerId);
  if (p.hand.indexOf(card) === -1) return;
  if (p.hand.length - 1 === 1) {
    p.calledUno = Math.random() < 0.9;
  }
  commitPlay(card);
}

function botPickColor() {
  const p = playerOf(STATE.currentPlayerId);
  if (!p) return;
  const counts = { r: 0, y: 0, g: 0, b: 0 };
  for (const c of p.hand) if (c.color !== "w") counts[c.color]++;
  let bestColor = "r";
  let bestCount = -1;
  for (const c of UNO_COLORS) {
    if (counts[c] > bestCount) { bestCount = counts[c]; bestColor = c; }
  }
  applyColorChoice(bestColor);
}

function commitPlay(card) {
  const p = playerOf(STATE.currentPlayerId);
  const idx = p.hand.indexOf(card);
  if (idx === -1) return;
  p.hand.splice(idx, 1);
  STATE.discard.push(card);
  STATE.drewThisTurn = false;
  playSound("place");

  if (card.color !== "w") {
    STATE.currentColor = card.color;
  }

  const label = UNO_VALUE_LABEL[card.value] || card.value;
  setMsg(`${p.name}: ${label}${card.color !== "w" ? " " + UNO_COLOR_NAMES[card.color] : ""}`);

  if (p.hand.length === 0) {
    endGame(STATE.currentPlayerId);
    return;
  }

  if (p.hand.length === 1) {
    startUnoWindow(STATE.currentPlayerId);
  }

  if (card.color === "w") {
    STATE.phase = "pickColor";
    STATE.pendingWild = card;
    saveState();
    render();
    if (p.isBot) {
      scheduleBot(() => botPickColor(), 500);
    }
    return;
  }

  applyEffectAndAdvance(card);
}

function applyEffectAndAdvance(card) {
  if (card.value === "skip") {
    STATE.currentPlayerId = nextPlayerId();
    advanceTurn();
  } else if (card.value === "rev") {
    STATE.direction *= -1;
    if (STATE.numPlayers === 2) {
      STATE.currentPlayerId = nextPlayerId();
    }
    advanceTurn();
  } else if (card.value === "+2") {
    const victimId = nextPlayerId();
    const victim = playerOf(victimId);
    victim.hand.push(...drawFromDeck(2));
    setMsg(`${victim.name} ima 2 kortas`);
    STATE.currentPlayerId = victimId;
    advanceTurn();
  } else if (card.value === "+4") {
    const victimId = nextPlayerId();
    const victim = playerOf(victimId);
    victim.hand.push(...drawFromDeck(4));
    setMsg(`${victim.name} ima 4 kortas`);
    STATE.currentPlayerId = victimId;
    advanceTurn();
  } else {
    advanceTurn();
  }
}

function advanceTurn() {
  STATE.currentPlayerId = nextPlayerId();
  STATE.drewThisTurn = false;
  STATE.phase = "play";
  saveState();
  render();
  maybeBotAct();
}

function applyColorChoice(color) {
  STATE.currentColor = color;
  STATE.phase = "play";
  setMsg(`Spalva: ${UNO_COLOR_NAMES[color]}`);
  const wild = STATE.pendingWild;
  STATE.pendingWild = null;
  saveState();
  render();
  applyEffectAndAdvance(wild);
}

function startUnoWindow(playerId) {
  const p = playerOf(playerId);
  if (p.isBot) {
    if (p.calledUno) {
      setMsg(`${p.name}: UNO!`);
    } else {
      unoTimer.schedule(() => catchUno(playerId), 1500);
    }
    return;
  }
  STATE.unoWatching = playerId;
  render();
  unoTimer.schedule(() => catchUno(playerId), UNO_DEADLINE_MS);
}

function catchUno(playerId) {
  if (!STATE.gameActive || STATE.phase === "gameOver") return;
  if (STATE.unoWatching !== playerId && !playerOf(playerId).isBot) return;
  const p = playerOf(playerId);
  if (!p || p.hand.length !== 1 || p.calledUno) return;
  p.hand.push(...drawFromDeck(2));
  setMsg(`${p.name} pamiršo UNO! +2 kortos`);
  STATE.unoWatching = -1;
  saveState();
  render();
}

function humanCallUno() {
  const p = playerOf(0);
  if (p.hand.length !== 1) return;
  p.calledUno = true;
  STATE.unoWatching = -1;
  unoTimer.cancel();
  setMsg("UNO!");
  playSound("place");
  render();
}

function humanPlayCard(card) {
  if (STATE.busy || !STATE.gameActive) return;
  if (!isHuman(STATE.currentPlayerId)) return;
  if (STATE.phase !== "play") return;
  if (!canPlay(card, STATE.currentColor, topCard().value)) {
    setMsg("Korta netinkama");
    return;
  }
  commitPlay(card);
}

function humanDraw() {
  if (STATE.busy || !STATE.gameActive) return;
  if (!isHuman(STATE.currentPlayerId)) return;
  if (STATE.phase !== "play") return;
  if (STATE.drewThisTurn) return;
  const drawn = drawFromDeck(1);
  if (drawn.length === 0) { advanceTurn(); return; }
  const p = playerOf(0);
  p.hand.push(drawn[0]);
  STATE.drewThisTurn = true;
  const label = UNO_VALUE_LABEL[drawn[0].value] || drawn[0].value;
  setMsg(`Imi: ${label}`);
  playSound("place");
  saveState();
  render();
  if (!canPlay(drawn[0], STATE.currentColor, topCard().value)) {
    scheduleBot(() => {
      if (STATE.drewThisTurn && isHuman(STATE.currentPlayerId)) advanceTurn();
    }, 1500);
  }
}

function endGame(winnerId) {
  STATE.gameActive = false;
  STATE.phase = "gameOver";
  clearStoredState();
  const title = document.getElementById("gameOverTitle");
  const msg = document.getElementById("gameOverMsg");
  const winner = playerOf(winnerId);
  if (isHuman(winnerId)) {
    title.textContent = "Laimėjai!";
    msg.textContent = "Atsikratei visų kortų";
  } else {
    title.textContent = "Pralaimėjai";
    msg.textContent = `${winner.name} laimėjo`;
  }
  document.getElementById("gameOverOverlay").classList.add("show");
}

function render() {
  document.getElementById("deckCount").textContent = STATE.deck.length;

  const ccEl = document.getElementById("currentColor");
  clearEl(ccEl);
  if (STATE.currentColor) {
    const dot = document.createElement("span");
    dot.className = `uno-current-color c-${STATE.currentColor}`;
    ccEl.appendChild(dot);
  } else {
    ccEl.textContent = "—";
  }

  const dir = document.getElementById("directionArrow");
  dir.textContent = STATE.direction === 1 ? "↻" : "↺";
  dir.className = "uno-direction" + (STATE.direction === -1 ? " ccw" : "");

  const oppRow = document.getElementById("opponentsRow");
  clearEl(oppRow);
  for (let i = 1; i < STATE.numPlayers; i++) {
    const bot = STATE.players[i];
    const area = document.createElement("div");
    area.className = "opponent-area";
    area.style.position = "relative";
    if (i === STATE.currentPlayerId) area.classList.add("active");
    if (bot.hand.length === 1 && bot.calledUno) area.classList.add("uno-called");
    area.appendChild(mkSpan("opp-name", bot.name));
    area.appendChild(mkSpan("opp-cards", `${bot.hand.length} kortų`));
    const hand = document.createElement("div");
    hand.className = "opponent-hand";
    for (let k = 0; k < Math.min(bot.hand.length, 8); k++) {
      const mc = document.createElement("div");
      mc.className = "mini-card";
      hand.appendChild(mc);
    }
    area.appendChild(hand);
    oppRow.appendChild(area);
  }

  const deckEl = document.getElementById("deckPile");
  clearEl(deckEl);
  if (STATE.deck.length > 0) {
    deckEl.appendChild(mkUnoCardEl(null, false));
  }
  const canDraw =
    STATE.gameActive &&
    STATE.phase === "play" &&
    isHuman(STATE.currentPlayerId) &&
    !STATE.drewThisTurn;
  deckEl.className = "uno-deck-pile" + (canDraw ? "" : " disabled");

  const discEl = document.getElementById("discardPile");
  clearEl(discEl);
  const top = topCard();
  if (top) {
    const el = mkUnoCardEl(top, true);
    if (top.color === "w" && STATE.currentColor) {
      el.style.boxShadow = `0 0 0 4px ${UNO_COLOR_HEX[STATE.currentColor]}, 0 3px 8px rgba(0,0,0,0.4)`;
    }
    discEl.appendChild(el);
  }

  const hand = document.getElementById("playerHand");
  clearEl(hand);
  const me = STATE.players[0];
  if (me && top) {
    const myTurn = isHuman(STATE.currentPlayerId) && STATE.phase === "play" && STATE.gameActive;
    me.hand.forEach((c) => {
      const el = mkUnoCardEl(c, true);
      const playable = myTurn && canPlay(c, STATE.currentColor, top.value);
      el.classList.add(playable ? "playable" : "unplayable");
      el.addEventListener("click", () => humanPlayCard(c));
      hand.appendChild(el);
    });
  }

  const ti = document.getElementById("turnIndicator");
  const cur = playerOf(STATE.currentPlayerId);
  const curName = cur ? cur.name : "";
  if (STATE.phase === "pickColor") {
    if (isHuman(STATE.currentPlayerId)) {
      ti.textContent = "Pasirink spalvą";
    } else {
      ti.textContent = `${curName} renkasi spalvą…`;
    }
  } else if (isHuman(STATE.currentPlayerId)) {
    ti.textContent = "Tavo ėjimas";
  } else {
    ti.textContent = `${curName} galvoja…`;
  }

  const showUno = me && me.hand.length === 1 && !me.calledUno && STATE.unoWatching === 0;
  document.getElementById("unoBtn").style.display = showUno ? "" : "none";

  const showPass =
    STATE.gameActive &&
    STATE.phase === "play" &&
    isHuman(STATE.currentPlayerId) &&
    STATE.drewThisTurn;
  document.getElementById("passBtn").style.display = showPass ? "" : "none";

  const colorOverlay = document.getElementById("colorOverlay");
  if (STATE.phase === "pickColor" && isHuman(STATE.currentPlayerId)) {
    colorOverlay.classList.add("show");
  } else {
    colorOverlay.classList.remove("show");
  }
}

function setMsg(m) {
  const el = document.getElementById("msgLog");
  if (el) el.textContent = m;
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("rulesBtn").addEventListener("click", () => {
    document.getElementById("rulesOverlay").classList.add("show");
  });
  document.getElementById("newBtn").addEventListener("click", () => {
    if (STATE.gameActive && !confirm("Pradėt naują žaidimą?")) return;
    document.getElementById("playersOverlay").classList.add("show");
  });
  document.querySelectorAll(".player-count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.count, 10);
      document.getElementById("playersOverlay").classList.remove("show");
      startGame(n);
    });
  });
  document.getElementById("playersCancelBtn").addEventListener("click", () => {
    document.getElementById("playersOverlay").classList.remove("show");
  });
  document.getElementById("unoBtn").addEventListener("click", humanCallUno);
  document.getElementById("passBtn").addEventListener("click", () => advanceTurn());
  document.getElementById("deckPile").addEventListener("click", humanDraw);
  document.querySelectorAll(".uno-color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.color;
      document.getElementById("colorOverlay").classList.remove("show");
      applyColorChoice(color);
    });
  });
  document.getElementById("restartBtn").addEventListener("click", () => {
    document.getElementById("gameOverOverlay").classList.remove("show");
    document.getElementById("playersOverlay").classList.add("show");
  });

  const saved = loadState();
  if (saved && saved.gameActive && saved.players && saved.players.length >= 2) {
    restoreGame(saved);
  } else {
    startGame(4);
  }
});
