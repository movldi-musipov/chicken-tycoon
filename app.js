(() => {
  const ROWS = 8;
  const COLS = 5;
  const TOTAL = ROWS * COLS;
  const STORAGE_KEY = "car_grid_v1";
  const LONG_PRESS_MS = 420;
  const SINGLE_DIGIT_ADVANCE_MS = 448;
  const UNDO_TIMEOUT_MS = 5000;
  const IMAGE_WIDTH = 1000;
  const IMAGE_PADDING = 40;
  const IMAGE_LINE_W = 5;
  const IMAGE_BG = "#f4efe4";
  const IMAGE_LINE = "#2b56a4";
  const IMAGE_TEXT = "#1a1a2e";
  const IMAGE_GRID_SUBTLE = "rgba(155, 180, 215, 0.22)";
  const IMAGE_GRID_STEP = 22;
  const IMAGE_CELL_HEIGHT_RATIO = 1.25;

  const TEXT = {
    title: "Учет автомобилей",
    actionsLabel: "Действия",
    gridLabel: "Сетка",
    numpadLabel: "Цифровая клавиатура",
    clear: "Очистить",
    copy: "Копировать",
    whatsapp: "WhatsApp",
    backspace: "⌫",
    undo: "Отменить",
    cancel: "Отмена",
    clearConfirm: "Очистить все ячейки?",
    copied: "Скопировано",
    copyFailed: "Не удалось скопировать",
    cleared: "Сетка очищена",
    undoDone: "Очищение отменено",
    cellCleared: "Ячейка очищена",
    whatsappShared: "Окно WhatsApp открыто",
    whatsappUnsupported: "В этом браузере нельзя приложить PNG в WhatsApp",
    whatsappFailed: "Не удалось отправить в WhatsApp",
    activeHint: "Активная ячейка",
    row: "Строка",
    col: "Столбец",
    empty: "пусто"
  };

  const gridEl = document.getElementById("grid");
  const toastEl = document.getElementById("toast");
  const activeHintEl = document.getElementById("activeHint");
  const numpadEl = document.querySelector(".numpad");
  const actionButtons = document.querySelectorAll(".action");
  const undoBarEl = document.getElementById("undoBar");
  const undoTextEl = document.getElementById("undoText");
  const undoBtnEl = document.getElementById("undoBtn");
  const confirmBackdropEl = document.getElementById("confirmBackdrop");

  let cells = new Array(TOTAL).fill("");
  let cellEls = [];
  let activeIndex = 0;
  let toastTimer = null;
  let undoTimer = null;
  let clearSnapshot = null;
  let longPressTimer = null;
  let longPressTriggered = false;
  let pendingAdvanceTimer = null;

  const ensureCellValue = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[0-9]{1,2}$/.test(trimmed) ? trimmed : "";
  };

  const indexToRowCol = (index) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    return { row, col };
  };

  const cellAriaLabel = (index) => {
    const { row, col } = indexToRowCol(index);
    const value = cells[index] ? cells[index] : TEXT.empty;
    return `${TEXT.row} ${row + 1}, ${TEXT.col} ${col + 1}: ${value}`;
  };

  const updateActiveHint = () => {
    if (!activeHintEl) return;
    const { row, col } = indexToRowCol(activeIndex);
    activeHintEl.textContent = `${TEXT.activeHint}: ${row + 1}:${col + 1}`;
  };

  const applyI18n = () => {
    document.title = TEXT.title;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key && TEXT[key]) {
        el.textContent = TEXT[key];
      }
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (key && TEXT[key]) {
        el.setAttribute("aria-label", TEXT[key]);
      }
    });

    updateActiveHint();
  };

  const showToast = (message) => {
    if (!message || !toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1600);
  };

  const saveState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
    } catch (error) {
      console.warn("Failed to write stored grid", error);
    }
  };

  const loadState = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length !== TOTAL) return;
      cells = parsed.map((value) => ensureCellValue(String(value)));
    } catch (error) {
      console.warn("Failed to read stored grid", error);
    }
  };

  const hideUndo = () => {
    if (!undoBarEl) return;
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }
    undoBarEl.classList.remove("show");
    undoBarEl.setAttribute("aria-hidden", "true");
  };

  const dismissUndoSnapshot = () => {
    if (!clearSnapshot) return;
    clearSnapshot = null;
    hideUndo();
  };

  const showUndo = (message) => {
    if (!undoBarEl || !undoTextEl) return;
    undoTextEl.textContent = message;
    undoBarEl.classList.add("show");
    undoBarEl.setAttribute("aria-hidden", "false");

    if (undoTimer) {
      clearTimeout(undoTimer);
    }
    undoTimer = setTimeout(() => {
      hideUndo();
      clearSnapshot = null;
    }, UNDO_TIMEOUT_MS);
  };

  const updateCellA11y = (index) => {
    const cellEl = cellEls[index];
    if (!cellEl) return;
    cellEl.setAttribute("aria-label", cellAriaLabel(index));
  };

  const renderCell = (index) => {
    const cellEl = cellEls[index];
    if (!cellEl) return;
    const value = cells[index] || "";
    cellEl.textContent = value;
    cellEl.classList.toggle("double", value.length === 2);
  };

  const clearPendingAdvance = () => {
    if (pendingAdvanceTimer) {
      clearTimeout(pendingAdvanceTimer);
      pendingAdvanceTimer = null;
    }
  };

  const schedulePendingAdvance = (index) => {
    clearPendingAdvance();
    pendingAdvanceTimer = setTimeout(() => {
      if (activeIndex === index) {
        moveNext();
      }
      clearPendingAdvance();
    }, SINGLE_DIGIT_ADVANCE_MS);
  };

  const setActive = (index, options = {}) => {
    const { focus = false } = options;
    const clamped = Math.max(0, Math.min(TOTAL - 1, index));
    clearPendingAdvance();
    activeIndex = clamped;

    cellEls.forEach((cell, idx) => {
      const isActive = idx === clamped;
      cell.classList.toggle("active", isActive);
      cell.setAttribute("aria-selected", isActive ? "true" : "false");
      cell.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    if (focus) {
      const activeCell = cellEls[clamped];
      if (activeCell) {
        try {
          activeCell.focus({ preventScroll: true });
        } catch (error) {
          activeCell.focus();
        }
      }
    }

    updateActiveHint();
  };

  const setCellValue = (index, value) => {
    dismissUndoSnapshot();
    const clean = ensureCellValue(value);
    cells[index] = clean;
    renderCell(index);
    updateCellA11y(index);
    saveState();
  };

  const moveNext = () => {
    if (activeIndex < TOTAL - 1) {
      setActive(activeIndex + 1);
    }
  };

  const movePrev = () => {
    if (activeIndex > 0) {
      setActive(activeIndex - 1);
    }
  };

  const backspace = () => {
    clearPendingAdvance();
    const current = cells[activeIndex] || "";
    if (current.length > 0) {
      setCellValue(activeIndex, current.slice(0, -1));
      return;
    }

    if (activeIndex > 0) {
      movePrev();
      const prevValue = cells[activeIndex] || "";
      setCellValue(activeIndex, prevValue.slice(0, -1));
    }
  };

  const inputDigit = (digit) => {
    if (!/^[0-9]$/.test(String(digit))) return;
    const current = cells[activeIndex] || "";

    if (!current) {
      setCellValue(activeIndex, digit);
      schedulePendingAdvance(activeIndex);
      return;
    }

    if (current.length === 1) {
      clearPendingAdvance();
      setCellValue(activeIndex, `${current}${digit}`);
      moveNext();
      return;
    }

    setCellValue(activeIndex, digit);
    schedulePendingAdvance(activeIndex);
  };

  const buildGrid = () => {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < TOTAL; i += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "-1");
      cell.setAttribute("aria-selected", "false");
      cell.setAttribute("data-index", String(i));
      fragment.appendChild(cell);
      cellEls.push(cell);
    }

    gridEl.appendChild(fragment);
  };

  const renderGrid = () => {
    cellEls.forEach((_, index) => {
      renderCell(index);
      updateCellA11y(index);
    });
  };

  const handleGridClick = (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;

    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }

    const index = Number(cell.getAttribute("data-index"));
    if (!Number.isNaN(index)) {
      setActive(index);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const handleGridPointerDown = (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    if (typeof event.button === "number" && event.button !== 0) return;

    const index = Number(cell.getAttribute("data-index"));
    if (Number.isNaN(index)) return;

    clearLongPressTimer();
    longPressTriggered = false;

    longPressTimer = setTimeout(() => {
      setActive(index);
      if (cells[index]) {
        setCellValue(index, "");
        showToast(TEXT.cellCleared);
      }
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
      longPressTriggered = true;
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  };

  const handleNumpadClick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const key = button.getAttribute("data-key");
    if (key === "backspace") {
      backspace();
      return;
    }

    const digit = button.getAttribute("data-digit");
    if (!digit) return;

    inputDigit(digit);
  };

  const formatGridText = () => {
    const rows = [];
    for (let row = 0; row < ROWS; row += 1) {
      const line = [];
      for (let col = 0; col < COLS; col += 1) {
        const index = row * COLS + col;
        line.push(cells[index] ? cells[index] : ".");
      }
      rows.push(line.join(" "));
    }
    return rows.join("\n");
  };

  const copyGrid = async () => {
    const text = formatGridText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast(TEXT.copied);
    } catch (error) {
      showToast(TEXT.copyFailed);
      console.error("Copy failed", error);
    }
  };

  const buildGridCanvas = () => {
    const gridWidth = IMAGE_WIDTH - IMAGE_PADDING * 2;
    const cellWidth = gridWidth / COLS;
    const cellHeight = Math.round(cellWidth * IMAGE_CELL_HEIGHT_RATIO);
    const gridHeight = cellHeight * ROWS;
    const height = gridHeight + IMAGE_PADDING * 2;

    const canvas = document.createElement("canvas");
    canvas.width = IMAGE_WIDTH;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Paper background
    ctx.fillStyle = IMAGE_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle graph-paper grid over entire canvas
    ctx.strokeStyle = IMAGE_GRID_SUBTLE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += IMAGE_GRID_STEP) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += IMAGE_GRID_STEP) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Bold blue grid lines
    ctx.strokeStyle = IMAGE_LINE;
    ctx.lineWidth = IMAGE_LINE_W;
    ctx.strokeRect(IMAGE_PADDING, IMAGE_PADDING, gridWidth, gridHeight);

    ctx.beginPath();
    for (let col = 1; col < COLS; col += 1) {
      const x = IMAGE_PADDING + col * cellWidth;
      ctx.moveTo(x, IMAGE_PADDING);
      ctx.lineTo(x, IMAGE_PADDING + gridHeight);
    }
    for (let row = 1; row < ROWS; row += 1) {
      const y = IMAGE_PADDING + row * cellHeight;
      ctx.moveTo(IMAGE_PADDING, y);
      ctx.lineTo(IMAGE_PADDING + gridWidth, y);
    }
    ctx.stroke();

    // Bold dark text
    ctx.fillStyle = IMAGE_TEXT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(cellHeight * 0.48)}px "Fira Sans", "Trebuchet MS", sans-serif`;

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const index = row * COLS + col;
        const value = cells[index];
        if (!value) continue;
        const x = IMAGE_PADDING + col * cellWidth + cellWidth / 2;
        const y = IMAGE_PADDING + row * cellHeight + cellHeight / 2;
        ctx.fillText(value, x, y);
      }
    }

    return canvas;
  };

  const createGridPngBlob = () =>
    new Promise((resolve, reject) => {
      const canvas = buildGridCanvas();
      if (!canvas) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Failed to build PNG"));
      }, "image/png");
    });

  const shareToWhatsApp = async () => {
    try {
      const blob = await createGridPngBlob();
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File([blob], `car-grid-${timestamp}.png`, { type: "image/png" });

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file]
        });
        showToast(TEXT.whatsappShared);
        return;
      }

      showToast(TEXT.whatsappUnsupported);
      window.open("https://wa.me/", "_blank", "noopener,noreferrer");
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      console.error("WhatsApp share failed", error);
      showToast(TEXT.whatsappFailed);
    }
  };

  const isConfirmOpen = () => Boolean(confirmBackdropEl && !confirmBackdropEl.hidden);

  const openClearConfirm = () => {
    if (!confirmBackdropEl) return;
    clearPendingAdvance();
    confirmBackdropEl.hidden = false;
    requestAnimationFrame(() => {
      confirmBackdropEl.classList.add("show");
    });
  };

  const closeClearConfirm = () => {
    if (!confirmBackdropEl) return;
    confirmBackdropEl.classList.remove("show");
    setTimeout(() => {
      if (!confirmBackdropEl.classList.contains("show")) {
        confirmBackdropEl.hidden = true;
      }
    }, 200);
  };

  const clearGridWithUndo = () => {
    clearSnapshot = {
      cells: cells.slice(),
      activeIndex
    };

    cells = new Array(TOTAL).fill("");
    renderGrid();
    setActive(0);
    saveState();
    showUndo(TEXT.cleared);
  };

  const undoClear = () => {
    if (!clearSnapshot) return;
    cells = clearSnapshot.cells.slice();
    renderGrid();
    setActive(clearSnapshot.activeIndex);
    saveState();
    clearSnapshot = null;
    hideUndo();
    showToast(TEXT.undoDone);
  };

  const handleAction = async (event) => {
    const action = event.currentTarget.getAttribute("data-action");
    if (action === "clear") {
      openClearConfirm();
    } else if (action === "copy") {
      await copyGrid();
    } else if (action === "whatsapp") {
      await shareToWhatsApp();
    }
  };

  const handleConfirmClick = (event) => {
    const button = event.target.closest("button[data-confirm]");
    if (!button) return;
    const command = button.getAttribute("data-confirm");
    if (command === "accept") {
      clearGridWithUndo();
    }
    closeClearConfirm();
  };

  const handleConfirmBackdropClick = (event) => {
    if (event.target === confirmBackdropEl) {
      closeClearConfirm();
    }
  };

  const handleKeydown = (event) => {
    if (isConfirmOpen()) {
      if (event.key === "Escape") {
        closeClearConfirm();
        event.preventDefault();
      }
      return;
    }

    if (event.key >= "0" && event.key <= "9") {
      inputDigit(event.key);
      event.preventDefault();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      backspace();
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowLeft" && activeIndex % COLS !== 0) {
      setActive(activeIndex - 1, { focus: true });
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight" && activeIndex % COLS !== COLS - 1) {
      setActive(activeIndex + 1, { focus: true });
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowUp" && activeIndex >= COLS) {
      setActive(activeIndex - COLS, { focus: true });
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowDown" && activeIndex < TOTAL - COLS) {
      setActive(activeIndex + COLS, { focus: true });
      event.preventDefault();
    }
  };

  const init = () => {
    applyI18n();
    buildGrid();
    loadState();
    renderGrid();
    setActive(0);

    gridEl.addEventListener("click", handleGridClick);
    gridEl.addEventListener("pointerdown", handleGridPointerDown);
    gridEl.addEventListener("pointerup", clearLongPressTimer);
    gridEl.addEventListener("pointercancel", clearLongPressTimer);
    gridEl.addEventListener("pointerleave", clearLongPressTimer);
    numpadEl.addEventListener("click", handleNumpadClick);
    actionButtons.forEach((button) => {
      button.addEventListener("click", handleAction);
    });

    if (undoBtnEl) {
      undoBtnEl.addEventListener("click", undoClear);
    }

    if (confirmBackdropEl) {
      confirmBackdropEl.addEventListener("click", handleConfirmClick);
      confirmBackdropEl.addEventListener("click", handleConfirmBackdropClick);
    }

    document.addEventListener("keydown", handleKeydown);
  };

  init();
})();
