import AudioEngine from './audio-engine.js';

const engine = new AudioEngine();

const refs = {
  app: document.getElementById('app'),
  layoutToggle: document.getElementById('layout-toggle'),
  mainContainer: document.getElementById('main-container'),
  fileInput: document.getElementById('file-input'),
  dropZone: document.getElementById('drop-zone'),
  tapeName: document.getElementById('tape-name'),
  wheelStatus: document.getElementById('wheel-status'),
  odometer: document.getElementById('odometer'),
  speedFill: document.getElementById('speed-fill'),
  speedValue: document.getElementById('speed-value'),
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
  corrFill: document.getElementById('corr-fill'),
  corrValue: document.getElementById('corr-value'),
  wheelSvg: document.getElementById('wheel-svg'),
  wheelArt: document.getElementById('wheel-art')
};

const state = {
  mobile: false,
  wheelAngle: 0,
  currentFile: null
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function setStatus(message, mode = 'OFFLINE') {
  refs.statusMessage.textContent = message;
  refs.statusMode.textContent = mode;
}

function updateSpeedUI() {
  const speed = Number(engine.getSpeed() || 1);
  const percent = clamp(((speed + 5) / 10) * 100, 0, 100);
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

  if (!buffer) {
    refs.odometer.textContent = '00:00.000';
    return;
  }

  const frame = Math.max(0, Math.min(engine.position || 0, buffer.length - 1));
  const seconds = frame / buffer.sampleRate;
  refs.odometer.textContent = formatTime(seconds);
}

function updateWheelState() {
  const isPlaying = !!engine.isPlaying;
  refs.wheelStatus.textContent = isPlaying ? 'MOTOR RUNNING' : 'MOTOR STOPPED';
  refs.wheelStatus.style.color = isPlaying ? '#00ffcc' : '#ababab';
}

function setActiveControl(button, active) {
  button.classList.toggle('on', active);
}

function updateTransportButtons() {
  const playing = !!engine.isPlaying;
  setActiveControl(refs.btnPlay, playing);
  setActiveControl(refs.btnPause, !playing && engine.loaded);
  refs.btnFree.classList.toggle('lit', !!engine.isPlaying);
}

function ensureWheelArt() {
  if (!refs.wheelArt || refs.wheelArt.dataset.ready === 'true') {
    return;
  }

  const ns = 'http://www.w3.org/2000/svg';
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '120');
  ring.setAttribute('cy', '120');
  ring.setAttribute('r', '82');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#2d2d2d');
  ring.setAttribute('stroke-width', '12');

  const ringInner = document.createElementNS(ns, 'circle');
  ringInner.setAttribute('cx', '120');
  ringInner.setAttribute('cy', '120');
  ringInner.setAttribute('r', '56');
  ringInner.setAttribute('fill', 'none');
  ringInner.setAttribute('stroke', '#00ffcc');
  ringInner.setAttribute('stroke-width', '2');
  ringInner.setAttribute('stroke-dasharray', '4 10');

  const hub = document.createElementNS(ns, 'circle');
  hub.setAttribute('cx', '120');
  hub.setAttribute('cy', '120');
  hub.setAttribute('r', '18');
  hub.setAttribute('fill', '#121212');
  hub.setAttribute('stroke', '#ff5500');
  hub.setAttribute('stroke-width', '3');

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
    line.setAttribute('stroke', '#4a4a4a');
    line.setAttribute('stroke-width', i % 3 === 0 ? '2' : '1');
    refs.wheelArt.appendChild(line);
  }

  refs.wheelArt.appendChild(ring);
  refs.wheelArt.appendChild(ringInner);
  refs.wheelArt.appendChild(hub);
  refs.wheelArt.dataset.ready = 'true';
}

