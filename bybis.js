// ═══════════════════════════════════════════════════════
//  BYBIS — lietuviškas kortų žaidimas
// ═══════════════════════════════════════════════════════

const BYBIS_RANKS = ["9", "10", "J", "Q", "K", "A"];
const BYBIS_RV = {};
BYBIS_RANKS.forEach((r, i) => (BYBIS_RV[r] = i));
const WORD = "BYBIS";
const STATS_KEY = "bybis_letters";

const state = {
  players: [],
  stock: [],
  discard: [],
  currentIdx: 0,
  round: 1,
  turnCount: 0,
  selected: new Set(),
  gameActive: false,
  numPlayers: 3,
  letters: {},
  busy: false,
};

function loadLetters() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveLetters() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(state.letters));
  } catch (e) {}
}

function buildDeck() {
  const d = [];
  for (const s of SUITS)
    for (const r of BYBIS_RANKS) d.push(mkCard(s, r, true));
  return shuffle(d);
}

function setupGame(n) {
  state.numPlayers = n;
  state.players = [];
  state.players.push({ id: 0, name: "Tu", isBot: false, hand: [], done: false });
  for (let i = 1; i < n; i++) {
    state.players.push({
      id: i,
      name: `Kompiuteris ${i}`,
      isBot: true,
      hand: [],
      done: false,
    });
  }
  state.round = 1;
  state.letters = {};
  state.players.forEach((p) => (state.letters[p.id] = ""));
  state.gameActive = true;
  buildOpponentsDOM();
  startRound();
}

function startRound() {
  const deck = buildDeck();
  const nineIdx = deck.findIndex((c) => c.rank === "9");
  const start = deck.splice(nineIdx, 1)[0];
  state.discard = [start];
  for (const p of state.players) {
    p.hand = [];
    p.done = false;
    for (let i = 0; i < 6; i++) p.hand.push(deck.pop());
    sortHand(p.hand);
  }
  state.stock = deck;
  state.currentIdx = 0;
  state.turnCount = 1;
  state.selected.clear();
  state.busy = false;
  render();
  setMsg(`Ratas ${state.round} — pradedam nuo 9!`);
  maybeBotTurn();
}

function sortHand(hand) {
  hand.sort((a, b) => {
    const d = BYBIS_RV[a.rank] - BYBIS_RV[b.rank];
    return d !== 0 ? d : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });
}

function topCard() {
  return state.discard[state.discard.length - 1];
}

function validatePlay(cards) {
  if (!cards.length) return { valid: false, reason: "Nieko nepasirinkai" };
  const top = topCard();
  const rc = {};
  cards.forEach((c) => (rc[c.rank] = (rc[c.rank] || 0) + 1));
  const uniq = Object.keys(rc);

  if (uniq.length === 1) {
    const r = uniq[0];
    if (BYBIS_RV[r] < BYBIS_RV[top.rank])
      return { valid: false, reason: `Per žema — reikia ≥ ${top.rank}` };
    if (cards.length > 4)
      return { valid: false, reason: "Daugiausia 4 vienodos" };
    return { valid: true };
  }

  if (uniq.length === 2 && cards.length === 5) {
    let four = null,
      one = null;
    for (const r of uniq) {
      if (rc[r] === 4) four = r;
      else if (rc[r] === 1) one = r;
    }
    if (!four || !one)
      return { valid: false, reason: "Netinkama 4+1 kombinacija" };
    if (BYBIS_RV[four] < BYBIS_RV[top.rank])
      return { valid: false, reason: `Keturios ${four} per žemos` };
    if (BYBIS_RV[one] < BYBIS_RV[four])
      return { valid: false, reason: "Penktoji korta turi būt ≥ keturių" };
    return { valid: true };
  }

  return {
    valid: false,
    reason: "Netinkama kombinacija (gali 1–4 vienodas arba 4+1)",
  };
}

function canPlayerPlay(player) {
  const top = topCard();
  return player.hand.some((c) => BYBIS_RV[c.rank] >= BYBIS_RV[top.rank]);
}

function drawFor(player, count) {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (state.stock.length > 0) {
      player.hand.push(state.stock.pop());
      drawn++;
    } else if (state.discard.length > 1) {
      player.hand.push(state.discard.shift());
      drawn++;
    } else {
      break;
    }
  }
  sortHand(player.hand);
  return drawn;
}

function doPlay(player, cards) {
  for (const c of cards) {
    const idx = player.hand.indexOf(c);
    if (idx !== -1) player.hand.splice(idx, 1);
    state.discard.push(c);
  }
  try {
    playSound("place");
  } catch (e) {}
}

function advanceTurn() {
  const cur = state.players[state.currentIdx];
  if (cur.hand.length === 0 && !cur.done) {
    cur.done = true;
    setMsg(`${cur.name} atsikratė visų kortų! 🎉`);
  }

  const active = state.players.filter((p) => !p.done);
  if (active.length <= 1) {
    endRound(active[0] || null);
    return;
  }

  let tries = 0;
  do {
    state.currentIdx = (state.currentIdx + 1) % state.players.length;
    tries++;
  } while (
    state.players[state.currentIdx].done &&
    tries < state.players.length * 2
  );

  state.turnCount++;
  state.selected.clear();
  render();
  maybeBotTurn();
}

