const state = {
  user: null,
  width: 0,
  height: 0,
  tiles: [],
  onlineCount: 0,
  leaderboard: [],
  cooldownUntil: 0
};

const gridEl = document.getElementById("grid");
const onlineCountEl = document.getElementById("onlineCount");
const statusTextEl = document.getElementById("statusText");
const myScoreEl = document.getElementById("myScore");
const playerBadgeEl = document.getElementById("playerBadge");
const leaderboardListEl = document.getElementById("leaderboardList");
const nameInputEl = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");

let socket;

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener("open", () => {
    statusTextEl.textContent = "Connected";
  });

  socket.addEventListener("close", () => {
    statusTextEl.textContent = "Disconnected (retrying...)";
    setTimeout(connect, 1000);
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    handleEvent(data);
  });
}

function handleEvent(data) {
  if (data.type === "welcome") {
    state.user = data.user;
    state.width = data.config.width;
    state.height = data.config.height;
    state.tiles = data.state.tiles;
    state.onlineCount = data.onlineCount;
    state.leaderboard = data.state.leaderboard;

    const stored = localStorage.getItem("arena-name");
    if (stored && stored !== state.user.name) {
      send({ type: "rename", name: stored });
    }

    nameInputEl.value = state.user.name;
    renderAll();
    return;
  }

  if (data.type === "presence") {
    state.onlineCount = data.onlineCount;
    renderPresence();
    return;
  }

  if (data.type === "user:update") {
    if (state.user && state.user.id === data.user.id) {
      state.user.name = data.user.name;
      nameInputEl.value = data.user.name;
      localStorage.setItem("arena-name", data.user.name);
    }
    state.tiles = data.tiles;
    state.leaderboard = data.leaderboard;
    renderGrid();
    renderLeaderboard();
    renderIdentity();
    return;
  }

  if (data.type === "tile:update") {
    state.tiles[data.index] = data.owner;
    state.leaderboard = data.leaderboard;
    paintTile(data.index, data.owner, true);
    renderLeaderboard();
    renderMyScore();
    return;
  }

  if (data.type === "leaderboard:update") {
    state.leaderboard = data.leaderboard;
    renderLeaderboard();
    renderMyScore();
    return;
  }

  if (data.type === "claim:rejected" && data.reason === "cooldown") {
    state.cooldownUntil = Date.now() + data.retryInMs;
    updateCooldownStatus();
  }
}

function createGrid() {
  gridEl.style.gridTemplateColumns = `repeat(${state.width}, var(--tile-size))`;
  gridEl.innerHTML = "";
  const total = state.width * state.height;
  for (let i = 0; i < total; i += 1) {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.dataset.index = String(i);
    tile.addEventListener("click", () => claimTile(i));
    gridEl.appendChild(tile);
  }
}

function renderGrid() {
  if (!gridEl.children.length) {
    createGrid();
  }
  state.tiles.forEach((owner, index) => paintTile(index, owner, false));
}

function paintTile(index, owner, animate) {
  const tile = gridEl.children[index];
  if (!tile) return;
  if (!owner) {
    tile.classList.remove("claimed");
    tile.style.background = "#1a1d28";
    tile.title = "Unclaimed tile";
    return;
  }
  tile.style.background = owner.color;
  tile.title = `${owner.name} owns this tile`;
  if (animate) {
    tile.classList.remove("claimed");
    requestAnimationFrame(() => tile.classList.add("claimed"));
  }
}

function renderPresence() {
  onlineCountEl.textContent = String(state.onlineCount);
}

function renderIdentity() {
  if (!state.user) return;
  playerBadgeEl.textContent = `${state.user.name} (${state.user.color})`;
  playerBadgeEl.style.borderColor = state.user.color;
  playerBadgeEl.style.boxShadow = `inset 0 0 0 1px ${state.user.color}40`;
}

function renderLeaderboard() {
  leaderboardListEl.innerHTML = "";
  if (state.leaderboard.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No captures yet.";
    leaderboardListEl.appendChild(li);
    return;
  }
  state.leaderboard.slice(0, 10).forEach((entry) => {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.className = "player";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = entry.color;
    const label = document.createElement("span");
    label.textContent = entry.name;
    left.append(dot, label);

    const right = document.createElement("strong");
    right.textContent = `${entry.score}`;
    li.append(left, right);
    leaderboardListEl.appendChild(li);
  });
}

function renderMyScore() {
  if (!state.user) {
    myScoreEl.textContent = "0";
    return;
  }
  const me = state.leaderboard.find((x) => x.id === state.user.id);
  myScoreEl.textContent = me ? String(me.score) : "0";
}

function renderAll() {
  renderGrid();
  renderPresence();
  renderIdentity();
  renderLeaderboard();
  renderMyScore();
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function claimTile(index) {
  const now = Date.now();
  if (now < state.cooldownUntil) {
    updateCooldownStatus();
    return;
  }
  send({ type: "claim", index });
}

function updateCooldownStatus() {
  const left = state.cooldownUntil - Date.now();
  if (left <= 0) {
    statusTextEl.textContent = "Connected";
    state.cooldownUntil = 0;
    return;
  }
  statusTextEl.textContent = `Cooldown ${Math.ceil(left)}ms`;
  requestAnimationFrame(updateCooldownStatus);
}

saveNameBtn.addEventListener("click", () => {
  const value = nameInputEl.value.trim();
  if (value.length < 2) return;
  send({ type: "rename", name: value });
});

connect();
