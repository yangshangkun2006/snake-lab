(() => {
  'use strict';

  const COLS = 20;
  const ROWS = 20;
  const SIZE = 640;
  const CELL = SIZE / COLS;
  const BASE_TICK = 145;
  const MIN_TICK = 72;
  const BEST_KEY = 'snake-lab-best';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const speedEl = document.getElementById('speed');
  const pauseBtn = document.getElementById('pause');
  const overlay = document.getElementById('overlay');
  const overlayKicker = document.getElementById('overlay-kicker');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const startBtn = document.getElementById('start');
  const dpadButtons = document.querySelectorAll('[data-dir]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DIRS = Object.freeze({
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  });

  let snake = [];
  let dir = DIRS.right;
  let queue = [];
  let food = null;
  let score = 0;
  let best = loadBest();
  let status = 'idle';
  let tickMs = BASE_TICK;
  let acc = 0;
  let lastTime = 0;
  let particles = [];
  let flash = 0;
  let overlayAction = 'start';
  let pointerStart = null;

  function loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      /* storage can be unavailable; the game still works */
    }
  }

  function setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function randomFreeCell() {
    const occupied = new Set(snake.map((segment) => segment.y * COLS + segment.x));
    if (occupied.size >= COLS * ROWS) return null;

    const free = [];
    for (let index = 0; index < COLS * ROWS; index += 1) {
      if (!occupied.has(index)) free.push(index);
    }

    const pick = free[Math.floor(Math.random() * free.length)];
    return { x: pick % COLS, y: Math.floor(pick / COLS) };
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    speedEl.textContent = `${(BASE_TICK / tickMs).toFixed(1)}×`;
  }

  function showOverlay(kicker, title, text, action) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayAction = action;
    startBtn.textContent = action === 'resume' ? 'Resume' : action === 'again' ? 'Play again' : 'Start game';
    overlay.classList.remove('is-hidden');
  }

  function hideOverlay() {
    overlay.classList.add('is-hidden');
  }

  function newGame() {
    snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ];
    dir = DIRS.right;
    queue = [];
    score = 0;
    tickMs = BASE_TICK;
    acc = 0;
    flash = 0;
    particles = [];
    status = 'idle';
    food = randomFreeCell();
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    updateHud();
    showOverlay('Ready?', 'Press an arrow to start', 'Or tap the board on mobile.', 'start');
  }

  function startGame() {
    newGame();
    status = 'running';
    lastTime = performance.now();
    acc = 0;
    pauseBtn.disabled = false;
    hideOverlay();
    canvas.focus({ preventScroll: true });
  }

  function resumeGame() {
    if (status !== 'paused') return;
    status = 'running';
    lastTime = performance.now();
    acc = 0;
    pauseBtn.textContent = 'Pause';
    hideOverlay();
  }

  function togglePause() {
    if (status === 'running') {
      status = 'paused';
      pauseBtn.textContent = 'Resume';
      showOverlay('Paused', 'Take a breath.', 'The board is waiting.', 'resume');
      return;
    }

    if (status === 'paused') {
      resumeGame();
      return;
    }

    if (status === 'idle') startGame();
  }

  function gameOver() {
    status = 'over';
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    updateHud();
    showOverlay('Game over', `Score ${score}`, `Best ${best}`, 'again');
  }

  function win() {
    status = 'won';
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    updateHud();
    showOverlay('Board cleared', `Score ${score}`, 'You filled every cell.', 'again');
  }

  function enqueueDirection(name) {
    const next = DIRS[name];
    if (!next) return;

    if (status === 'idle' || status === 'over' || status === 'won') {
      startGame();
    }

    if (status !== 'running') return;

    const last = queue.length ? queue[queue.length - 1] : dir;
    if (next.x === -last.x && next.y === -last.y) return;
    if (next.x === last.x && next.y === last.y) return;
    if (queue.length < 2) queue.push(next);
  }

  function burst(cellX, cellY) {
    if (reduceMotion) return;
    for (let index = 0; index < 10; index += 1) {
      particles.push({
        x: (cellX + 0.5) * CELL,
        y: (cellY + 0.5) * CELL,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function step() {
    if (status !== 'running') return;
    if (queue.length) dir = queue.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameOver();
      return;
    }

    const growing = food && head.x === food.x && head.y === food.y;
    const body = growing ? snake : snake.slice(0, -1);
    if (body.some((segment) => segment.x === head.x && segment.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);

    if (growing) {
      score += 1;
      flash = 1;
      burst(head.x, head.y);
      if (score > best) {
        best = score;
        saveBest();
      }
      tickMs = Math.max(MIN_TICK, BASE_TICK - score * 4);
      food = randomFreeCell();
      updateHud();
      if (!food) win();
      return;
    }

    snake.pop();
  }

  function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawFood(time) {
    if (!food) return;

    const cx = (food.x + 0.5) * CELL;
    const cy = (food.y + 0.5) * CELL;
    const pulse = reduceMotion ? 1 : 1 + Math.sin(time / 260) * 0.08;

    ctx.save();
    ctx.shadowColor = 'rgba(78, 240, 164, 0.9)';
    ctx.shadowBlur = 24;
    const gradient = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, CELL * 0.42);
    gradient.addColorStop(0, '#e4fff0');
    gradient.addColorStop(0.42, '#4ef0a4');
    gradient.addColorStop(1, '#0e7a4e');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.27 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(160, 255, 205, 0.9)';
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy - 9, 4.5, 2.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEyes(x, y, width, height) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const offset = CELL * 0.18;
    const eyeRadius = Math.max(1.7, CELL * 0.055);
    let first;
    let second;

    if (dir.x === 1) {
      first = { x: centerX + offset, y: centerY - offset };
      second = { x: centerX + offset, y: centerY + offset };
    } else if (dir.x === -1) {
      first = { x: centerX - offset, y: centerY - offset };
      second = { x: centerX - offset, y: centerY + offset };
    } else if (dir.y === -1) {
      first = { x: centerX - offset, y: centerY - offset };
      second = { x: centerX + offset, y: centerY - offset };
    } else {
      first = { x: centerX - offset, y: centerY + offset };
      second = { x: centerX + offset, y: centerY + offset };
    }

    ctx.fillStyle = '#04120b';
    [first, second].forEach((eye) => {
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawSnake() {
    for (let index = snake.length - 1; index >= 0; index -= 1) {
      const segment = snake[index];
      const inset = 2.2;
      const x = segment.x * CELL + inset;
      const y = segment.y * CELL + inset;
      const width = CELL - inset * 2;
      const height = CELL - inset * 2;
      const lightness = Math.max(34, 66 - index * 1.8);

      ctx.fillStyle = index === 0 ? '#9affcf' : `hsl(157, 72%, ${lightness}%)`;
      roundRect(x, y, width, height, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(4, 18, 11, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (index === 0) drawEyes(x, y, width, height);
    }
  }

  function drawParticles() {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      particle.life -= 0.025;

      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }

      ctx.globalAlpha = particle.life;
      ctx.fillStyle = '#4ef0a4';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw(time) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    const background = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    background.addColorStop(0, '#08101a');
    background.addColorStop(1, '#060a10');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = 'rgba(126, 160, 196, 0.075)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let index = 1; index < COLS; index += 1) {
      const position = index * CELL;
      ctx.moveTo(position, 0);
      ctx.lineTo(position, SIZE);
      ctx.moveTo(0, position);
      ctx.lineTo(SIZE, position);
    }
    ctx.stroke();

    const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, CELL * 2, SIZE / 2, SIZE / 2, SIZE * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, SIZE, SIZE);

    drawFood(time);
    drawSnake();
    drawParticles();

    if (flash > 0) {
      ctx.fillStyle = `rgba(78, 240, 164, ${flash * 0.08})`;
      ctx.fillRect(0, 0, SIZE, SIZE);
      flash *= 0.9;
      if (flash < 0.01) flash = 0;
    }
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    const delta = Math.min(100, time - lastTime);
    lastTime = time;

    if (status === 'running') {
      acc += delta;
      let guard = 0;
      while (acc >= tickMs && status === 'running' && guard < 6) {
        step();
        acc -= tickMs;
        guard += 1;
      }
    }

    draw(time);
    requestAnimationFrame(frame);
  }

  const keyMap = {
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right',
  };

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (keyMap[key]) {
      event.preventDefault();
      enqueueDirection(keyMap[key]);
      return;
    }

    if (key === ' ' || key === 'p') {
      event.preventDefault();
      if (status === 'idle' || status === 'over' || status === 'won') startGame();
      else togglePause();
      return;
    }

    if (key === 'r') {
      event.preventDefault();
      startGame();
      return;
    }

    if (key === 'enter' && (status === 'idle' || status === 'over' || status === 'won')) {
      event.preventDefault();
      startGame();
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    if (status === 'idle') startGame();
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;

    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      enqueueDirection(dx > 0 ? 'right' : 'left');
    } else {
      enqueueDirection(dy > 0 ? 'down' : 'up');
    }
  });

  canvas.addEventListener('pointercancel', () => {
    pointerStart = null;
  });

  dpadButtons.forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      enqueueDirection(button.dataset.dir);
    });
  });

  startBtn.addEventListener('click', () => {
    if (overlayAction === 'resume') resumeGame();
    else startGame();
  });

  pauseBtn.addEventListener('click', togglePause);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && status === 'running') togglePause();
  });

  window.addEventListener('resize', setupCanvas);

  setupCanvas();
  newGame();
  if (new URLSearchParams(location.search).get('play') === '1') {
    startGame();
    food = { x: 14, y: 10 };
  }
  requestAnimationFrame(frame);
})();
