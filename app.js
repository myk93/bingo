const STORAGE_KEY = "bingo-builder-v1";
const SNAP = 10;
const MIN_SIZE = 70;
const LONG_PRESS_MS = 550;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const DOUBLE_TAP_MS = 320;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const SPARKLE_COUNT = 36;

const board = document.getElementById("board");
const boardCanvas = document.getElementById("boardCanvas");
const effectsLayer = document.getElementById("effectsLayer");
const toolbar = document.getElementById("toolbar");
const tileTemplate = document.getElementById("tileTemplate");

const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
const newBoardBtn = document.getElementById("newBoardBtn");
const lockBtn = document.getElementById("lockBtn");
const stampModeInput = document.getElementById("stampModeInput");
const stampSelect = document.getElementById("stampSelect");
const clearStampsBtn = document.getElementById("clearStampsBtn");
const resetBoardBtn = document.getElementById("resetBoardBtn");
const scaleInput = document.getElementById("scaleInput");
const zoomInput = document.getElementById("zoomInput");
const collapseUiBtn = document.getElementById("collapseUiBtn");
const fullScreenBtn = document.getElementById("fullScreenBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFileInput = document.getElementById("importFileInput");

let state = loadState() || createBoardState(5, 5, 100);
let lockBeforeFullscreen = false;
let collapsedBeforeFullscreen = false;
let wasBingoAchieved = false;
const lastTapByTile = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snap(value) {
  return Math.round(value / SNAP) * SNAP;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function createBoardState(rows, cols, scale) {
  const width = board.clientWidth || 1000;
  const height = board.clientHeight || 700;
  const tiles = [];

  const gap = 10;
  const baseW = Math.max(MIN_SIZE, Math.floor(((width - gap * (cols + 1)) / cols) * (scale / 100)));
  const baseH = Math.max(MIN_SIZE, Math.floor(((height - gap * (rows + 1)) / rows) * (scale / 100)));

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      tiles.push({
        id: uid(),
        text: "",
        stamp: "",
        x: gap + c * (baseW + gap),
        y: gap + r * (baseH + gap),
        w: baseW,
        h: baseH
      });
    }
  }

  return {
    rows,
    cols,
    scale,
    viewZoom: 1,
    uiCollapsed: false,
    fullscreenMode: false,
    locked: false,
    stampMode: true,
    stampValue: "✅",
    tiles
  };
}

function normalizeImportedState(input) {
  if (!input || typeof input !== "object") return null;

  const rows = clamp(Number(input.rows) || 5, 1, 12);
  const cols = clamp(Number(input.cols) || 5, 1, 12);
  const scale = clamp(Number(input.scale) || 100, 60, 180);
  const normalized = createBoardState(rows, cols, scale);

  normalized.viewZoom = clamp(Number(input.viewZoom) || 1, MIN_ZOOM, MAX_ZOOM);
  normalized.uiCollapsed = !!input.uiCollapsed;
  normalized.fullscreenMode = false;
  normalized.locked = !!input.locked;
  normalized.stampMode = typeof input.stampMode === "boolean" ? input.stampMode : true;
  normalized.stampValue = typeof input.stampValue === "string" && input.stampValue ? input.stampValue : "✅";

  const importedTiles = Array.isArray(input.tiles) ? input.tiles : [];
  const maxX = board.clientWidth || 1000;
  const maxY = board.clientHeight || 700;

  normalized.tiles.forEach((tile, i) => {
    const src = importedTiles[i];
    if (!src || typeof src !== "object") return;

    tile.text = typeof src.text === "string" ? src.text : "";
    tile.stamp = typeof src.stamp === "string" ? src.stamp : "";
    tile.x = clamp(Number(src.x) || tile.x, 0, maxX);
    tile.y = clamp(Number(src.y) || tile.y, 0, maxY);
    tile.w = clamp(Number(src.w) || tile.w, MIN_SIZE, Math.max(MIN_SIZE, maxX));
    tile.h = clamp(Number(src.h) || tile.h, MIN_SIZE, Math.max(MIN_SIZE, maxY));
  });

  return normalized;
}

function closeImportMenu() {
  const menu = exportBtn?.closest("details");
  if (menu) {
    menu.removeAttribute("open");
  }
}

