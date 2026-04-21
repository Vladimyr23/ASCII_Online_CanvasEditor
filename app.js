/* =============================================
   ASCII Canvas Editor — app.js
   ============================================= */

(function () {
  'use strict';

  // ─── CONFIG ──────────────────────────────────
  const COLS = 160;
  const ROWS = 60;
  const FONT_SIZE = 14;
  const FONT_FAMILY = '"JetBrains Mono", monospace';
  const BG_COLOR = '#0e0e12';
  const GRID_COLOR = 'rgba(255,255,255,0.03)';
  const CHAR_COLOR = '#e8e8ec';
  const CURSOR_COLOR = 'rgba(79,207,176,0.25)';
  const SELECTION_COLOR = 'rgba(79,207,176,0.12)';
  const PREVIEW_COLOR = 'rgba(79,207,176,0.5)';

  // ─── STATE ──────────────────────────────────
  let grid = [];
  let undoStack = [];
  let redoStack = [];
  let currentTool = 'select';
  let borderStyle = 'simple';
  let arrowStyle = 'standard';
  let zoom = 1;
  let panX = 0, panY = 0;
  let isPanning = false;
  let isDrawing = false;
  let spaceDown = false;
  let drawStartCol = 0, drawStartRow = 0;
  let lastPanX = 0, lastPanY = 0;
  let panStartX = 0, panStartY = 0;
  let cellW = 0, cellH = 0;
  let hoverCol = -1, hoverRow = -1;
  let previewCells = [];
  let selectedShape = null; // {cells: [{col, row, char}], startCol, startRow}
  let moveOffsetCol = 0, moveOffsetRow = 0;
  let isMoving = false;
  let freehandCells = [];

  // ─── DOM ────────────────────────────────────
  const canvas = document.getElementById('ascii-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const container = document.getElementById('canvas-container');
  const wrapper = document.getElementById('canvas-wrapper');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const btnCopy = document.getElementById('btn-copy');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const zoomDisplay = document.getElementById('zoom-display');
  const statusTool = document.getElementById('status-tool');
  const statusPos = document.getElementById('status-pos');
  const statusCanvas = document.getElementById('status-canvas');
  const toast = document.getElementById('toast');
  const borderStyleSection = document.getElementById('border-style-section');
  const arrowStyleSection = document.getElementById('arrow-style-section');
  const textOverlay = document.getElementById('text-input-overlay');
  const textInput = document.getElementById('text-input');
  const toolBtns = document.querySelectorAll('.tool-btn');
  const borderBtns = document.querySelectorAll('.border-btn');
  const arrowBtns = document.querySelectorAll('.arrow-btn');

  // ─── BORDER CHARS ───────────────────────────
  const BORDERS = {
    simple:  { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
    rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
    double:  { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    heavy:   { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
    ascii:   { tl: '/', tr: '\\', bl: '\\', br: '/', h: '-', v: '|' },
  };

  const ARROW_CHARS = {
    standard: { right: '>', left: '<', up: '^', down: 'v' },
    triangle: { right: '▶', left: '◀', up: '▲', down: '▼' },
  };

  // ─── INIT ───────────────────────────────────
  function init() {
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = ' ';
      }
    }
    measureCell();
    resizeCanvas();
    render();
    updateStatus();

    statusCanvas.textContent = `Canvas: ${COLS}×${ROWS}`;
    fitToWindow();
  }

  function measureCell() {
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    cellW = ctx.measureText('M').width;
    // Round to get crisp rendering
    cellW = Math.round(cellW);
    cellH = Math.round(FONT_SIZE * 1.35);
  }

  function resizeCanvas() {
    const w = COLS * cellW;
    const h = ROWS * cellH;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    wrapper.style.width = w + 'px';
    wrapper.style.height = h + 'px';
  }

  // ─── RENDERING ──────────────────────────────
  function render() {
    const w = COLS * cellW;
    const h = ROWS * cellH;

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Grid dots
    ctx.fillStyle = GRID_COLOR;
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        ctx.fillRect(c * cellW, r * cellH, 1, 1);
      }
    }

    // Hover highlight
    if (hoverCol >= 0 && hoverRow >= 0 && hoverCol < COLS && hoverRow < ROWS) {
      ctx.fillStyle = CURSOR_COLOR;
      ctx.fillRect(hoverCol * cellW, hoverRow * cellH, cellW, cellH);
    }

    // Selection highlight
    if (selectedShape && !isMoving) {
      ctx.fillStyle = SELECTION_COLOR;
      selectedShape.cells.forEach(c => {
        ctx.fillRect(c.col * cellW, c.row * cellH, cellW, cellH);
      });
    }

    // Preview cells
    if (previewCells.length > 0) {
      ctx.fillStyle = 'rgba(79,207,176,0.08)';
      previewCells.forEach(pc => {
        ctx.fillRect(pc.col * cellW, pc.row * cellH, cellW, cellH);
      });
    }

    // Characters
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch !== ' ') {
          ctx.fillStyle = CHAR_COLOR;
          ctx.fillText(ch, c * cellW, r * cellH + (cellH - FONT_SIZE) / 2);
        }
      }
    }

    // Preview characters
    ctx.fillStyle = PREVIEW_COLOR;
    previewCells.forEach(pc => {
      if (pc.char && pc.char !== ' ') {
        ctx.fillText(pc.char, pc.col * cellW, pc.row * cellH + (cellH - FONT_SIZE) / 2);
      }
    });

    // Update transform
    wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  // ─── GRID HELPERS ───────────────────────────
  function setCell(col, row, char) {
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      grid[row][col] = char;
    }
  }

  function getCell(col, row) {
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      return grid[row][col];
    }
    return ' ';
  }

  function cloneGrid() {
    return grid.map(row => [...row]);
  }

  function pushUndo() {
    undoStack.push(cloneGrid());
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    updateUndoRedoBtns();
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(cloneGrid());
    grid = undoStack.pop();
    updateUndoRedoBtns();
    render();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(cloneGrid());
    grid = redoStack.pop();
    updateUndoRedoBtns();
    render();
  }

  function updateUndoRedoBtns() {
    btnUndo.disabled = undoStack.length === 0;
    btnRedo.disabled = redoStack.length === 0;
  }

  // ─── COORDINATE CONVERSION ──────────────────
  function screenToGrid(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / zoom;
    const y = (clientY - rect.top - panY) / zoom;
    return {
      col: Math.floor(x / cellW),
      row: Math.floor(y / cellH)
    };
  }

  // ─── TOOL SWITCHING ─────────────────────────
  function setTool(tool) {
    currentTool = tool;
    toolBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));

    container.className = '';
    if (tool === 'select') container.classList.add('tool-select');
    else if (tool === 'text') container.classList.add('tool-text');
    else if (tool === 'eraser') container.classList.add('tool-eraser');

    // Show/hide property panels
    borderStyleSection.style.display = (tool === 'rect' || tool === 'diamond') ? '' : 'none';
    arrowStyleSection.style.display = (tool === 'arrow') ? '' : 'none';

    statusTool.textContent = 'Tool: ' + tool.charAt(0).toUpperCase() + tool.slice(1);
    selectedShape = null;
    previewCells = [];
    render();
  }

  // ─── DRAWING TOOLS ──────────────────────────

  function getRectCells(c1, r1, c2, r2, style) {
    const cells = [];
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const b = BORDERS[style];

    if (maxC - minC < 1 || maxR - minR < 1) return cells;

    // Corners
    cells.push({ col: minC, row: minR, char: b.tl });
    cells.push({ col: maxC, row: minR, char: b.tr });
    cells.push({ col: minC, row: maxR, char: b.bl });
    cells.push({ col: maxC, row: maxR, char: b.br });

    // Horizontal edges
    for (let c = minC + 1; c < maxC; c++) {
      cells.push({ col: c, row: minR, char: b.h });
      cells.push({ col: c, row: maxR, char: b.h });
    }

    // Vertical edges
    for (let r = minR + 1; r < maxR; r++) {
      cells.push({ col: minC, row: r, char: b.v });
      cells.push({ col: maxC, row: r, char: b.v });
    }

    return cells;
  }

  function getDiamondCells(c1, r1, c2, r2, style) {
    const cells = [];
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const midC = Math.round((minC + maxC) / 2);
    const midR = Math.round((minR + maxR) / 2);
    const halfW = maxC - midC;
    const halfH = maxR - midR;

    if (halfW < 1 || halfH < 1) return cells;

    const b = BORDERS[style];

    // Draw diamond edges
    for (let r = minR; r <= maxR; r++) {
      const frac = r <= midR ? (r - minR) / halfH : (maxR - r) / halfH;
      const w = Math.round(frac * halfW);
      const leftC = midC - w;
      const rightC = midC + w;

      if (r === minR || r === maxR) {
        // Top and bottom tips
        cells.push({ col: midC, row: r, char: r === minR ? b.tl : b.bl });
      } else {
        cells.push({ col: leftC, row: r, char: r < midR ? '/' : '\\' });
        cells.push({ col: rightC, row: r, char: r < midR ? '\\' : '/' });
        // Fill horizontal edges at widest point
        if (r === midR) {
          for (let c = leftC + 1; c < rightC; c++) {
            cells.push({ col: c, row: r, char: ' ' });
          }
        }
      }
    }

    return cells;
  }

  function getLineCells(c1, r1, c2, r2) {
    const cells = [];
    // Use orthogonal lines (horizontal then vertical, or vice versa)
    const dx = c2 - c1;
    const dy = r2 - r1;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal first, then vertical
      const dir = dx > 0 ? 1 : -1;
      for (let c = c1; c !== c2; c += dir) {
        cells.push({ col: c, row: r1, char: '-' });
      }
      const vDir = dy > 0 ? 1 : -1;
      for (let r = r1; r !== r2; r += vDir) {
        cells.push({ col: c2, row: r, char: '|' });
      }
      cells.push({ col: c2, row: r2, char: '+' });
      // Corner
      if (dy !== 0 && dx !== 0) {
        cells.push({ col: c2, row: r1, char: '+' });
      }
    } else {
      // Vertical first, then horizontal
      const vDir = dy > 0 ? 1 : -1;
      for (let r = r1; r !== r2; r += vDir) {
        cells.push({ col: c1, row: r, char: '|' });
      }
      const dir = dx > 0 ? 1 : -1;
      for (let c = c1; c !== c2; c += dir) {
        cells.push({ col: c, row: r2, char: '-' });
      }
      cells.push({ col: c2, row: r2, char: '+' });
      // Corner
      if (dx !== 0 && dy !== 0) {
        cells.push({ col: c1, row: r2, char: '+' });
      }
    }

    return cells;
  }

  function getArrowCells(c1, r1, c2, r2) {
    const cells = getLineCells(c1, r1, c2, r2);
    const arrows = ARROW_CHARS[arrowStyle];

    // Determine arrow direction at endpoint
    if (cells.length > 0) {
      // Remove the last '+' and replace with arrow head
      const last = cells[cells.length - 1];
      if (c2 > c1 && r2 === r1) last.char = arrows.right;
      else if (c2 < c1 && r2 === r1) last.char = arrows.left;
      else if (r2 > r1) last.char = arrows.down;
      else if (r2 < r1) last.char = arrows.up;
      else {
        // Determine from last segment
        if (cells.length >= 2) {
          const prev = cells[cells.length - 2];
          if (last.col > prev.col) last.char = arrows.right;
          else if (last.col < prev.col) last.char = arrows.left;
          else if (last.row > prev.row) last.char = arrows.down;
          else last.char = arrows.up;
        }
      }
    }

    return cells;
  }

  // ─── SELECTION (FLOOD FILL TO FIND CONNECTED SHAPE) ─────
  function findShapeAt(col, row) {
    const ch = getCell(col, row);
    if (ch === ' ') return null;

    const visited = new Set();
    const queue = [{ col, row }];
    const cells = [];

    while (queue.length > 0) {
      const { col: c, row: r } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      if (grid[r][c] === ' ') continue;

      visited.add(key);
      cells.push({ col: c, row: r, char: grid[r][c] });

      // 4-directional neighbors
      queue.push({ col: c - 1, row: r });
      queue.push({ col: c + 1, row: r });
      queue.push({ col: c, row: r - 1 });
      queue.push({ col: c, row: r + 1 });
    }

    return cells.length > 0 ? { cells } : null;
  }

  // ─── MOUSE EVENTS ──────────────────────────
  container.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (spaceDown || e.button === 1) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      container.classList.add('panning');
      return;
    }

    const { col, row } = screenToGrid(e.clientX, e.clientY);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (currentTool === 'select') {
      const shape = findShapeAt(col, row);
      if (shape) {
        selectedShape = shape;
        moveOffsetCol = col;
        moveOffsetRow = row;
        isMoving = true;
        // Save for undo
        pushUndo();
        // Remove original characters
        shape.cells.forEach(c => setCell(c.col, c.row, ' '));
      } else {
        selectedShape = null;
      }
      render();
      return;
    }

    if (currentTool === 'text') {
      showTextInput(col, row, e.clientX, e.clientY);
      return;
    }

    isDrawing = true;
    drawStartCol = col;
    drawStartRow = row;
    previewCells = [];

    if (currentTool === 'freehand') {
      pushUndo();
      freehandCells = [{ col, row }];
      setCell(col, row, '*');
      render();
    } else if (currentTool === 'eraser') {
      pushUndo();
      setCell(col, row, ' ');
      render();
    }
  });

  container.addEventListener('mousemove', (e) => {
    e.preventDefault();

    if (isPanning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      render();
      return;
    }

    const { col, row } = screenToGrid(e.clientX, e.clientY);
    hoverCol = col;
    hoverRow = row;
    statusPos.textContent = `${Math.max(0, col)}, ${Math.max(0, row)}`;

    if (isMoving && selectedShape) {
      const dCol = col - moveOffsetCol;
      const dRow = row - moveOffsetRow;

      // Update preview
      previewCells = selectedShape.cells.map(c => ({
        col: c.col + dCol,
        row: c.row + dRow,
        char: c.char
      }));
      render();
      return;
    }

    if (!isDrawing) {
      render();
      return;
    }

    if (currentTool === 'rect') {
      previewCells = getRectCells(drawStartCol, drawStartRow, col, row, borderStyle);
    } else if (currentTool === 'diamond') {
      previewCells = getDiamondCells(drawStartCol, drawStartRow, col, row, borderStyle);
    } else if (currentTool === 'line') {
      previewCells = getLineCells(drawStartCol, drawStartRow, col, row);
    } else if (currentTool === 'arrow') {
      previewCells = getArrowCells(drawStartCol, drawStartRow, col, row);
    } else if (currentTool === 'freehand') {
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
        const last = freehandCells[freehandCells.length - 1];
        if (!last || last.col !== col || last.row !== row) {
          freehandCells.push({ col, row });
          setCell(col, row, '*');
        }
      }
    } else if (currentTool === 'eraser') {
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
        setCell(col, row, ' ');
      }
    }

    render();
  });

  container.addEventListener('mouseup', (e) => {
    e.preventDefault();

    if (isPanning) {
      isPanning = false;
      container.classList.remove('panning');
      return;
    }

    if (isMoving && selectedShape) {
      const { col, row } = screenToGrid(e.clientX, e.clientY);
      const dCol = col - moveOffsetCol;
      const dRow = row - moveOffsetRow;

      // Place shape at new position
      selectedShape.cells.forEach(c => {
        setCell(c.col + dCol, c.row + dRow, c.char);
      });

      // Update selectedShape positions
      selectedShape.cells = selectedShape.cells.map(c => ({
        col: c.col + dCol,
        row: c.row + dRow,
        char: c.char
      }));

      isMoving = false;
      previewCells = [];
      render();
      return;
    }

    if (!isDrawing) return;
    isDrawing = false;

    if (currentTool === 'freehand' || currentTool === 'eraser') {
      freehandCells = [];
      previewCells = [];
      render();
      return;
    }

    // Commit preview cells
    if (previewCells.length > 0) {
      pushUndo();
      previewCells.forEach(pc => {
        if (pc.col >= 0 && pc.col < COLS && pc.row >= 0 && pc.row < ROWS) {
          setCell(pc.col, pc.row, pc.char);
        }
      });
    }

    previewCells = [];
    render();
  });

  container.addEventListener('mouseleave', () => {
    hoverCol = -1;
    hoverRow = -1;
    render();
  });

  // Prevent context menu
  container.addEventListener('contextmenu', (e) => e.preventDefault());

  // ─── ZOOM ───────────────────────────────────
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldZoom = zoom;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.2, Math.min(5, zoom * delta));

    // Zoom toward mouse
    panX = mouseX - (mouseX - panX) * (zoom / oldZoom);
    panY = mouseY - (mouseY - panY) * (zoom / oldZoom);

    zoomDisplay.textContent = Math.round(zoom * 100) + '%';
    render();
  }, { passive: false });

  function fitToWindow() {
    const rect = container.getBoundingClientRect();
    const canvasW = COLS * cellW;
    const canvasH = ROWS * cellH;
    const scaleX = (rect.width - 40) / canvasW;
    const scaleY = (rect.height - 40) / canvasH;
    zoom = Math.min(scaleX, scaleY, 1);
    panX = (rect.width - canvasW * zoom) / 2;
    panY = (rect.height - canvasH * zoom) / 2;
    zoomDisplay.textContent = Math.round(zoom * 100) + '%';
    render();
  }

  // ─── TEXT INPUT ─────────────────────────────
  function showTextInput(col, row, clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const screenX = panX + col * cellW * zoom + rect.left;
    const screenY = panY + row * cellH * zoom + rect.top;

    textOverlay.classList.remove('hidden');
    textOverlay.style.left = screenX + 'px';
    textOverlay.style.top = screenY + 'px';

    textInput.value = '';
    textInput.style.fontSize = (FONT_SIZE * zoom) + 'px';
    textInput.focus();

    const commitText = () => {
      const text = textInput.value;
      if (text.length > 0) {
        pushUndo();
        const lines = text.split('\n');
        for (let l = 0; l < lines.length; l++) {
          for (let i = 0; i < lines[l].length; i++) {
            setCell(col + i, row + l, lines[l][i]);
          }
        }
        render();
      }
      textOverlay.classList.add('hidden');
      textInput.removeEventListener('blur', commitText);
      textInput.removeEventListener('keydown', handleTextKey);
    };

    const handleTextKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitText();
      } else if (e.key === 'Escape') {
        textOverlay.classList.add('hidden');
        textInput.removeEventListener('blur', commitText);
        textInput.removeEventListener('keydown', handleTextKey);
      }
    };

    textInput.addEventListener('blur', commitText);
    textInput.addEventListener('keydown', handleTextKey);
  }

  // ─── KEYBOARD SHORTCUTS ─────────────────────
  document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when text input is focused
    if (document.activeElement === textInput) return;

    if (e.key === ' ') {
      e.preventDefault();
      spaceDown = true;
      container.classList.add('panning');
    }

    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'v': setTool('select'); break;
        case 'r': setTool('rect'); break;
        case 'd': setTool('diamond'); break;
        case 'l': setTool('line'); break;
        case 'a': setTool('arrow'); break;
        case 't': setTool('text'); break;
        case 'f': setTool('freehand'); break;
        case 'e': setTool('eraser'); break;
      }
    }

    // Delete selected
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
      pushUndo();
      selectedShape.cells.forEach(c => setCell(c.col, c.row, ' '));
      selectedShape = null;
      render();
    }

    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }

    // Copy ASCII
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copyASCII();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spaceDown = false;
      if (!isPanning) container.classList.remove('panning');
    }
  });

  // ─── COPY ASCII ─────────────────────────────
  function copyASCII() {
    const text = getASCIIText();
    navigator.clipboard.writeText(text).then(() => {
      showToast();
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast();
    });
  }

  function getASCIIText() {
    // Find bounding box of non-space characters
    let minR = ROWS, maxR = 0, minC = COLS, maxC = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== ' ') {
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
    }

    if (minR > maxR) return ''; // Empty canvas

    const lines = [];
    for (let r = minR; r <= maxR; r++) {
      let line = '';
      for (let c = minC; c <= maxC; c++) {
        line += grid[r][c];
      }
      lines.push(line.trimEnd());
    }

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    return lines.join('\n');
  }

  function showToast() {
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  }

  // ─── BUTTON EVENTS ─────────────────────────
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  borderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      borderStyle = btn.dataset.border;
      borderBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  arrowBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      arrowStyle = btn.dataset.arrow;
      arrowBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnCopy.addEventListener('click', copyASCII);
  btnZoomFit.addEventListener('click', fitToWindow);

  btnClear.addEventListener('click', () => {
    pushUndo();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = ' ';
      }
    }
    selectedShape = null;
    render();
  });

  function updateStatus() {
    statusTool.textContent = 'Tool: ' + currentTool.charAt(0).toUpperCase() + currentTool.slice(1);
  }

  // ─── EXPOSE FOR AUTOMATION ──────────────────
  window.asciiEditor = {
    setCell, getCell, grid, render, pushUndo,
    COLS, ROWS, cellW, cellH,
    getASCIIText, setTool, borderStyle: () => borderStyle,
    setBorderStyle: (s) => { borderStyle = s; },
    copyASCII
  };

  // ─── INIT ───────────────────────────────────
  init();

})();