function endRound(loser) {
  state.gameActive = false;
  if (loser) {
    const cur = state.letters[loser.id] || "";
    const next = WORD[cur.length];
    state.letters[loser.id] = cur + next;
    saveLetters();

    if (state.letters[loser.id] === WORD) {
      showGameOver(loser);
      return;
    }
    showRoundEnd(loser);
  } else {
    showRoundEnd(null);
  }
}

function maybeBotTurn() {
  if (!state.gameActive) return;
  const p = state.players[state.currentIdx];
  if (p.isBot && !p.done) {
    state.busy = true;
    setTimeout(botTurn, 900);
  } else {
    state.busy = false;
  }
}

function botTurn() {
  const p = state.players[state.currentIdx];
  if (!p || p.done) {
    advanceTurn();
    return;
  }
  const top = topCard();
  const playable = p.hand.filter(
    (c) => BYBIS_RV[c.rank] >= BYBIS_RV[top.rank],
  );

  if (playable.length === 0) {
    const n = drawFor(p, 3);
    setMsg(`${p.name} neturi ką mest — ima ${n} kortas`);
    render();
    setTimeout(advanceTurn, 800);
    return;
  }

  let minRank = Infinity;
  for (const c of playable) {
    if (BYBIS_RV[c.rank] < minRank) minRank = BYBIS_RV[c.rank];
  }
  const sameRankCards = p.hand.filter((c) => BYBIS_RV[c.rank] === minRank);
  const toPlay = sameRankCards.slice(0, 4);

  if (toPlay.length === 4) {
    const higher = p.hand.filter(
      (c) => BYBIS_RV[c.rank] > minRank && !toPlay.includes(c),
    );
    if (higher.length > 0 && p.hand.length >= 6) {
      higher.sort((a, b) => BYBIS_RV[a.rank] - BYBIS_RV[b.rank]);
      toPlay.push(higher[0]);
    }
  }

  doPlay(p, toPlay);
  const rankStr = toPlay.map((c) => c.rank + c.suit).join(" ");
  setMsg(`${p.name} meta: ${rankStr}`);
  render();
  setTimeout(advanceTurn, 900);
}

function handleCardClick(cardIdx) {
  if (state.busy || !state.gameActive) return;
  if (state.currentIdx !== 0) return;
  const me = state.players[0];
  if (me.done) return;

  if (state.selected.has(cardIdx)) state.selected.delete(cardIdx);
  else state.selected.add(cardIdx);
  render();
}

function handlePlay() {
  if (state.busy || !state.gameActive) return;
  if (state.currentIdx !== 0) return;
  const me = state.players[0];
  const cards = [...state.selected].map((i) => me.hand[i]);
  const v = validatePlay(cards);
  if (!v.valid) {
    setMsg(v.reason);
    return;
  }
  doPlay(me, cards);
  setMsg(`Metei: ${cards.map((c) => c.rank + c.suit).join(" ")}`);
  state.busy = true;
  render();
  setTimeout(advanceTurn, 600);
}

function handleDraw() {
  if (state.busy || !state.gameActive) return;
  if (state.currentIdx !== 0) return;
  const me = state.players[0];
  if (me.done) return;
  if (canPlayerPlay(me)) {
    setMsg("Turi kortų kurios tinka — mesk vietoj ėmimo!");
    return;
  }
  const n = drawFor(me, 3);
  setMsg(`Paėmei ${n} kortas`);
  state.busy = true;
  render();
  setTimeout(advanceTurn, 600);
}

// ── Rendering (DOM builders, no innerHTML with dynamic data) ──
function buildOpponentsDOM() {
  const el = document.getElementById("opponents");
  el.textContent = "";
  for (let i = 1; i < state.players.length; i++) {
    const p = state.players[i];
    const d = mkDiv("opponent");
    d.id = `opp${i}`;
    d.appendChild(mkDiv("name", p.name));
    const cc = mkDiv("card-count");
    const ccNum = mkDiv("cc-num", "0");
    cc.appendChild(ccNum);
    cc.appendChild(document.createTextNode(" kortų"));
    d.appendChild(cc);
    d.appendChild(mkDiv("mini-hand"));
    d.appendChild(mkDiv("letters", ""));
    el.appendChild(d);
  }
}

