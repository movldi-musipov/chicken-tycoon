(() => {
  const ROWS = 8;
  const COLS = 5;
  const TOTAL = ROWS * COLS;
  const STORAGE_KEY = "car_grid_v1";

  const TEXT = {
    title: "\u0423\u0447\u0435\u0442 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u0435\u0439",
    clear: "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c",
    copy: "\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c",
    shot: "\u0421\u043a\u0440\u0438\u043d\u0448\u043e\u0442",
    clearConfirm: "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0432\u0441\u0435 \u044f\u0447\u0435\u0439\u043a\u0438?",
    copied: "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e",
    shotReady: "\u0421\u043a\u0440\u0438\u043d\u0448\u043e\u0442 \u0433\u043e\u0442\u043e\u0432"
  };

  const gridEl = document.getElementById("grid");
  const toastEl = document.getElementById("toast");
  const numpadEl = document.querySelector(".numpad");
  const actionButtons = document.querySelectorAll(".action");

  let cells = new Array(TOTAL).fill("");
  let cellEls = [];
  let activeIndex = 0;
  let toastTimer = null;

  const ensureDigit = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[0-9]$/.test(trimmed) ? trimmed : "";
  };

  const applyI18n = () => {
    document.title = TEXT.title;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (TEXT[key]) {
        el.textContent = TEXT[key];
      }
    });
  };

  const showToast = (message) => {
    if (!message) return;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
  };

  const loadState = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length !== TOTAL) return;
      cells = parsed.map((value) => ensureDigit(String(value)));
    } catch (error) {
      console.warn("Failed to read stored grid", error);
    }
  };

  const setActive = (index) => {
    const clamped = Math.max(0, Math.min(TOTAL - 1, index));
    activeIndex = clamped;
    cellEls.forEach((cell, idx) => {
      if (idx === clamped) {
        cell.classList.add("active");
        cell.setAttribute("aria-selected", "true");
      } else {
        cell.classList.remove("active");
        cell.setAttribute("aria-selected", "false");
      }
    });
  };

  const setCellValue = (index, value) => {
    const clean = ensureDigit(value);
    cells[index] = clean;
    cellEls[index].textContent = clean;
    saveState();
  };

  const moveNext = () => {
    if (activeIndex < TOTAL - 1) {
      setActive(activeIndex + 1);
    }
  };

  const buildGrid = () => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < TOTAL; i += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("data-index", String(i));
      fragment.appendChild(cell);
      cellEls.push(cell);
    }
    gridEl.appendChild(fragment);
  };

  const renderGrid = () => {
    cellEls.forEach((cell, index) => {
      cell.textContent = cells[index] || "";
    });
  };

  const handleGridClick = (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    const index = Number(cell.getAttribute("data-index"));
    if (!Number.isNaN(index)) {
      setActive(index);
    }
  };

  const handleNumpadClick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const digit = button.getAttribute("data-digit");
    if (!digit) return;
    if (activeIndex == null) {
      setActive(0);
    }
    setCellValue(activeIndex, digit);
    moveNext();
  };

  const formatGridText = () => {
    const rows = [];
    for (let row = 0; row < ROWS; row += 1) {
      let line = "";
      for (let col = 0; col < COLS; col += 1) {
        const index = row * COLS + col;
        line += cells[index] ? cells[index] : ".";
      }
      rows.push(line);
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
      console.error("Copy failed", error);
    }
  };

  const clearGrid = () => {
    if (!window.confirm(TEXT.clearConfirm)) return;
    cells = new Array(TOTAL).fill("");
    renderGrid();
    setActive(0);
    saveState();
  };

  const renderScreenshot = () => {
    const rect = gridEl.getBoundingClientRect();
    const scale = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);

    const rootStyles = getComputedStyle(document.documentElement);
    const bg = rootStyles.getPropertyValue("--grid-bg").trim() || "#0c1119";
    const line = rootStyles.getPropertyValue("--grid-line").trim() || "rgba(255,255,255,0.14)";
    const textColor = rootStyles.getPropertyValue("--text").trim() || "#ffffff";
    const fontFamily = getComputedStyle(gridEl).fontFamily || "sans-serif";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const cellW = rect.width / COLS;
    const cellH = rect.height / ROWS;

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;

    ctx.strokeRect(0, 0, rect.width, rect.height);

    for (let col = 1; col < COLS; col += 1) {
      const x = col * cellW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }

    for (let row = 1; row < ROWS; row += 1) {
      const y = row * cellH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    const fontSize = Math.min(cellW, cellH) * 0.55;
    ctx.fillStyle = textColor;
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const index = row * COLS + col;
        const value = cells[index];
        if (!value) continue;
        const x = col * cellW + cellW / 2;
        const y = row * cellH + cellH / 2;
        ctx.fillText(value, x, y);
      }
    }

    const link = document.createElement("a");
    link.download = "car-grid.png";
    link.href = canvas.toDataURL("image/png");
    link.click();

    showToast(TEXT.shotReady);
  };

  const handleAction = (event) => {
    const action = event.currentTarget.getAttribute("data-action");
    if (action === "clear") {
      clearGrid();
    } else if (action === "copy") {
      copyGrid();
    } else if (action === "shot") {
      renderScreenshot();
    }
  };

  const init = () => {
    applyI18n();
    buildGrid();
    loadState();
    renderGrid();
    setActive(0);

    gridEl.addEventListener("click", handleGridClick);
    numpadEl.addEventListener("click", handleNumpadClick);
    actionButtons.forEach((button) => {
      button.addEventListener("click", handleAction);
    });
  };

  init();
})();