function exportBoardState() {
  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    app: "bingo-builder",
    state
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `bingo-board-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  closeImportMenu();
}

function requestImportBoard() {
  importFileInput.value = "";
  closeImportMenu();
  importFileInput.click();
}

async function importBoardFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const sourceState = parsed && typeof parsed === "object" && parsed.state ? parsed.state : parsed;
    const imported = normalizeImportedState(sourceState);

    if (!imported) {
      window.alert("Invalid import file.");
      return;
    }

    const confirmed = window.confirm("Import this board and replace your current board?");
    if (!confirmed) return;

    state = imported;
    saveState();
    render();
  } catch {
    window.alert("Could not import file. Please use a valid JSON export.");
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tiles)) return null;
    if (!parsed.viewZoom || Number.isNaN(Number(parsed.viewZoom))) {
      parsed.viewZoom = 1;
    }
    if (typeof parsed.uiCollapsed !== "boolean") {
      parsed.uiCollapsed = false;
    }
    if (typeof parsed.fullscreenMode !== "boolean") {
      parsed.fullscreenMode = false;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setNativeFullscreen(shouldEnter) {
  if (!document.documentElement.requestFullscreen || !document.exitFullscreen) return;

  if (shouldEnter && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      // iPhone browsers may not allow this; CSS fullscreen mode still works.
    });
  }

  if (!shouldEnter && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {
      // Ignore if browser blocks or exits itself.
    });
  }
}

function getFitZoom() {
  const boardWidth = board.clientWidth || 1;
  const boardHeight = board.clientHeight || 1;

  let contentWidth = boardWidth;
  let contentHeight = boardHeight;

  state.tiles.forEach((tile) => {
    contentWidth = Math.max(contentWidth, tile.x + tile.w + 10);
    contentHeight = Math.max(contentHeight, tile.y + tile.h + 10);
  });

  const fit = Math.min(boardWidth / contentWidth, boardHeight / contentHeight);
  return clamp(fit, MIN_ZOOM, MAX_ZOOM);
}

function applyViewModes() {
  toolbar.classList.toggle("collapsed", !!state.uiCollapsed);
  document.body.classList.toggle("fullscreen-mode", !!state.fullscreenMode);
}

function isBingoAchieved() {
  if (!state.tiles.length) return false;
  const stamped = state.tiles.map((tile) => !!tile.stamp);
  const rows = state.rows;
  const cols = state.cols;

  for (let r = 0; r < rows; r += 1) {
    let ok = true;
    for (let c = 0; c < cols; c += 1) {
      if (!stamped[r * cols + c]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }

  for (let c = 0; c < cols; c += 1) {
    let ok = true;
    for (let r = 0; r < rows; r += 1) {
      if (!stamped[r * cols + c]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }

  if (rows === cols) {
    let diagA = true;
    let diagB = true;
    for (let i = 0; i < rows; i += 1) {
      if (!stamped[i * cols + i]) diagA = false;
      if (!stamped[i * cols + (cols - 1 - i)]) diagB = false;
    }
    if (diagA || diagB) return true;
  }

  return false;
}

function triggerSparkles() {
  if (!effectsLayer) return;
  effectsLayer.innerHTML = "";

  for (let i = 0; i < SPARKLE_COUNT; i += 1) {
    const sparkle = document.createElement("span");
    sparkle.className = "sparkle";
    sparkle.style.left = `${Math.random() * 100}%`;
    sparkle.style.top = `${Math.random() * 100}%`;
    sparkle.style.animationDelay = `${Math.floor(Math.random() * 220)}ms`;
    sparkle.style.transform = `scale(${0.65 + Math.random() * 1.2})`;
    effectsLayer.appendChild(sparkle);
  }

  setTimeout(() => {
    effectsLayer.innerHTML = "";
  }, 1400);
}

function syncControls() {
  rowsInput.value = state.rows;
  colsInput.value = state.cols;
  scaleInput.value = state.scale;
  zoomInput.value = Math.round((state.viewZoom || 1) * 100);
  stampModeInput.checked = !!state.stampMode;
  stampSelect.value = state.stampValue || "✅";

  lockBtn.textContent = state.locked ? "Unlock Layout" : "Lock Layout";
  lockBtn.classList.toggle("safe", state.locked);
  lockBtn.classList.toggle("warn", !state.locked);
  lockBtn.disabled = !!state.fullscreenMode;

  collapseUiBtn.textContent = state.uiCollapsed ? "▾" : "▴";
  collapseUiBtn.title = state.uiCollapsed ? "Expand controls" : "Collapse controls";

  fullScreenBtn.textContent = state.fullscreenMode ? "⤢ Exit" : "⛶ Full";
  fullScreenBtn.classList.toggle("safe", !!state.fullscreenMode);
}

function render() {
  const zoom = clamp(Number(state.viewZoom) || 1, MIN_ZOOM, MAX_ZOOM);
  state.viewZoom = zoom;
  applyViewModes();
  syncControls();
  boardCanvas.innerHTML = "";

  const boardRect = board.getBoundingClientRect();
  boardCanvas.style.width = `${Math.max(1, Math.round(boardRect.width * zoom))}px`;
  boardCanvas.style.height = `${Math.max(1, Math.round(boardRect.height * zoom))}px`;

  state.tiles.forEach((tile) => {
    const fragment = tileTemplate.content.cloneNode(true);
    const tileEl = fragment.querySelector(".tile");
    const contentEl = fragment.querySelector(".tile-content");
    const stampsEl = fragment.querySelector(".stamps");

    tileEl.dataset.id = tile.id;
    tileEl.style.left = `${tile.x * zoom}px`;
    tileEl.style.top = `${tile.y * zoom}px`;
    tileEl.style.width = `${tile.w * zoom}px`;
    tileEl.style.height = `${tile.h * zoom}px`;
    tileEl.classList.toggle("locked", state.locked);

    contentEl.textContent = tile.text;
    contentEl.contentEditable = (!state.locked).toString();

    if (tile.stamp) {
      const stamp = document.createElement("span");
      stamp.className = "stamp";
      stamp.textContent = tile.stamp;
      stampsEl.appendChild(stamp);
    }

    let longPressTimer = null;
    let holdStartX = 0;
    let holdStartY = 0;

    const clearHoldTimer = () => {
      if (!longPressTimer) return;
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    contentEl.addEventListener("input", () => {
      tile.text = contentEl.textContent || "";
      saveState();
    });

    tileEl.addEventListener("click", (event) => {
      if (!state.locked || !state.stampMode) return;
      if (tileEl.dataset.skipClick === "1") {
        tileEl.dataset.skipClick = "0";
        return;
      }

      const now = Date.now();
      const prevTap = lastTapByTile.get(tile.id) || 0;
      const isDoubleTap = now - prevTap <= DOUBLE_TAP_MS;
      lastTapByTile.set(tile.id, now);

      if (isDoubleTap && tile.stamp) {
        tile.stamp = "";
        saveState();
        render();
        return;
      }

      tile.stamp = state.stampValue;
      saveState();
      render();
    });

    tileEl.addEventListener("contextmenu", (event) => {
      if (!state.locked) return;
      event.preventDefault();
      tile.stamp = "";
      saveState();
      render();
    });

    tileEl.addEventListener("pointerdown", (event) => {
      if (state.locked) {
        if (event.pointerType === "mouse") return;
        holdStartX = event.clientX;
        holdStartY = event.clientY;
        clearHoldTimer();
        longPressTimer = setTimeout(() => {
          tile.stamp = "";
          tileEl.dataset.skipClick = "1";
          clearHoldTimer();
          saveState();
          render();
        }, LONG_PRESS_MS);
        event.preventDefault();
      }
    });

    tileEl.addEventListener("pointermove", (event) => {
      if (longPressTimer) {
        const movedX = Math.abs(event.clientX - holdStartX);
        const movedY = Math.abs(event.clientY - holdStartY);
        if (movedX > LONG_PRESS_MOVE_TOLERANCE || movedY > LONG_PRESS_MOVE_TOLERANCE) {
          clearHoldTimer();
        }
      }
    });

    const finishPointer = (event) => {
      clearHoldTimer();
      if (state.locked) {
        saveState();
      }
    };

    tileEl.addEventListener("pointerup", finishPointer);
    tileEl.addEventListener("pointercancel", finishPointer);

    boardCanvas.appendChild(fragment);
  });

  const nowBingo = isBingoAchieved();
  if (nowBingo && !wasBingoAchieved) {
    triggerSparkles();
  }
  wasBingoAchieved = nowBingo;
}

function resetGridLayout() {
  const fresh = createBoardState(state.rows, state.cols, state.scale);
  state.tiles.forEach((tile, i) => {
    const f = fresh.tiles[i];
    if (!f) return;
    tile.x = f.x;
    tile.y = f.y;
    tile.w = f.w;
    tile.h = f.h;
  });
  saveState();
  render();
}

function resetBoardWithConfirmation() {
  const confirmed = window.confirm("Delete this board and start fresh? This cannot be undone.");
  if (!confirmed) return;

  const rows = clamp(Number(rowsInput.value) || state.rows, 1, 12);
  const cols = clamp(Number(colsInput.value) || state.cols, 1, 12);
  const scale = clamp(Number(scaleInput.value) || state.scale, 60, 180);
  state = createBoardState(rows, cols, scale);
  state.uiCollapsed = false;
  state.fullscreenMode = false;
  localStorage.removeItem(STORAGE_KEY);
  saveState();
  setNativeFullscreen(false);
  render();
}

function toggleCollapseUi() {
  state.uiCollapsed = !state.uiCollapsed;
  saveState();
  render();
}

function toggleFullscreenMode() {
  if (!state.fullscreenMode) {
    lockBeforeFullscreen = !!state.locked;
    collapsedBeforeFullscreen = !!state.uiCollapsed;
    state.fullscreenMode = true;
    state.locked = true;
    state.uiCollapsed = true;
    render();
    state.viewZoom = getFitZoom();
    saveState();
    render();
    setNativeFullscreen(true);
    return;
  }

  state.fullscreenMode = false;
  state.locked = lockBeforeFullscreen;
  state.uiCollapsed = collapsedBeforeFullscreen;
  saveState();
  render();
  setNativeFullscreen(false);
}

newBoardBtn.addEventListener("click", () => {
  const rows = clamp(Number(rowsInput.value) || 5, 1, 12);
  const cols = clamp(Number(colsInput.value) || 5, 1, 12);
  const scale = clamp(Number(scaleInput.value) || 100, 60, 180);
  state = createBoardState(rows, cols, scale);
  saveState();
  render();
});

lockBtn.addEventListener("click", () => {
  if (state.fullscreenMode) return;
  state.locked = !state.locked;
  saveState();
  render();
});

stampModeInput.addEventListener("change", () => {
  state.stampMode = stampModeInput.checked;
  saveState();
});

stampSelect.addEventListener("change", () => {
  state.stampValue = stampSelect.value;
  saveState();
});

clearStampsBtn.addEventListener("click", () => {
  state.tiles.forEach((tile) => {
    tile.stamp = "";
  });
  saveState();
  render();
});

resetBoardBtn.addEventListener("click", resetBoardWithConfirmation);
collapseUiBtn.addEventListener("click", toggleCollapseUi);
fullScreenBtn.addEventListener("click", toggleFullscreenMode);
exportBtn.addEventListener("click", exportBoardState);
importBtn.addEventListener("click", requestImportBoard);
importFileInput.addEventListener("change", importBoardFromFile);

scaleInput.addEventListener("change", () => {
  state.scale = clamp(Number(scaleInput.value) || 100, 60, 180);
  resetGridLayout();
});

zoomInput.addEventListener("input", () => {
  state.viewZoom = clamp((Number(zoomInput.value) || 100) / 100, MIN_ZOOM, MAX_ZOOM);
  saveState();
  render();
});

window.addEventListener("beforeunload", saveState);
window.addEventListener("resize", () => {
  // Keep current layout but clamp tiles back inside board.
  const boardRect = board.getBoundingClientRect();
  state.tiles.forEach((tile) => {
    tile.w = Math.min(tile.w, Math.max(MIN_SIZE, boardRect.width));
    tile.h = Math.min(tile.h, Math.max(MIN_SIZE, boardRect.height));
    tile.x = clamp(tile.x, 0, Math.max(0, boardRect.width - tile.w));
    tile.y = clamp(tile.y, 0, Math.max(0, boardRect.height - tile.h));
  });
  saveState();
  render();
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && state.fullscreenMode) {
    state.fullscreenMode = false;
    state.locked = lockBeforeFullscreen;
    state.uiCollapsed = collapsedBeforeFullscreen;
    saveState();
    render();
  }
});

render();
