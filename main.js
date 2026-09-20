import AudioEngine from './audio-engine.js';

const engine = new AudioEngine();

const refs = {
  app: document.getElementById('app'),
  settingsToggle: document.getElementById('settings-toggle'),
  settingsPanel: document.getElementById('settings-panel'),
  themesToggle: document.getElementById('themes-toggle'),
  themesPanel: document.getElementById('themes-panel'),
  themeOptions: document.querySelectorAll('.theme-option'),
  colorBg: document.getElementById('color-bg'),
  colorPanel: document.getElementById('color-panel'),
  colorAccent: document.getElementById('color-accent'),
  colorCyan: document.getElementById('color-cyan'),
  colorGradient: document.getElementById('color-gradient'),
  colorTimerGradient: document.getElementById('color-timer-gradient'),
  gradientToggle: document.getElementById('gradient-toggle'),
  modeToggle: document.getElementById('mode-toggle'),
  modeHold: document.getElementById('mode-hold'),
  layoutToggle: document.getElementById('layout-toggle'),
  mainContainer: document.getElementById('main-container'),
  fileInput: document.getElementById('file-input'),
  dropZone: document.getElementById('drop-zone'),
  tapeName: document.getElementById('tape-name'),
  wheelStatus: document.getElementById('wheel-status'),
  odometer: document.getElementById('odometer'),
  speedFill: document.getElementById('speed-fill'),
  speedValue: document.getElementById('wheel-speed'),
  timeDisplay: document.getElementById('time-display'),
  statusMessage: document.getElementById('status-message'),
  statusMode: document.getElementById('status-mode'),
  btnPlay: document.getElementById('btn-play'),
  btnPause: document.getElementById('btn-pause'),
  btnRewind: document.getElementById('btn-rewind'),
  btnFfwd: document.getElementById('btn-ffwd'),
  btnFree: document.getElementById('btn-free'),
  waveCanvas: document.getElementById('wave-canvas'),
  canvasLeft: document.getElementById('canvas-left'),
  canvasRight: document.getElementById('canvas-right'),
  peakLeft: document.getElementById('peak-left'),
  peakRight: document.getElementById('peak-right'),
  loudnessLeft: document.getElementById('loudness-left'),
  loudnessRight: document.getElementById('loudness-right'),
  wheelOuter: document.getElementById('wheel-outer'),
  wheelSvg: document.getElementById('wheel-svg'),
  wheelArt: document.getElementById('wheel-art')
};

