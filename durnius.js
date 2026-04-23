// ═══════════════════════════════════════════════════════
//  DURNIUS — lietuviškas kortų žaidimas (2–4 žaidėjai)
// ═══════════════════════════════════════════════════════

const DURNIUS_RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const DRV = {};
DURNIUS_RANKS.forEach((r, i) => (DRV[r] = i));

const STORAGE_KEY = "durnius_state_v2";

function clearEl(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

const STATE = {
  deck: [],
  trumpSuit: null,
  trumpCard: null,
  discardCount: 0,
  players: [],
  numPlayers: 2,
  attackerId: 0,
  defenderId: 1,
  currentPlayerId: 0,
  pairs: [],
  throwQueue: [],
  throwIdx: 0,
  phase: "idle",
  selectedCard: null,
  busy: false,
  gameActive: false,
};

let botTimer = null;

function saveState() {
  if (!STATE.gameActive) return;
  try {
    const snap = {
      deck: STATE.deck,
      trumpSuit: STATE.trumpSuit,
      trumpCard: STATE.trumpCard,
      discardCount: STATE.discardCount,
      players: STATE.players,
      numPlayers: STATE.numPlayers,
      attackerId: STATE.attackerId,
      defenderId: STATE.defenderId,
      currentPlayerId: STATE.currentPlayerId,
      pairs: STATE.pairs,
      throwQueue: STATE.throwQueue,
      throwIdx: STATE.throwIdx,
      phase: STATE.phase,
      gameActive: STATE.gameActive,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch (e) {}
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

function clearStoredState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

function nextId(id) { return (id + 1) % STATE.numPlayers; }
function playerOf(id) { return STATE.players[id]; }
function isHuman(id) { return id === 0; }

function buildDurniusDeck() {
  const d = [];
  for (const s of SUITS) for (const r of DURNIUS_RANKS) d.push(mkCard(s, r, true));
  return shuffle(d);
}

function sortDurniusHand(hand, trump) {
  hand.sort((a, b) => {
    const at = a.suit === trump ? 1 : 0;
    const bt = b.suit === trump ? 1 : 0;
    if (at !== bt) return at - bt;
    const rd = DRV[a.rank] - DRV[b.rank];
    if (rd !== 0) return rd;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });
}

function beats(attack, defense, trump) {
  if (defense.suit === attack.suit) return DRV[defense.rank] > DRV[attack.rank];
  if (defense.suit === trump && attack.suit !== trump) return true;
  return false;
}

function findLowestTrump(hand, trump) {
  let best = null;
  for (const c of hand) {
    if (c.suit === trump) {
      if (!best || DRV[c.rank] < DRV[best.rank]) best = c;
    }
  }
  return best;
}

function canAttackWith(card, pairs) {
  if (pairs.length === 0) return true;
  const ranksOnTable = new Set();
  for (const p of pairs) {
    ranksOnTable.add(p.attack.rank);
    if (p.defense) ranksOnTable.add(p.defense.rank);
  }
  return ranksOnTable.has(card.rank);
}

function maxAttackSlots() {
  const defHand = playerOf(STATE.defenderId).hand.length;
  const beaten = STATE.pairs.filter((p) => p.defense).length;
  return Math.min(6, beaten + defHand);
}

function startGame(numPlayers) {
  if (botTimer) { clearTimeout(botTimer); botTimer = null; }
  numPlayers = numPlayers || 2;
  STATE.numPlayers = numPlayers;
  STATE.players = [];
  STATE.players.push({ id: 0, name: "Tu", isBot: false, hand: [] });
  for (let i = 1; i < numPlayers; i++) {
    STATE.players.push({
      id: i,
      name: numPlayers === 2 ? "Kompiuteris" : `Kompiuteris ${i}`,
      isBot: true,
      hand: [],
    });
  }

  const deck = buildDurniusDeck();
  STATE.trumpCard = deck[0];
  STATE.trumpSuit = STATE.trumpCard.suit;
  for (let i = 0; i < 6; i++) {
    for (let pi = 0; pi < numPlayers; pi++) {
      STATE.players[pi].hand.push(deck.pop());
    }
  }
  STATE.deck = deck;
  STATE.pairs = [];
  STATE.discardCount = 0;
  STATE.selectedCard = null;
  STATE.busy = false;
  STATE.gameActive = true;
  STATE.throwQueue = [];
  STATE.throwIdx = 0;

  STATE.players.forEach((p) => sortDurniusHand(p.hand, STATE.trumpSuit));

  let firstAttacker = 0;
  let lowest = 999;
  for (const p of STATE.players) {
    const lt = findLowestTrump(p.hand, STATE.trumpSuit);
    if (lt && DRV[lt.rank] < lowest) {
      lowest = DRV[lt.rank];
      firstAttacker = p.id;
    }
  }
  STATE.attackerId = firstAttacker;
  STATE.defenderId = nextId(firstAttacker);
  STATE.currentPlayerId = firstAttacker;
  STATE.phase = "attack";

  setMsg(
    isHuman(firstAttacker)
      ? "Tu puoli pirmas (turėjai mažiausią kozirį)"
      : `${playerOf(firstAttacker).name} puola pirmas`,
  );
  saveState();
  render();
  maybeBotAct();
}

function restoreGame(snap) {
  if (botTimer) { clearTimeout(botTimer); botTimer = null; }
  STATE.deck = snap.deck;
  STATE.trumpSuit = snap.trumpSuit;
  STATE.trumpCard = snap.trumpCard;
  STATE.discardCount = snap.discardCount;
  STATE.players = snap.players;
  STATE.numPlayers = snap.numPlayers;
  STATE.attackerId = snap.attackerId;
  STATE.defenderId = snap.defenderId;
  STATE.currentPlayerId = snap.currentPlayerId;
  STATE.pairs = snap.pairs;
  STATE.throwQueue = snap.throwQueue || [];
  STATE.throwIdx = snap.throwIdx || 0;
  STATE.phase = snap.phase;
  STATE.gameActive = snap.gameActive;
  STATE.selectedCard = null;
  STATE.busy = false;
  setMsg("Tęsiama anksčiau pradėta partija");
  render();
  maybeBotAct();
}

function maybeBotAct() {
  if (!STATE.gameActive) return;
  const p = playerOf(STATE.currentPlayerId);
  if (!p || !p.isBot) { STATE.busy = false; render(); return; }
  STATE.busy = true;
  render();
  botTimer = setTimeout(() => {
    botTimer = null;
    if (STATE.phase === "attack") botAttack();
    else if (STATE.phase === "defend") botDefend();
    else if (STATE.phase === "throwIn") botThrowIn();
  }, 800);
}

function botAttack() {
  const p = playerOf(STATE.currentPlayerId);
  const sorted = [...p.hand].sort((a, b) => {
    const at = a.suit === STATE.trumpSuit ? 1 : 0;
    const bt = b.suit === STATE.trumpSuit ? 1 : 0;
    if (at !== bt) return at - bt;
    return DRV[a.rank] - DRV[b.rank];
  });
  if (sorted.length === 0) { checkGameOver(); return; }
  playAttackCard(STATE.currentPlayerId, sorted[0]);
}

function playAttackCard(playerId, card) {
  const p = playerOf(playerId);
  const idx = p.hand.indexOf(card);
  if (idx === -1) return;
  p.hand.splice(idx, 1);
  STATE.pairs.push({ attack: card, defense: null });
  setMsg(`${p.name}: ${card.rank}${card.suit}`);
  try { playSound("place"); } catch (e) {}
  STATE.phase = "defend";
  STATE.currentPlayerId = STATE.defenderId;
  saveState();
  render();
  maybeBotAct();
}

function botDefend() {
  const p = playerOf(STATE.currentPlayerId);
  const pairIdx = STATE.pairs.findIndex((pp) => !pp.defense);
  if (pairIdx === -1) { startThrowIn(); return; }
  const pair = STATE.pairs[pairIdx];
  let best = null;
  for (const c of p.hand) {
    if (beats(pair.attack, c, STATE.trumpSuit)) {
      const score = (c.suit === STATE.trumpSuit ? 100 : 0) + DRV[c.rank];
      if (best === null || score < best.score) best = { card: c, score };
    }
  }
  if (!best) { takeAll(STATE.currentPlayerId); return; }
  defendCard(STATE.currentPlayerId, best.card, pairIdx);
}

function defendCard(playerId, card, pairIdx) {
  const p = playerOf(playerId);
  const pair = STATE.pairs[pairIdx];
  if (!pair || pair.defense) return;
  const idx = p.hand.indexOf(card);
  if (idx === -1) return;
  p.hand.splice(idx, 1);
  pair.defense = card;
  STATE.selectedCard = null;
  try { playSound("place"); } catch (e) {}
  setMsg(`${p.name} muša: ${card.rank}${card.suit}`);
  saveState();
  render();

  const remaining = STATE.pairs.filter((pp) => !pp.defense).length;
  if (remaining === 0) {
    setTimeout(startThrowIn, 600);
  } else {
    setTimeout(maybeBotAct, 400);
  }
}

function takeAll(playerId) {
  const p = playerOf(playerId);
  for (const pair of STATE.pairs) {
    p.hand.push(pair.attack);
    if (pair.defense) p.hand.push(pair.defense);
  }
  sortDurniusHand(p.hand, STATE.trumpSuit);
  STATE.pairs = [];
  setMsg(`${p.name} ima kortas`);
  try { playSound("place"); } catch (e) {}
  endRound(true);
}

function startThrowIn() {
  STATE.throwQueue = [];
  let id = STATE.attackerId;
  for (let i = 0; i < STATE.numPlayers; i++) {
    if (id !== STATE.defenderId) STATE.throwQueue.push(id);
    id = nextId(id);
  }
  STATE.throwIdx = 0;
  pollThrow();
}

function pollThrow() {
  const defHandSize = playerOf(STATE.defenderId).hand.length;
  const undefended = STATE.pairs.filter((p) => !p.defense).length;
  const atLimit = STATE.pairs.length >= 6 || undefended >= defHandSize;

  while (STATE.throwIdx < STATE.throwQueue.length) {
    if (atLimit) { STATE.throwIdx = STATE.throwQueue.length; break; }
    const tid = STATE.throwQueue[STATE.throwIdx];
    const thrower = playerOf(tid);
    const hasCard = thrower.hand.some((c) => canAttackWith(c, STATE.pairs));
    if (!hasCard) { STATE.throwIdx++; continue; }
    STATE.currentPlayerId = tid;
    STATE.phase = "throwIn";
    saveState();
    render();
    maybeBotAct();
    return;
  }
  endRound(false);
}

function botThrowIn() {
  const p = playerOf(STATE.currentPlayerId);
  const candidates = p.hand.filter((c) => canAttackWith(c, STATE.pairs));
  candidates.sort((a, b) => {
    const at = a.suit === STATE.trumpSuit ? 1 : 0;
    const bt = b.suit === STATE.trumpSuit ? 1 : 0;
    if (at !== bt) return at - bt;
    return DRV[a.rank] - DRV[b.rank];
  });
  if (candidates.length === 0 || Math.random() < 0.3) {
    setMsg(`${p.name}: praleidžiu`);
    STATE.throwIdx++;
    pollThrow();
    return;
  }
  throwInCard(STATE.currentPlayerId, candidates[0]);
}

function throwInCard(playerId, card) {
  const p = playerOf(playerId);
  const idx = p.hand.indexOf(card);
  if (idx === -1) return;
  p.hand.splice(idx, 1);
  STATE.pairs.push({ attack: card, defense: null });
  setMsg(`${p.name} prideda: ${card.rank}${card.suit}`);
  try { playSound("place"); } catch (e) {}
  STATE.phase = "defend";
  STATE.currentPlayerId = STATE.defenderId;
  saveState();
  render();
  maybeBotAct();
}

function humanPass() {
  if (STATE.phase !== "throwIn" || !isHuman(STATE.currentPlayerId)) return;
  setMsg("Tu: praleidi");
  STATE.throwIdx++;
  pollThrow();
}

function humanTake() {
  if (STATE.phase !== "defend" || !isHuman(STATE.currentPlayerId)) return;
  takeAll(0);
}

function endRound(defenderTook) {
  if (!defenderTook) {
    STATE.discardCount += STATE.pairs.length * 2;
    STATE.pairs = [];
  }
  refillHands();
  if (checkGameOver()) return;

  if (defenderTook) {
    STATE.attackerId = nextId(STATE.defenderId);
  } else {
    STATE.attackerId = STATE.defenderId;
  }
  STATE.defenderId = nextId(STATE.attackerId);
  // skip finished players
  let guard = 0;
  while (playerOf(STATE.attackerId).hand.length === 0 && guard < STATE.numPlayers) {
    STATE.attackerId = nextId(STATE.attackerId);
    guard++;
  }
  STATE.defenderId = nextId(STATE.attackerId);
  guard = 0;
  while (playerOf(STATE.defenderId).hand.length === 0 && guard < STATE.numPlayers) {
    STATE.defenderId = nextId(STATE.defenderId);
    guard++;
  }

  STATE.pairs = [];
  STATE.selectedCard = null;
  STATE.throwQueue = [];
  STATE.throwIdx = 0;
  STATE.phase = "attack";
  STATE.currentPlayerId = STATE.attackerId;

  saveState();
  render();
  maybeBotAct();
}

function refillHands() {
  const order = [STATE.attackerId];
  let id = nextId(STATE.attackerId);
  while (id !== STATE.attackerId) {
    if (id !== STATE.defenderId) order.push(id);
    id = nextId(id);
  }
  order.push(STATE.defenderId);

  for (const pid of order) {
    const p = playerOf(pid);
    while (p.hand.length < 6 && STATE.deck.length > 0) {
      p.hand.push(STATE.deck.pop());
    }
    sortDurniusHand(p.hand, STATE.trumpSuit);
  }
}

function checkGameOver() {
  if (STATE.deck.length > 0) return false;
  const withCards = STATE.players.filter((p) => p.hand.length > 0);
  if (withCards.length <= 1) {
    STATE.gameActive = false;
    clearStoredState();
    showGameOver(withCards[0] || null);
    return true;
  }
  return false;
}

function render() {
  document.getElementById("trumpSuit").textContent = STATE.trumpSuit || "—";
  document.getElementById("deckCount").textContent = STATE.deck.length;
  document.getElementById("discardCount").textContent = STATE.discardCount;

  const oppRow = document.getElementById("opponentsRow");
  clearEl(oppRow);
  for (let i = 1; i < STATE.numPlayers; i++) {
    const bot = STATE.players[i];
    const area = document.createElement("div");
    area.className = "opponent-area";
    if (i === STATE.currentPlayerId) area.classList.add("active");
    const info = document.createElement("div");
    info.className = "opponent-info";
    const nm = document.createElement("div");
    nm.className = "opp-name";
    nm.textContent = bot.name;
    const cc = document.createElement("div");
    cc.className = "opp-cards";
    cc.textContent = `${bot.hand.length} kortų`;
    info.appendChild(nm);
    info.appendChild(cc);
    const hand = document.createElement("div");
    hand.className = "opponent-hand";
    for (let k = 0; k < bot.hand.length; k++) {
      const mc = document.createElement("div");
      mc.className = "mini-card";
      hand.appendChild(mc);
    }
    area.appendChild(info);
    area.appendChild(hand);
    oppRow.appendChild(area);
  }

  const deckEl = document.getElementById("deckPile");
  clearEl(deckEl);
  if (STATE.deck.length > 0) {
    const back = mkCard("♠", "A", false);
    deckEl.appendChild(mkEl(back));
  }
  const trumpEl = document.getElementById("trumpCard");
  clearEl(trumpEl);
  if (STATE.trumpCard && STATE.deck.length > 0) {
    trumpEl.appendChild(mkEl(STATE.trumpCard));
  }

  const discEl = document.getElementById("discardStack");
  clearEl(discEl);
  if (STATE.discardCount > 0) {
    const back = mkCard("♠", "A", false);
    discEl.appendChild(mkEl(back));
  }

  const bf = document.getElementById("battlefield");
  clearEl(bf);
  STATE.pairs.forEach((pair, idx) => {
    const bp = document.createElement("div");
    bp.className = "battle-pair";
    const att = mkEl(pair.attack);
    att.classList.add("attack-card");
    bp.appendChild(att);
    if (pair.defense) {
      const def = mkEl(pair.defense);
      def.classList.add("defense-card");
      bp.appendChild(def);
    } else if (STATE.phase === "defend" && isHuman(STATE.currentPlayerId)) {
      bp.classList.add("pending-defend");
      bp.addEventListener("click", () => {
        if (STATE.selectedCard) {
          tryHumanDefend(STATE.selectedCard, idx);
        } else {
          setMsg("Pirma pasirink kortą rankoje");
        }
      });
    }
    bf.appendChild(bp);
  });

  const player = STATE.players[0];
  const hand = document.getElementById("playerHand");
  clearEl(hand);
  if (player) {
    player.hand.forEach((c) => {
      const el = mkEl(c);
      let playable = false;
      const myTurn = isHuman(STATE.currentPlayerId);
      if (myTurn) {
        if (STATE.phase === "attack") {
          playable = STATE.pairs.length === 0 || canAttackWith(c, STATE.pairs);
        } else if (STATE.phase === "throwIn") {
          playable = canAttackWith(c, STATE.pairs) && STATE.pairs.length < 6;
        } else if (STATE.phase === "defend") {
          const unbeat = STATE.pairs.filter((p) => !p.defense).map((p) => p.attack);
          playable = unbeat.some((a) => beats(a, c, STATE.trumpSuit));
        }
      }
      el.classList.add(playable ? "playable" : "unplayable");
      if (STATE.selectedCard === c) el.classList.add("selected");
      el.addEventListener("click", () => handleHandClick(c));
      hand.appendChild(el);
    });
  }

  const ti = document.getElementById("turnIndicator");
  const curName = playerOf(STATE.currentPlayerId)
    ? playerOf(STATE.currentPlayerId).name
    : "";
  if (isHuman(STATE.currentPlayerId)) {
    if (STATE.phase === "attack") ti.textContent = "Tavo ėjimas — puoli";
    else if (STATE.phase === "defend") ti.textContent = "Tavo ėjimas — gynyba";
    else if (STATE.phase === "throwIn") ti.textContent = "Pridėti kortą arba praleisti";
    else ti.textContent = "";
  } else {
    if (STATE.phase === "attack") ti.textContent = `${curName} puola…`;
    else if (STATE.phase === "defend") ti.textContent = `${curName} gina…`;
    else if (STATE.phase === "throwIn") ti.textContent = `${curName} sprendžia…`;
    else ti.textContent = "";
  }

  const humanTurn = isHuman(STATE.currentPlayerId) && STATE.gameActive;
  document.getElementById("takeBtn").style.display =
    humanTurn && STATE.phase === "defend" ? "" : "none";
  document.getElementById("bitaBtn").style.display =
    humanTurn && STATE.phase === "throwIn" ? "" : "none";
}

function tryHumanDefend(card, pairIdx) {
  const pair = STATE.pairs[pairIdx];
  if (!pair || pair.defense) return;
  if (!beats(pair.attack, card, STATE.trumpSuit)) {
    setMsg(`${card.rank}${card.suit} negali mušt ${pair.attack.rank}${pair.attack.suit}`);
    return;
  }
  defendCard(0, card, pairIdx);
}

function handleHandClick(card) {
  if (STATE.busy || !STATE.gameActive) return;
  if (!isHuman(STATE.currentPlayerId)) return;

  if (STATE.phase === "attack") {
    if (STATE.pairs.length === 0 || canAttackWith(card, STATE.pairs)) {
      playAttackCard(0, card);
    } else {
      setMsg("Tik tokios vertės, kurios jau ant stalo");
    }
  } else if (STATE.phase === "throwIn") {
    if (STATE.pairs.length >= 6) {
      setMsg("Maksimaliai 6 kortų poros");
      return;
    }
    const undef = STATE.pairs.filter((p) => !p.defense).length;
    if (undef >= playerOf(STATE.defenderId).hand.length) {
      setMsg("Gynėjas neturi pakankamai kortų");
      return;
    }
    if (canAttackWith(card, STATE.pairs)) {
      throwInCard(0, card);
    } else {
      setMsg("Tik tokios vertės, kurios jau ant stalo");
    }
  } else if (STATE.phase === "defend") {
    const undefs = [];
    STATE.pairs.forEach((p, i) => { if (!p.defense) undefs.push(i); });
    if (undefs.length === 1) {
      tryHumanDefend(card, undefs[0]);
    } else {
      STATE.selectedCard = STATE.selectedCard === card ? null : card;
      render();
      setMsg("Pasirink puolančią kortą ant stalo");
    }
  }
}

function setMsg(m) {
  const el = document.getElementById("msgLog");
  if (el) el.textContent = m;
}

function showGameOver(winner) {
  const overlay = document.getElementById("gameOverOverlay");
  const title = document.getElementById("gameOverTitle");
  const msg = document.getElementById("gameOverMsg");
  STATE.gameActive = false;
  clearStoredState();
  if (!winner) {
    title.textContent = "Lygiosios";
    msg.textContent = "Visi atsikratėt kortų tuo pačiu metu";
  } else {
    const losers = STATE.players.filter((p) => p.hand.length > 0);
    if (losers.length === 0) {
      title.textContent = "Lygiosios";
      msg.textContent = "Niekas neliko durnium";
    } else if (losers.length === 1 && isHuman(losers[0].id)) {
      title.textContent = "Tu durnius! 😭";
      msg.textContent = "Likai paskutinis su kortomis";
    } else if (losers.length === 1) {
      title.textContent = "Laimėjai! 🎉";
      msg.textContent = `${losers[0].name} liko durnium`;
    } else {
      title.textContent = "Žaidimas baigtas";
      msg.textContent = `Liko su kortomis: ${losers.map((l) => l.name).join(", ")}`;
    }
  }
  overlay.classList.add("show");
}

function openNewGamePicker() {
  document.getElementById("playersOverlay").classList.add("show");
}

function closeNewGamePicker() {
  document.getElementById("playersOverlay").classList.remove("show");
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("rulesBtn").addEventListener("click", () => {
    document.getElementById("rulesOverlay").classList.add("show");
  });
  document.getElementById("newBtn").addEventListener("click", () => {
    if (STATE.gameActive && !confirm("Pradėt naują žaidimą?")) return;
    openNewGamePicker();
  });
  document.querySelectorAll(".player-count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.count, 10);
      closeNewGamePicker();
      startGame(n);
    });
  });
  document.getElementById("playersCancelBtn").addEventListener("click", () => {
    closeNewGamePicker();
  });
  document.getElementById("takeBtn").addEventListener("click", humanTake);
  document.getElementById("bitaBtn").addEventListener("click", humanPass);
  document.getElementById("restartBtn").addEventListener("click", () => {
    document.getElementById("gameOverOverlay").classList.remove("show");
    openNewGamePicker();
  });

  const saved = loadState();
  if (saved && saved.gameActive && saved.players && saved.players.length >= 2) {
    restoreGame(saved);
  } else {
    startGame(2);
  }
});
