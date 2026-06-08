const STORAGE_KEY = "bingo-builder-v1";
const SNAP = 10;
const MIN_SIZE = 70;
const LONG_PRESS_MS = 550;
const LONG_PRESS_MOVE_TOLERANCE = 12;

const board = document.getElementById("board");
const tileTemplate = document.getElementById("tileTemplate");

const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
const newBoardBtn = document.getElementById("newBoardBtn");
const lockBtn = document.getElementById("lockBtn");
const stampModeInput = document.getElementById("stampModeInput");
const stampSelect = document.getElementById("stampSelect");
const clearStampsBtn = document.getElementById("clearStampsBtn");
const resetLayoutBtn = document.getElementById("resetLayoutBtn");
const scaleInput = document.getElementById("scaleInput");

let state = loadState() || createBoardState(5, 5, 100);
let activePointer = null;

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
    return parsed;
  } catch {
    return null;
  }
}

function syncControls() {
  rowsInput.value = state.rows;
  colsInput.value = state.cols;
  scaleInput.value = state.scale;
  stampModeInput.checked = !!state.stampMode;
  stampSelect.value = state.stampValue || "✅";

  lockBtn.textContent = state.locked ? "Unlock Layout" : "Lock Layout";
  lockBtn.classList.toggle("safe", state.locked);
  lockBtn.classList.toggle("warn", !state.locked);
}

function render() {
  syncControls();
  board.innerHTML = "";

  state.tiles.forEach((tile) => {
    const fragment = tileTemplate.content.cloneNode(true);
    const tileEl = fragment.querySelector(".tile");
    const contentEl = fragment.querySelector(".tile-content");
    const stampsEl = fragment.querySelector(".stamps");
    const handleEl = fragment.querySelector(".resize-handle");

    tileEl.dataset.id = tile.id;
    tileEl.style.left = `${tile.x}px`;
    tileEl.style.top = `${tile.y}px`;
    tileEl.style.width = `${tile.w}px`;
    tileEl.style.height = `${tile.h}px`;
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
      if (event.target === handleEl) return;
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
        return;
      }
      if (event.target === contentEl) return;

      const rect = tileEl.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const isResize = event.target === handleEl;

      activePointer = {
        pointerId: event.pointerId,
        tile,
        tileEl,
        mode: isResize ? "resize" : "move",
        startX: event.clientX,
        startY: event.clientY,
        origX: tile.x,
        origY: tile.y,
        origW: tile.w,
        origH: tile.h,
        maxW: boardRect.width - (rect.left - boardRect.left),
        maxH: boardRect.height - (rect.top - boardRect.top)
      };

      tileEl.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    tileEl.addEventListener("pointermove", (event) => {
      if (longPressTimer) {
        const movedX = Math.abs(event.clientX - holdStartX);
        const movedY = Math.abs(event.clientY - holdStartY);
        if (movedX > LONG_PRESS_MOVE_TOLERANCE || movedY > LONG_PRESS_MOVE_TOLERANCE) {
          clearHoldTimer();
        }
      }

      if (!activePointer || activePointer.pointerId !== event.pointerId) return;
      if (activePointer.tile.id !== tile.id) return;

      const boardRect = board.getBoundingClientRect();
      const dx = event.clientX - activePointer.startX;
      const dy = event.clientY - activePointer.startY;

      if (activePointer.mode === "move") {
        const maxX = boardRect.width - tile.w;
        const maxY = boardRect.height - tile.h;
        tile.x = snap(clamp(activePointer.origX + dx, 0, maxX));
        tile.y = snap(clamp(activePointer.origY + dy, 0, maxY));
      } else {
        tile.w = snap(clamp(activePointer.origW + dx, MIN_SIZE, activePointer.maxW));
        tile.h = snap(clamp(activePointer.origH + dy, MIN_SIZE, activePointer.maxH));
      }

      tileEl.style.left = `${tile.x}px`;
      tileEl.style.top = `${tile.y}px`;
      tileEl.style.width = `${tile.w}px`;
      tileEl.style.height = `${tile.h}px`;
    });

    const finishPointer = (event) => {
      clearHoldTimer();
      if (!activePointer || activePointer.pointerId !== event.pointerId) return;
      if (activePointer.tile.id !== tile.id) return;
      tileEl.releasePointerCapture(event.pointerId);
      activePointer = null;
      saveState();
    };

    tileEl.addEventListener("pointerup", finishPointer);
    tileEl.addEventListener("pointercancel", finishPointer);

    board.appendChild(fragment);
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

resetLayoutBtn.addEventListener("click", resetGridLayout);

scaleInput.addEventListener("change", () => {
  state.scale = clamp(Number(scaleInput.value) || 100, 60, 180);
  resetGridLayout();
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