function animateWheel() {
  ensureWheelArt();
  const multiplier = engine.isPlaying ? Math.max(0.4, Math.abs(engine.getSpeed() || 1)) * 18 : 0;
  state.wheelAngle = (state.wheelAngle + multiplier) % 360;
  refs.wheelArt.setAttribute('transform', `rotate(${state.wheelAngle} 120 120)`);
  requestAnimationFrame(animateWheel);
}

function drawWaveform() {
  const canvas = refs.waveCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, width, height);

  const audio = engine.leftChannel;

  if (!audio || !audio.length) {
    return;
  }

  const mid = height / 2;
  ctx.strokeStyle = '#00ffcc';
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
  ctx.strokeStyle = '#ff5500';
  ctx.beginPath();
  ctx.moveTo(cursorX, 0);
  ctx.lineTo(cursorX, height);
  ctx.stroke();
}

function drawChannel(canvas, analyser, peakTarget, color) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#090909';
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
}

function updateAnalyzer() {
  drawChannel(refs.canvasLeft, engine.leftAnalyser, refs.peakLeft, '#00ffcc');
  drawChannel(refs.canvasRight, engine.rightAnalyser, refs.peakRight, '#ff5500');

  const corr = 0.5;
  refs.corrFill.style.left = '50%';
  refs.corrFill.style.width = `${Math.max(12, Math.min(88, corr * 100))}%`;
  refs.corrValue.textContent = corr.toFixed(2);
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

  refs.btnPlay.addEventListener('click', async () => {
    if (!state.currentFile) {
      setStatus('LOAD TAPE TO BEGIN', 'OFFLINE');
      return;
    }

    await engine.play();
    setStatus('PLAYBACK ACTIVE', 'ONLINE');
    updateTransportButtons();
  });

  refs.btnPause.addEventListener('click', () => {
    if (!engine.loaded) return;
    engine.pause();
    setStatus('PLAYBACK PAUSED', 'READY');
    updateTransportButtons();
  });

  refs.btnFree.addEventListener('click', () => {
    if (!engine.loaded) return;
    engine.stop();
    setStatus('TAPE STOPPED', 'READY');
    updateTransportButtons();
    updateSpeedUI();
  });

  refs.btnFfwd.addEventListener('click', () => {
    if (!engine.loaded) return;
    const nextSpeed = engine.getSpeed() === 0 ? 1.5 : Math.min(5, Number(engine.getSpeed()) + 0.5);
    engine.setSpeed(nextSpeed);
    updateSpeedUI();
  });

  refs.btnRewind.addEventListener('click', () => {
    if (!engine.loaded) return;
    const nextSpeed = engine.getSpeed() === 0 ? -1.5 : Math.max(-5, Number(engine.getSpeed()) - 0.5);
    engine.setSpeed(nextSpeed);
    updateSpeedUI();
  });
}

function attachEngineEvents() {
  engine.on('ready', () => {
    setStatus('SYSTEM READY', 'STANDBY');
    refs.statusMode.style.color = '#00ffcc';
  });

  engine.on('loaded', () => {
    updateSpeedUI();
    setStatus('TAPE LOADED', 'ONLINE');
  });

  engine.on('position', () => {
    updateOdometer();

    if (engine.buffer) {
      const percent = (engine.position / engine.buffer.length) * 100;
      refs.odometer.style.color = percent > 99 ? '#ff5500' : '#00ffcc';
    }
  });

  engine.on('ended', () => {
    setStatus('END OF TAPE', 'READY');
    updateWheelState();
    updateTransportButtons();
  });
}

function init() {
  attachEngineEvents();
  bindEvents();
  ensureWheelArt();
  setStatus('STANDBY · LOAD TAPE TO BEGIN', 'OFFLINE');
  refs.tapeName.textContent = 'NO TAPE LOADED';
  refs.odometer.textContent = '00:00.000';
  updateSpeedUI();
  updateTransportButtons();
  animateWheel();

  requestAnimationFrame(function loop() {
    renderUi();
    requestAnimationFrame(loop);
  });
}

init();