function render() {
  for (let i = 1; i < state.players.length; i++) {
    const p = state.players[i];
    const d = document.getElementById(`opp${i}`);
    if (!d) continue;
    d.classList.toggle("active", state.currentIdx === i && !p.done);
    d.querySelector(".cc-num").textContent = p.hand.length;
    d.querySelector(".letters").textContent = state.letters[p.id] || "";
    d.querySelector(".name").textContent = p.done ? `${p.name} ✓` : p.name;
    const mh = d.querySelector(".mini-hand");
    mh.textContent = "";
    const show = Math.min(p.hand.length, 8);
    for (let j = 0; j < show; j++) mh.appendChild(mkDiv("mini-card"));
  }

  const stockEl = document.getElementById("stockPile");
  stockEl.textContent = "";
  if (state.stock.length > 0) {
    const c = mkCard("♠", "A", false);
    stockEl.appendChild(mkEl(c));
  }
  document.getElementById("stockCount").textContent =
    `${state.stock.length} kortų`;

  const discEl = document.getElementById("discardPile");
  discEl.textContent = "";
  if (state.discard.length > 0) {
    discEl.appendChild(mkEl(topCard()));
  }
  document.getElementById("discardCount").textContent =
    `${state.discard.length} kortų`;

  const handEl = document.getElementById("playerHand");
  handEl.textContent = "";
  const me = state.players[0];
  if (!me) return;

  const top = topCard();
  me.hand.forEach((c, idx) => {
    const el = mkEl(c);
    const isPlayable = BYBIS_RV[c.rank] >= BYBIS_RV[top.rank];
    el.classList.add(isPlayable ? "playable" : "unplayable");
    if (state.selected.has(idx)) el.classList.add("selected");
    el.addEventListener("click", () => handleCardClick(idx));
    handEl.appendChild(el);
  });

  document.getElementById("yourLetters").textContent = state.letters[0] || "";

  const playBtn = document.getElementById("playBtn");
  playBtn.style.display = state.selected.size > 0 ? "" : "none";

  document.getElementById("roundNum").textContent = state.round;
  document.getElementById("turnNum").textContent = state.turnCount;

  const drawBtn = document.getElementById("drawBtn");
  if (state.currentIdx === 0 && !me.done && !canPlayerPlay(me)) {
    drawBtn.classList.add("gold");
  } else {
    drawBtn.classList.remove("gold");
  }
}

function setMsg(m) {
  const el = document.getElementById("msgLog");
  if (el) el.textContent = m;
}

function showRoundEnd(loser) {
  const overlay = document.getElementById("roundOverlay");
  const title = document.getElementById("roundTitle");
  const msg = document.getElementById("roundMsg");
  const stats = document.getElementById("roundStats");

  if (loser) {
    title.textContent = `${loser.name} liko su kortomis!`;
    msg.textContent = `Gauna raidę "${state.letters[loser.id].slice(-1)}" iš žodžio BYBIS`;
  } else {
    title.textContent = "Ratas baigtas";
    msg.textContent = "";
  }

  stats.textContent = "";
  for (const p of state.players) {
    const letters = state.letters[p.id] || "";
    const div = mkDiv("fst");
    const v = mkDiv("v", letters || "—");
    v.style.color = "#e85a4f";
    v.style.fontSize = "20px";
    v.style.letterSpacing = "3px";
    div.appendChild(v);
    div.appendChild(mkDiv("l", p.name));
    stats.appendChild(div);
  }

  overlay.classList.add("show");
}

function showGameOver(loser) {
  const overlay = document.getElementById("gameOverOverlay");
  const title = document.getElementById("gameOverTitle");
  const msg = document.getElementById("gameOverMsg");

  if (loser.id === 0) {
    title.textContent = "Tu esi bybis 😭";
    msg.textContent = "Surinkai visą žodį BYBIS. Kitą kartą pasiseks!";
  } else {
    title.textContent = `${loser.name} yra bybis! 🎉`;
    msg.textContent = "Jis surinko visą žodį BYBIS. Tu laimi!";
  }

  overlay.classList.add("show");
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("setupOverlay").classList.add("show");
  document.querySelectorAll(".player-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.players, 10);
      document.getElementById("setupOverlay").classList.remove("show");
      setupGame(n);
    });
  });

  document.getElementById("rulesBtn").addEventListener("click", () => {
    document.getElementById("rulesOverlay").classList.add("show");
  });

  document.getElementById("drawBtn").addEventListener("click", handleDraw);
  document.getElementById("playBtn").addEventListener("click", handlePlay);

  document.getElementById("newBtn").addEventListener("click", () => {
    if (state.gameActive && !confirm("Pradėt naują ratą?")) return;
    state.round = 1;
    state.letters = {};
    state.players.forEach((p) => (state.letters[p.id] = ""));
    saveLetters();
    state.gameActive = true;
    startRound();
  });

  document.getElementById("nextRoundBtn").addEventListener("click", () => {
    document.getElementById("roundOverlay").classList.remove("show");
    state.round++;
    state.gameActive = true;
    startRound();
  });

  document.getElementById("restartBtn").addEventListener("click", () => {
    state.letters = {};
    saveLetters();
    document.getElementById("gameOverOverlay").classList.remove("show");
    document.getElementById("setupOverlay").classList.add("show");
  });
});