const state = {
  mobile: false,
  wheelAngle: 0,
  lastWheelFrame: 0,
  currentFile: null,
  freeSpin: false,
  holdingWheel: false,
  resumeAfterHold: false,
  lastWheelTouchAngle: 0,
  lastWheelTouchTime: 0,
  wheelVelocity: 0,
  scratchTargetVelocity: 0,
  scratchSpeed: 0,
  scratchMoved: false,
  resumingAfterScratch: false,
  lastScratchUpdate: 0,
  transportMode: 'toggle',
  transportEffect: null,
  previousSpeed: 1
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function setStatus(message, mode = 'OFFLINE') {
  refs.statusMessage.textContent = message;
  refs.statusMode.textContent = mode;
}

function themeColor(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

const themePresets = {
  normal: {
    '--bg': '#161616', '--bg2': '#1d1d1d', '--bg3': '#252525', '--panel': '#1d1d1d',
    '--border': '#343434', '--border-light': '#4a4a4a', '--text': '#ababab', '--text-dim': '#666666',
    '--accent': '#ff5500', '--cyan': '#00ffcc', '--cyan-dark': '#00b38f', '--black': '#090909',
    '--gradient-accent': '#ff5500', '--timer-gradient': '#090909'
  },
  'simple-light': {
    '--bg': '#e3e3e3', '--bg2': '#eeeeee', '--bg3': '#d4d4d4', '--panel': '#ededed',
    '--border': '#b9b9b9', '--border-light': '#969696', '--text': '#303030', '--text-dim': '#707070',
    '--accent': '#555555', '--cyan': '#68757a', '--cyan-dark': '#59666b', '--black': '#f5f5f5',
    '--gradient-accent': '#555555', '--timer-gradient': '#f5f5f5'
  },
  'simple-dark': {
    '--bg': '#161616', '--bg2': '#1d1d1d', '--bg3': '#252525', '--panel': '#202020',
    '--border': '#373737', '--border-light': '#505050', '--text': '#b3b3b3', '--text-dim': '#727272',
    '--accent': '#a0a0a0', '--cyan': '#c0c0c0', '--cyan-dark': '#929292', '--black': '#101010',
    '--gradient-accent': '#a0a0a0', '--timer-gradient': '#101010'
  }
};

function syncColorInputs() {
  refs.colorBg.value = themeColor('--bg');
  refs.colorPanel.value = themeColor('--panel');
  refs.colorAccent.value = themeColor('--accent');
  refs.colorCyan.value = themeColor('--cyan');
  refs.colorGradient.value = themeColor('--gradient-accent');
  refs.colorTimerGradient.value = document.documentElement.style.getPropertyValue('--timer-gradient').trim() || themeColor('--timer-gradient');
}

function setTheme(theme) {
  const preset = themePresets[theme];
  if (preset) {
    document.body.dataset.theme = theme;
    for (const [name, value] of Object.entries(preset)) {
      document.documentElement.style.setProperty(name, value);
    }
  } else {
    document.body.dataset.theme = 'custom';
  }

  refs.themeOptions.forEach((option) => {
    option.classList.toggle('active', option.dataset.theme === theme);
  });
  syncColorInputs();
  ensureWheelArt(true);
}

function updateSpeedUI() {
  const speed = Number(engine.getSpeed());
  const percent = clamp(((speed + 2) / 4) * 100, 0, 100);
  refs.speedFill.style.width = `${percent}%`;
  refs.speedValue.textContent = `${speed.toFixed(2)}×`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00.000';
  }

  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secondsPart = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function updateOdometer() {
  const buffer = engine.buffer;
  const moving = state.freeSpin || (engine.isPlaying && Math.abs(engine.getSpeed()) > 0.0001);

  refs.timeDisplay.textContent = formatTime(engine.getCurrentTime());

  setOdometerMotion(moving);

  if (!moving) return;

  if (!buffer) {
    setOdometerDigits(0);
    return;
  }

  const frame = Math.max(0, Math.min(engine.position || 0, buffer.length - 1));
  const seconds = frame / buffer.sampleRate;
  setOdometerDigits(seconds);
}

function setOdometerMotion(moving) {
  const next = moving ? 'true' : 'false';
  if (refs.odometer.dataset.moving === next) return;

  if (!moving) {
    for (const child of refs.odometer.children) {
      if (!child.classList.contains('odo-wrap')) continue;
      const strip = child.firstElementChild;
      const transform = getComputedStyle(strip).transform;
      let offset = 0;
      if (transform && transform !== 'none') {
        const values = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,([^\)]+)\)/);
        offset = values ? Number(values[1]) : 0;
      }
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${offset}px)`;
    }
  } else {
    for (const child of refs.odometer.children) {
      if (child.classList.contains('odo-wrap')) {
        child.firstElementChild.style.transition = 'transform 1s linear';
      }
    }
  }

  refs.odometer.dataset.moving = next;
}

function setOdometerDigits(seconds) {
  if (!refs.odometer.children.length) return;

  const limits = [10, 10, 6, 10, 6, 10];
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600) % 100;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const wholeSeconds = totalSeconds % 60;
  const values = [
    Math.floor(hours / 10), hours % 10,
    Math.floor(minutes / 10), minutes % 10,
    Math.floor(wholeSeconds / 10), wholeSeconds % 10
  ];

  let digitIndex = 0;
  for (const child of refs.odometer.children) {
    if (!child.classList.contains('odo-wrap')) continue;
    const strip = child.firstElementChild;
    strip.style.transform = `translateY(${-(limits[digitIndex] - 1 - values[digitIndex]) * 44}px)`;
    digitIndex += 1;
  }
}

function buildOdometer() {
  const limits = [10, 10, 6, 10, 6, 10];
  const labels = [0, 1, ':', 2, 3, ':', 4, 5];

  for (const label of labels) {
    if (label === ':') {
      const separator = document.createElement('div');
      separator.className = 'odo-sep';
      separator.textContent = ':';
      refs.odometer.appendChild(separator);
      continue;
    }

    const wrap = document.createElement('div');
    wrap.className = 'odo-wrap';
    const strip = document.createElement('div');
    strip.className = 'odo-strip';

    for (let digit = limits[label] - 1; digit >= 0; digit -= 1) {
      const cell = document.createElement('div');
      cell.className = 'odo-cell';
      cell.textContent = digit;
      strip.appendChild(cell);
    }

    wrap.appendChild(strip);
    refs.odometer.appendChild(wrap);
  }

  setOdometerDigits(0);
}

function updateWheelState() {
  if (state.holdingWheel) {
    refs.wheelStatus.textContent = 'MOTOR HELD';
    refs.wheelStatus.style.color = themeColor('--accent');
    return;
  }

  if (state.freeSpin) {
    refs.wheelStatus.textContent = 'FREE SPIN CONTROL';
    refs.wheelStatus.style.color = themeColor('--cyan');
    return;
  }

  const isPlaying = !!engine.isPlaying;
  refs.wheelStatus.textContent = isPlaying ? 'MOTOR RUNNING' : 'MOTOR STOPPED';
  refs.wheelStatus.style.color = isPlaying ? themeColor('--cyan') : themeColor('--text');
}

function setActiveControl(button, active) {
  button.classList.toggle('on', active);
}

function updateTransportButtons() {
  const playing = !!engine.isPlaying;
  setActiveControl(refs.btnPlay, playing);
  setActiveControl(refs.btnPause, !playing && engine.loaded);
  refs.btnFree.classList.toggle('lit', state.freeSpin);
  setActiveControl(refs.btnFfwd, state.transportEffect === 'ffwd');
  setActiveControl(refs.btnRewind, state.transportEffect === 'rewind');
}

function setTransportMode(mode) {
  state.transportMode = mode;
  refs.modeToggle.classList.toggle('active', mode === 'toggle');
  refs.modeHold.classList.toggle('active', mode === 'hold');
}

function setTransportEffect(effect) {
  if (!engine.loaded) return;

  if (state.transportMode === 'toggle' && state.transportEffect === effect) {
    engine.setSpeed(state.previousSpeed);
    state.transportEffect = null;
  } else {
    state.previousSpeed = engine.getSpeed();
    engine.setSpeed(effect === 'ffwd' ? 2 : -1);
    state.transportEffect = effect;
  }

  state.freeSpin = false;
  engine.play();
  setStatus(state.transportEffect ? (effect === 'ffwd' ? 'FAST FORWARD 2.00×' : 'REVERSE 1.00×') : 'PLAYBACK ACTIVE', 'ONLINE');
  updateSpeedUI();
  updateTransportButtons();
}

function ensureWheelArt(force = false) {
  if (!refs.wheelArt || (refs.wheelArt.dataset.ready === 'true' && !force)) {
    return;
  }

  const ns = 'http://www.w3.org/2000/svg';
  refs.wheelArt.replaceChildren();
  const simpleTheme = document.body.dataset.theme === 'simple-light' || document.body.dataset.theme === 'simple-dark';

  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '120');
  ring.setAttribute('cy', '120');
  ring.setAttribute('r', simpleTheme ? '88' : '82');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', themeColor('--wheel-ring'));
  ring.setAttribute('stroke-width', simpleTheme ? '2' : '12');

  const hub = document.createElementNS(ns, 'circle');
  hub.setAttribute('cx', '120');
  hub.setAttribute('cy', '120');
  hub.setAttribute('r', simpleTheme ? '19' : '18');
  hub.setAttribute('fill', themeColor('--wheel-hub'));
  hub.setAttribute('stroke', themeColor('--wheel-hub-border'));
  hub.setAttribute('stroke-width', simpleTheme ? '2' : '3');

  if (simpleTheme) {
    for (const [x1, x2] of [[40, 92], [148, 200]]) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', '120');
      line.setAttribute('x2', x2);
      line.setAttribute('y2', '120');
      line.setAttribute('stroke', themeColor('--wheel-line'));
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'round');
      refs.wheelArt.appendChild(line);
    }
    refs.wheelArt.appendChild(ring);
    refs.wheelArt.appendChild(hub);
    refs.wheelArt.dataset.ready = 'true';
    return;
  }

  const ringInner = document.createElementNS(ns, 'circle');
  ringInner.setAttribute('cx', '120');
  ringInner.setAttribute('cy', '120');
  ringInner.setAttribute('r', '56');
  ringInner.setAttribute('fill', 'none');
  ringInner.setAttribute('stroke', themeColor('--cyan'));
  ringInner.setAttribute('stroke-width', '2');
  ringInner.setAttribute('stroke-dasharray', '4 10');

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const x1 = 120 + Math.cos(angle) * 68;
    const y1 = 120 + Math.sin(angle) * 68;
    const x2 = 120 + Math.cos(angle) * 88;
    const y2 = 120 + Math.sin(angle) * 88;

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
    line.setAttribute('stroke', themeColor('--wheel-line'));
    line.setAttribute('stroke-width', i % 3 === 0 ? '2' : '1');
    refs.wheelArt.appendChild(line);
  }

  refs.wheelArt.appendChild(ring);
  refs.wheelArt.appendChild(ringInner);
  refs.wheelArt.appendChild(hub);
  refs.wheelArt.dataset.ready = 'true';
}

function animateWheel(timestamp) {
  ensureWheelArt();
  const elapsed = state.lastWheelFrame ? Math.min(100, timestamp - state.lastWheelFrame) : 0;
  const seconds = elapsed / 1000;

  if (state.holdingWheel) {
    if (state.freeSpin) {
      state.wheelVelocity = 0;
    } else if (timestamp - state.lastScratchUpdate > 80) {
      state.wheelVelocity = 0;
      state.scratchTargetVelocity = 0;
      if (engine.loaded && Math.abs(engine.getSpeed()) > 0.001) {
        engine.setSpeed(0);
      }
    }
    const response = Math.min(1, seconds / 0.015);
    state.wheelVelocity += (state.scratchTargetVelocity - state.wheelVelocity) * response;
  } else if (!state.freeSpin && engine.isPlaying) {
    if (state.resumingAfterScratch) {
      const currentSpeed = engine.getSpeed();
      const speedResponse = Math.min(1, seconds * 15);
      const nextSpeed = currentSpeed + (state.previousSpeed - currentSpeed) * speedResponse;
      engine.setSpeed(nextSpeed);
      if (Math.abs(state.previousSpeed - nextSpeed) < 0.01) {
        engine.setSpeed(state.previousSpeed);
        state.resumingAfterScratch = false;
      }
    }

    const motorVelocity = 180 * (Number(engine.getSpeed()) || 0);
    const response = Math.min(1, seconds * 15);
    state.wheelVelocity += (motorVelocity - state.wheelVelocity) * response;
    state.wheelAngle += state.wheelVelocity * seconds;
  } else if (Math.abs(state.wheelVelocity) > 0.01) {
    state.wheelAngle += state.wheelVelocity * seconds;
    state.wheelVelocity *= Math.pow(0.008, seconds);
  }

  state.wheelAngle = (state.wheelAngle % 360 + 360) % 360;
  state.lastWheelFrame = timestamp;
  refs.wheelArt.setAttribute('transform', `rotate(${state.wheelAngle} 120 120)`);
  requestAnimationFrame(animateWheel);
}

function drawWaveform() {
  const canvas = refs.waveCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = themeColor('--black');
  ctx.fillRect(0, 0, width, height);

  const audio = engine.leftChannel;

  if (!audio || !audio.length) {
    return;
  }

  const mid = height / 2;
  ctx.strokeStyle = themeColor('--cyan');
  ctx.lineWidth = 1;
  ctx.beginPath();

  const step = Math.ceil(audio.length / width);

  for (let x = 0; x < width; x += 1) {
    const index = x * step;
    const sample = audio[index] || 0;
    const y = mid + sample * (height * 0.35);

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();

  const cursorX = (engine.position / Math.max(1, engine.buffer.length)) * width;
  ctx.strokeStyle = themeColor('--accent');
  ctx.beginPath();
  ctx.moveTo(cursorX, 0);
  ctx.lineTo(cursorX, height);
  ctx.stroke();
}

function drawChannel(canvas, analyser, peakTarget, color, loudnessTarget) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = themeColor('--black');
  ctx.fillRect(0, 0, width, height);

  if (!analyser) {
    return;
  }

  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.beginPath();

  for (let x = 0; x < width; x += 1) {
    const sample = data[Math.floor((x / width) * data.length)] || 128;
    const y = (sample / 255) * height;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();

  let max = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = Math.abs(data[i] - 128);
    if (value > max) max = value;
  }

  const dB = 20 * Math.log10(Math.max(0.0001, max / 128));
  peakTarget.textContent = `${Math.max(-48, dB).toFixed(1)} dB`;
  loudnessTarget.style.width = `${clamp((max / 128) * 100, 0, 100)}%`;
}

function updateAnalyzer() {
  drawChannel(refs.canvasLeft, engine.leftAnalyser, refs.peakLeft, themeColor('--cyan'), refs.loudnessLeft);
  drawChannel(refs.canvasRight, engine.rightAnalyser, refs.peakRight, themeColor('--accent'), refs.loudnessRight);
}

function renderUi() {
  updateSpeedUI();
  updateOdometer();
  updateWheelState();
  updateTransportButtons();
  drawWaveform();
  updateAnalyzer();
}

async function handleFileSelect(file) {
  if (!file || !file.type.startsWith('audio/')) {
    setStatus('INVALID FILE SELECTED', 'ERROR');
    return;
  }

  state.currentFile = file;
  refs.tapeName.textContent = file.name;
  setStatus('LOADING TAPE', 'READY');

  try {
    await engine.load(file);
    refs.tapeName.textContent = file.name;
    setStatus('TAPE LOADED', 'ONLINE');
    refs.statusMode.style.color = '#00ffcc';
  } catch (error) {
    console.error(error);
    refs.tapeName.textContent = 'LOAD FAILED';
    setStatus('LOAD FAILED', 'ERROR');
  }
}

function bindEvents() {
  refs.layoutToggle.addEventListener('click', () => {
    state.mobile = !state.mobile;
    refs.mainContainer.classList.toggle('mobile', state.mobile);
    refs.mainContainer.classList.toggle('pc', !state.mobile);
    refs.layoutToggle.textContent = state.mobile ? '◫ MOBILE UI' : '◫ PC UI';
  });

  refs.settingsToggle.addEventListener('click', () => {
    const open = refs.settingsPanel.hidden;
    refs.settingsPanel.hidden = !open;
    refs.settingsToggle.setAttribute('aria-expanded', String(open));
  });

  refs.themesToggle.addEventListener('click', () => {
    const open = refs.themesPanel.hidden;
    refs.themesPanel.hidden = !open;
    refs.themesToggle.setAttribute('aria-expanded', String(open));
  });

  refs.themeOptions.forEach((option) => {
    option.addEventListener('click', () => setTheme(option.dataset.theme));
  });

  const customColors = [
    [refs.colorBg, '--bg'],
    [refs.colorPanel, '--panel'],
    [refs.colorAccent, '--accent'],
    [refs.colorCyan, '--cyan'],
    [refs.colorGradient, '--gradient-accent'],
    [refs.colorTimerGradient, '--timer-gradient']
  ];
  customColors.forEach(([input, variable]) => {
    input.addEventListener('input', () => {
      document.documentElement.style.setProperty(variable, input.value);
      document.body.dataset.theme = 'custom';
      refs.themeOptions.forEach((option) => option.classList.remove('active'));
      ensureWheelArt(true);
    });
  });

  refs.gradientToggle.addEventListener('change', () => {
    document.body.classList.toggle('no-gradients', !refs.gradientToggle.checked);
  });

  refs.modeToggle.addEventListener('click', () => setTransportMode('toggle'));
  refs.modeHold.addEventListener('click', () => setTransportMode('hold'));

  refs.dropZone.addEventListener('click', () => refs.fileInput.click());
  refs.dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    refs.dropZone.classList.add('drag-over');
  });
  refs.dropZone.addEventListener('dragleave', () => {
    refs.dropZone.classList.remove('drag-over');
  });
  refs.dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    refs.dropZone.classList.remove('drag-over');
    const [file] = event.dataTransfer.files || [];
    if (file) handleFileSelect(file);
  });

  refs.fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) handleFileSelect(file);
    event.target.value = '';
  });

  refs.waveCanvas.addEventListener('pointerdown', async (event) => {
    if (!engine.loaded || !engine.buffer) return;

    const rect = refs.waveCanvas.getBoundingClientRect();
    const progress = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const playbackSpeed = Math.abs(engine.getSpeed()) > 0.0001 ? engine.getSpeed() : 1;
    engine.seekSeconds(progress * engine.getDuration());
    engine.setSpeed(playbackSpeed);
    state.freeSpin = false;
    state.transportEffect = null;
    await engine.play();
    setStatus('PLAYBACK ACTIVE', 'ONLINE');
    updateSpeedUI();
    updateTransportButtons();
  });

  refs.btnPlay.addEventListener('click', async () => {
    if (!state.currentFile) {
      setStatus('LOAD TAPE TO BEGIN', 'OFFLINE');
      return;
    }

    state.freeSpin = false;
    state.transportEffect = null;
    if (Math.abs(engine.getSpeed()) < 0.0001 && Math.abs(state.previousSpeed) > 0.0001) {
      engine.setSpeed(state.previousSpeed);
    }
    await engine.play();
    setStatus('PLAYBACK ACTIVE', 'ONLINE');
    updateTransportButtons();
  });

  refs.btnPause.addEventListener('click', () => {
    if (!engine.loaded) return;
    engine.pause();
    state.freeSpin = false;
    state.transportEffect = null;
    setStatus('PLAYBACK PAUSED', 'READY');
    updateTransportButtons();
  });

  refs.btnFree.addEventListener('click', () => {
    if (!engine.loaded) return;

    state.freeSpin = !state.freeSpin;

    if (state.freeSpin) {
      state.wheelVelocity = 0;
      if (Math.abs(engine.getSpeed()) < 0.01) {
        engine.setSpeed(1);
      }
      setStatus('FREE SPIN ACTIVE', 'ONLINE');
    } else {
      setStatus('PLAYBACK ACTIVE', 'ONLINE');
    }

    updateTransportButtons();
    updateWheelState();
  });

  const beginTransportHold = (effect) => {
    if (state.transportMode === 'hold') {
      setTransportEffect(effect);
    }
  };

  const endTransportHold = () => {
    if (state.transportMode === 'hold' && state.transportEffect) {
      engine.setSpeed(state.previousSpeed);
      state.transportEffect = null;
      updateSpeedUI();
      updateTransportButtons();
    }
  };

  refs.btnFfwd.addEventListener('click', () => {
    if (state.transportMode === 'toggle') setTransportEffect('ffwd');
  });
  refs.btnRewind.addEventListener('click', () => {
    if (state.transportMode === 'toggle') setTransportEffect('rewind');
  });
  refs.btnFfwd.addEventListener('pointerdown', () => beginTransportHold('ffwd'));
  refs.btnRewind.addEventListener('pointerdown', () => beginTransportHold('rewind'));
  refs.btnFfwd.addEventListener('pointerup', endTransportHold);
  refs.btnRewind.addEventListener('pointerup', endTransportHold);
  refs.btnFfwd.addEventListener('pointercancel', endTransportHold);
  refs.btnRewind.addEventListener('pointercancel', endTransportHold);

  const getWheelAngle = (event) => {
    const rect = refs.wheelOuter.getBoundingClientRect();
    return Math.atan2(
      event.clientY - (rect.top + rect.height / 2),
      event.clientX - (rect.left + rect.width / 2)
    );
  };

  const startWheelHold = (event) => {
    if (!engine.loaded) return;

    const wasResumingAfterScratch = state.resumingAfterScratch;
    state.holdingWheel = true;
    state.lastWheelTouchAngle = getWheelAngle(event);
    state.lastWheelTouchTime = performance.now();
    state.lastScratchUpdate = state.lastWheelTouchTime;
    state.wheelVelocity = 0;
    state.scratchTargetVelocity = 0;
    state.scratchSpeed = 0;
    state.scratchMoved = false;
    state.resumingAfterScratch = false;
    state.resumeAfterHold = !!engine.isPlaying && !state.freeSpin;
    if (wasResumingAfterScratch) {
      engine.setSpeed(state.previousSpeed);
    } else {
      state.previousSpeed = engine.getSpeed();
    }

    if (state.resumeAfterHold) {
      engine.setSpeed(0);
    }

    refs.wheelOuter.classList.add('active');
    refs.wheelOuter.setPointerCapture?.(event.pointerId);
    updateWheelState();
  };

  const moveWheelHold = (event) => {
    if (!state.holdingWheel) return;

    const angle = getWheelAngle(event);
    const now = performance.now();
    let delta = angle - state.lastWheelTouchAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    state.lastWheelTouchAngle = angle;

    const elapsed = Math.max(0.001, (now - state.lastWheelTouchTime) / 1000);
    state.lastWheelTouchTime = now;

    if (Math.abs(delta) > 0.002) {
      state.scratchMoved = true;
    }

    if (state.freeSpin) {
      state.wheelVelocity = 0;
      const speedChange = (delta / Math.PI) * 0.25;
      engine.setSpeed(engine.getSpeed() + speedChange);
      state.wheelAngle = (state.wheelAngle + (delta * 180) / Math.PI + 360) % 360;
      refs.wheelArt.setAttribute('transform', `rotate(${state.wheelAngle} 120 120)`);
      updateSpeedUI();
      setStatus(`DIAL SPEED ${engine.getSpeed().toFixed(2)}×`, 'ONLINE');
      return;
    }

    if (engine.buffer) {
      const scratchSeconds = delta / Math.PI;
      const nextTime = clamp(engine.getCurrentTime() + scratchSeconds, 0, engine.getDuration());
      const scratchDegreesPerSecond = (delta * 180) / (Math.PI * elapsed);
      const targetScratchSpeed = clamp(scratchDegreesPerSecond / 180, -2, 2);
      state.scratchSpeed += (targetScratchSpeed - state.scratchSpeed) * 0.25;
      engine.seekSeconds(nextTime);
      state.scratchTargetVelocity = state.scratchSpeed * 180;
      state.lastScratchUpdate = now;
      state.wheelAngle = (state.wheelAngle + (delta * 180) / Math.PI + 360) % 360;
      refs.wheelArt.setAttribute('transform', `rotate(${state.wheelAngle} 120 120)`);
      engine.setSpeed(state.scratchSpeed);
      updateSpeedUI();
      setStatus(`SCRATCH ${scratchSeconds >= 0 ? '+' : ''}${scratchSeconds.toFixed(3)}S`, 'ONLINE');
    }
  };

  const endWheelHold = (event) => {
    if (!state.holdingWheel) return;

    state.holdingWheel = false;
    refs.wheelOuter.classList.remove('active');
    refs.wheelOuter.releasePointerCapture?.(event.pointerId);

    if (state.resumeAfterHold) {
      state.resumingAfterScratch = state.scratchMoved;
      engine.setSpeed(state.scratchMoved ? state.scratchSpeed : state.previousSpeed);
      engine.play();
      setStatus('PLAYBACK ACTIVE', 'ONLINE');
    } else if (state.scratchMoved && !state.freeSpin) {
      engine.setSpeed(state.previousSpeed);
      updateSpeedUI();
      setStatus('PLAYBACK PAUSED', 'READY');
    } else if (state.freeSpin) {
      setStatus('FREE SPIN ACTIVE', 'ONLINE');
    }

    state.resumeAfterHold = false;
    updateWheelState();
  };

  refs.wheelOuter.addEventListener('pointerdown', startWheelHold);
  refs.wheelOuter.addEventListener('pointermove', moveWheelHold);
  refs.wheelOuter.addEventListener('pointerup', endWheelHold);
  refs.wheelOuter.addEventListener('pointercancel', endWheelHold);

  setTransportMode('toggle');
}

function attachEngineEvents() {
  engine.on('ready', () => {
    setStatus('SYSTEM READY', 'STANDBY');
    refs.statusMode.style.color = themeColor('--cyan');
  });

  engine.on('loaded', () => {
    updateSpeedUI();
    setStatus('TAPE LOADED', 'ONLINE');
  });

  engine.on('position', () => {
    updateOdometer();

    if (engine.buffer) {
      const percent = (engine.position / engine.buffer.length) * 100;
      refs.odometer.style.color = percent > 99 ? themeColor('--accent') : themeColor('--cyan');
    }
  });

  engine.on('ended', () => {
    state.freeSpin = false;
    if (state.transportEffect === 'rewind') {
      engine.setSpeed(state.previousSpeed);
      state.transportEffect = null;
      updateSpeedUI();
      setStatus('BEGINNING OF TAPE', 'READY');
    } else if (engine.getSpeed() < -0.0001) {
      engine.setSpeed(0);
      setStatus('BEGINNING OF TAPE', 'READY');
    } else {
      setStatus('END OF TAPE', 'READY');
    }
    updateWheelState();
    updateTransportButtons();
  });
}

function init() {
  attachEngineEvents();
  bindEvents();
  setTheme('normal');
  ensureWheelArt();
  setStatus('STANDBY · LOAD TAPE TO BEGIN', 'OFFLINE');
  refs.tapeName.textContent = 'NO TAPE LOADED';
  refs.odometer.textContent = '00:00.000';
  refs.odometer.textContent = '';
  buildOdometer();
  updateSpeedUI();
  updateTransportButtons();
  animateWheel();

  requestAnimationFrame(function loop() {
    renderUi();
    requestAnimationFrame(loop);
  });
}

init();
