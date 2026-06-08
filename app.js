const STORAGE_KEY = "bingo-builder-v1";
const SNAP = 10;
const MIN_SIZE = 70;
const LONG_PRESS_MS = 550;
const LONG_PRESS_MOVE_TOLERANCE = 12;

const board = document.getElementById("board");
const boardCanvas = document.getElementById("boardCanvas");
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

let state = loadState() || createBoardState(5, 5, 100);

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
    locked: false,
    stampMode: true,
    stampValue: "✅",
    tiles
  };
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
    return parsed;
  } catch {
    return null;
  }
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
}

function render() {
  const zoom = clamp(Number(state.viewZoom) || 1, 1, 3);
  state.viewZoom = zoom;
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
  localStorage.removeItem(STORAGE_KEY);
  saveState();
  render();
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

scaleInput.addEventListener("change", () => {
  state.scale = clamp(Number(scaleInput.value) || 100, 60, 180);
  resetGridLayout();
});

zoomInput.addEventListener("input", () => {
  state.viewZoom = clamp((Number(zoomInput.value) || 100) / 100, 1, 3);
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

render();
