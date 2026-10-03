import AudioEngine from './audio-engine.js';

const engine = new AudioEngine();

const refs = {
  app: document.getElementById('app'),
  settingsToggle: document.getElementById('settings-toggle'),
  settingsPanel: document.getElementById('settings-panel'),
  recordSession: document.getElementById('record-session'),
  microphoneSelect: document.getElementById('microphone-select'),
  micRecord: document.getElementById('btn-mic-record'),
  chooseRecordingFolder: document.getElementById('choose-recording-folder'),
  recordingFolderName: document.getElementById('recording-folder-name'),
  recordingStatus: document.getElementById('recording-status'),
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
  btnLoopRecord: document.getElementById('btn-loop-record'),
  btnLoopPrevious: document.getElementById('btn-loop-previous'),
  btnLoopNext: document.getElementById('btn-loop-next'),
  loopStatus: document.getElementById('loop-status'),
  mixerChannels: document.getElementById('mixer-channels'),
  djWaveZoom: document.getElementById('dj-wave-zoom'),
  djWaveZoomValue: document.getElementById('dj-wave-zoom-value'),
  djWaveTracks: document.getElementById('dj-wave-tracks'),
  djWaveEmpty: document.getElementById('dj-wave-empty'),
  looperSlots: document.getElementById('looper-slots'),
  looperStatus: document.getElementById('looper-status'),
  looperTapeName: document.getElementById('looper-tape-name'),
  looperStyle: document.getElementById('looper-style'),
  looperSource: document.getElementById('looper-source'),
  looperWaveform: document.getElementById('looper-waveform'),
  looperKeyboard: document.getElementById('looper-keyboard'),
  looperKeyboardNote: document.getElementById('looper-keyboard-note'),
  looperOctaveDown: document.getElementById('looper-octave-down'),
  looperOctaveUp: document.getElementById('looper-octave-up'),
  looperTrimIn: document.getElementById('looper-trim-in'),
  looperTrimOut: document.getElementById('looper-trim-out'),
  looperTrimInValue: document.getElementById('looper-trim-in-value'),
  looperTrimOutValue: document.getElementById('looper-trim-out-value'),
  looperZoom: document.getElementById('looper-zoom'),
  looperZoomValue: document.getElementById('looper-zoom-value'),
  looperRecord: document.getElementById('looper-record'),
  looperPlay: document.getElementById('looper-play'),
  looperStop: document.getElementById('looper-stop'),
  looperClear: document.getElementById('looper-clear'),
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
  previousSpeed: 1,
  loops: [],
  selectedLoopIndex: -1,
  loopRecordStart: null,
  mixerEq: Array.from({ length: 6 }, () => [0, 0, 0]),
  djWaveZoom: 4,
  djWaveTrackSignature: '',
  djWaveDrag: null,
  recordingDirectory: null,
  recording: false,
  micRecording: false,
  micStream: null,
  micCapture: null,
  selectedLooperTape: 0,
  looperRecording: false,
  looperMicStream: null,
  looperBaseOctave: 3,
  looperLastDraw: 0
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function openSettingsDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tp7-session-settings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRecordingDirectory(handle) {
  const database = await openSettingsDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put(handle, 'recordingDirectory');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function loadRecordingDirectory() {
  if (!('indexedDB' in window)) return;
  try {
    const database = await openSettingsDatabase();
    const handle = await new Promise((resolve, reject) => {
      const request = database.transaction('settings').objectStore('settings').get('recordingDirectory');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (handle) {
      state.recordingDirectory = handle;
      refs.recordingFolderName.textContent = handle.name;
    }
  } catch (error) {
    console.warn('Could not restore the recording directory.', error);
  }
}

async function refreshMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const selected = localStorage.getItem('tp7-microphone-device') || 'default';
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
  refs.microphoneSelect.replaceChildren(new Option('DEFAULT MICROPHONE', 'default'));
  devices.forEach((device, index) => {
    const option = new Option(device.label || `MICROPHONE ${index + 1}`, device.deviceId);
    refs.microphoneSelect.add(option);
  });
  refs.microphoneSelect.value = [...refs.microphoneSelect.options].some((option) => option.value === selected)
    ? selected
    : 'default';
}

async function startMicrophoneRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    refs.recordingStatus.textContent = 'MICROPHONE RECORDING IS NOT SUPPORTED';
    return;
  }

  try {
    await engine.init();
    if (engine.context.state === 'suspended') await engine.context.resume();
    const deviceId = refs.microphoneSelect.value;
    const audio = deviceId === 'default' ? true : { deviceId: { exact: deviceId } };
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio });
    const context = engine.context;
    const source = context.createMediaStreamSource(state.micStream);
    const processor = context.createScriptProcessor(4096, 2, 2);
    const silentGain = context.createGain();
    const chunks = [];
    let channelCount = 1;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      channelCount = Math.min(2, input.numberOfChannels);
      chunks.push(Array.from({ length: channelCount }, (_, channel) => input.getChannelData(channel).slice()));
      for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
        event.outputBuffer.getChannelData(channel).fill(0);
      }
    };
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    state.micCapture = { source, processor, silentGain, chunks, channelCount, sampleRate: context.sampleRate };
    state.micRecording = true;
    refs.micRecord.setAttribute('aria-pressed', 'true');
    refs.micRecord.setAttribute('aria-label', 'Stop microphone recording');
    refs.micRecord.title = 'Stop microphone recording';
    refs.recordingStatus.textContent = 'RECORDING MICROPHONE INPUT';
    await refreshMicrophones();
    updateWheelState();
  } catch (error) {
    console.error(error);
    state.micStream?.getTracks().forEach((track) => track.stop());
    state.micStream = null;
    state.micCapture = null;
    state.micRecording = false;
    refs.micRecord.setAttribute('aria-pressed', 'false');
    refs.recordingStatus.textContent = error.name === 'NotAllowedError'
      ? 'MICROPHONE ACCESS DENIED'
      : 'COULD NOT START MICROPHONE';
  }
}

function stopMicrophoneRecording() {
  const capture = state.micCapture;
  if (!capture) return;
  state.micRecording = false;
  refs.micRecord.setAttribute('aria-pressed', 'false');
  refs.micRecord.setAttribute('aria-label', 'Start microphone recording');
  refs.micRecord.title = 'Record from selected microphone';
  refs.recordingStatus.textContent = 'FINALIZING MICROPHONE TAKE';
  capture.processor.onaudioprocess = null;
  capture.source.disconnect();
  capture.processor.disconnect();
  capture.silentGain.disconnect();
  state.micStream?.getTracks().forEach((track) => track.stop());
  state.micStream = null;
  state.micCapture = null;

  const frameCount = capture.chunks.reduce((total, chunk) => total + chunk[0].length, 0);
  if (frameCount === 0) {
    refs.recordingStatus.textContent = 'NO MICROPHONE AUDIO CAPTURED';
    updateWheelState();
    return;
  }

  const channelCount = capture.channelCount;
  const audioBuffer = engine.context.createBuffer(channelCount, frameCount, capture.sampleRate);
  const outputChannels = Array.from({ length: channelCount }, (_, channel) => audioBuffer.getChannelData(channel));
  let offset = 0;
  capture.chunks.forEach((chunk) => {
    for (let channel = 0; channel < channelCount; channel += 1) {
      outputChannels[channel].set(chunk[channel] || chunk[0], offset);
    }
    offset += chunk[0].length;
  });

  const name = `MIC-TAKE-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  state.currentFile = audioBuffer;
  state.loops = [];
  state.selectedLoopIndex = -1;
  updateLoopControls();
  refs.tapeName.textContent = name;
  engine.loadBuffer(audioBuffer);
  refs.recordingStatus.textContent = 'MIC TAKE LOADED TO TAPE WAVEFORM';
  updateWheelState();
}

function toggleMicrophoneRecording() {
  if (state.micRecording) stopMicrophoneRecording();
  else startMicrophoneRecording();
}

async function chooseRecordingDirectory() {
  if (!window.showDirectoryPicker) {
    refs.recordingStatus.textContent = 'FOLDER ACCESS IS NOT SUPPORTED; RECORDINGS USE DOWNLOADS';
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.recordingDirectory = handle;
    refs.recordingFolderName.textContent = handle.name;
    await storeRecordingDirectory(handle);
    refs.recordingStatus.textContent = 'RECORDINGS WILL SAVE TO THIS FOLDER';
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(error);
      refs.recordingStatus.textContent = 'COULD NOT SET RECORDING DIRECTORY';
    }
  }
}

async function saveSessionBlob(blob) {
  const extension = blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `tp7-session-${timestamp}.${extension}`;

  if (state.recordingDirectory) {
    try {
      let permission = await state.recordingDirectory.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        permission = await state.recordingDirectory.requestPermission({ mode: 'readwrite' });
      }
      if (permission === 'granted') {
        const fileHandle = await state.recordingDirectory.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        refs.recordingStatus.textContent = `SAVED ${filename}`;
        return;
      }
    } catch (error) {
      console.warn('Could not write to the selected folder; downloading instead.', error);
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  refs.recordingStatus.textContent = state.recordingDirectory
    ? 'FOLDER ACCESS DENIED; RECORDING DOWNLOADED'
    : 'RECORDING DOWNLOADED';
}

async function toggleSessionRecording() {
  if (!state.recording) {
    try {
      await engine.startSessionRecording();
      state.recording = true;
      refs.recordSession.setAttribute('aria-pressed', 'true');
      refs.recordSession.setAttribute('aria-label', 'Stop and save session recording');
      refs.recordSession.title = 'Stop and save session recording';
      refs.recordingStatus.textContent = 'RECORDING SESSION';
    } catch (error) {
      console.error(error);
      refs.recordingStatus.textContent = error.message || 'COULD NOT START RECORDING';
    }
    return;
  }

  state.recording = false;
  refs.recordSession.setAttribute('aria-pressed', 'false');
  refs.recordSession.setAttribute('aria-label', 'Start session recording');
  refs.recordSession.title = 'Start session recording';
  refs.recordingStatus.textContent = 'FINALIZING RECORDING';
  try {
    const blob = await engine.stopSessionRecording();
    if (blob?.size) await saveSessionBlob(blob);
    else refs.recordingStatus.textContent = 'NO AUDIO WAS RECORDED';
  } catch (error) {
    console.error(error);
    refs.recordingStatus.textContent = 'COULD NOT SAVE RECORDING';
  }
}

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
  if (state.micRecording) {
    refs.wheelStatus.textContent = 'MIC RECORDING';
    refs.wheelStatus.style.color = '#e52d35';
    return;
  }

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

  const platter = document.createElementNS(ns, 'circle');
  platter.setAttribute('cx', '120');
  platter.setAttribute('cy', '120');
  platter.setAttribute('r', '108');
  platter.setAttribute('fill', themeColor('--wheel-hub'));
  platter.setAttribute('stroke', themeColor('--wheel-ring'));
  platter.setAttribute('stroke-width', '3');

  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '120');
  ring.setAttribute('cy', '120');
  ring.setAttribute('r', '104');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', themeColor('--wheel-ring'));
  ring.setAttribute('stroke-width', simpleTheme ? '2' : '5');

  const hub = document.createElementNS(ns, 'circle');
  hub.setAttribute('cx', '120');
  hub.setAttribute('cy', '120');
  hub.setAttribute('r', simpleTheme ? '19' : '18');
  hub.setAttribute('fill', themeColor('--wheel-hub'));
  hub.setAttribute('stroke', themeColor('--wheel-hub-border'));
  hub.setAttribute('stroke-width', simpleTheme ? '2' : '3');

  if (simpleTheme) {
    refs.wheelArt.appendChild(platter);
    refs.wheelArt.appendChild(ring);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '14');
    line.setAttribute('y1', '120');
    line.setAttribute('x2', '226');
    line.setAttribute('y2', '120');
    line.setAttribute('stroke', themeColor('--wheel-line'));
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linecap', 'round');
    refs.wheelArt.appendChild(line);
    refs.wheelArt.appendChild(hub);
    refs.wheelArt.dataset.ready = 'true';
    return;
  }

  const ringInner = document.createElementNS(ns, 'circle');
  ringInner.setAttribute('cx', '120');
  ringInner.setAttribute('cy', '120');
  ringInner.setAttribute('r', '76');
  ringInner.setAttribute('fill', 'none');
  ringInner.setAttribute('stroke', themeColor('--cyan'));
  ringInner.setAttribute('stroke-width', '2');
  ringInner.setAttribute('stroke-dasharray', '4 10');

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const x1 = 120 + Math.cos(angle) * 84;
    const y1 = 120 + Math.sin(angle) * 84;
    const x2 = 120 + Math.cos(angle) * 102;
    const y2 = 120 + Math.sin(angle) * 102;

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
    line.setAttribute('stroke', themeColor('--wheel-line'));
    line.setAttribute('stroke-width', i % 3 === 0 ? '2' : '1');
    refs.wheelArt.appendChild(line);
  }

  refs.wheelArt.appendChild(platter);
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
  } else if (state.micRecording) {
    const response = Math.min(1, seconds * 12);
    state.wheelVelocity += (210 - state.wheelVelocity) * response;
    state.wheelAngle += state.wheelVelocity * seconds;
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
  renderDjWaveforms();
  renderLooper();
}

function renderLooper(force = false, timestamp = performance.now()) {
  const tape = engine.looperTapes[state.selectedLooperTape];
  if (!tape || (!force && timestamp - state.looperLastDraw < 90)) return;
  state.looperLastDraw = timestamp;

  refs.looperSlots.querySelectorAll('.looper-slot').forEach((button, index) => {
    const slot = engine.looperTapes[index];
    button.classList.toggle('selected', index === state.selectedLooperTape);
    button.classList.toggle('has-tape', !!slot.buffer);
    button.title = `${slot.name}${slot.buffer ? `, ${slot.buffer.duration.toFixed(1)} seconds` : ', empty'}`;
    button.setAttribute('aria-label', `Select ${slot.name}${slot.buffer ? ', recorded' : ', empty'}`);
  });

  if (document.activeElement !== refs.looperTapeName) refs.looperTapeName.value = tape.name;
  refs.looperStyle.value = tape.style;
  refs.looperKeyboardNote.textContent = `F${state.looperBaseOctave}—E${state.looperBaseOctave + 2}`;
  refs.looperOctaveDown.disabled = state.looperBaseOctave <= 0;
  refs.looperOctaveUp.disabled = state.looperBaseOctave >= 7;
  refs.looperKeyboard.querySelectorAll('.looper-key').forEach((key) => {
    key.disabled = !tape.buffer;
  });
  refs.looperTrimIn.value = String(Math.round(tape.trimStart * 100));
  refs.looperTrimOut.value = String(Math.round(tape.trimEnd * 100));
  refs.looperTrimInValue.textContent = `${Math.round(tape.trimStart * 100)}%`;
  refs.looperTrimOutValue.textContent = `${Math.round(tape.trimEnd * 100)}%`;
  refs.looperPlay.disabled = !tape.buffer;
  refs.looperPlay.classList.toggle('playing', tape.isPlaying);
  refs.looperPlay.textContent = tape.isPlaying ? 'PLAYING' : 'PLAY';
  refs.looperStop.disabled = !state.looperRecording && !tape.isPlaying;
  refs.looperClear.disabled = !tape.buffer;
  refs.looperTrimIn.disabled = !tape.buffer;
  refs.looperTrimOut.disabled = !tape.buffer;
  refs.looperRecord.setAttribute('aria-pressed', String(state.looperRecording));

  if (state.looperRecording) {
    const recording = engine.looperRecording;
    const duration = recording ? (recording.frameCount() / recording.sampleRate).toFixed(1) : '0.0';
    refs.looperStatus.textContent = `REC ${duration}s · ${refs.looperSource.value === 'microphone' ? 'MIC INPUT' : 'MASTER MIX'}`;
  } else if (tape.buffer) {
    refs.looperStatus.textContent = `${tape.name} · ${(tape.buffer.duration).toFixed(1)} SEC${tape.isPlaying ? ' · PLAYING' : ''}`;
  } else {
    refs.looperStatus.textContent = `TAPE ${String(state.selectedLooperTape + 1).padStart(2, '0')} EMPTY`;
  }

  drawLooperWaveform(tape, state.looperRecording && engine.looperRecording?.index === state.selectedLooperTape
    ? engine.looperRecording
    : null);
}

function drawLooperWaveform(tape, recording = null) {
  const canvas = refs.looperWaveform;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const middle = Math.floor(height / 2);
  context.clearRect(0, 0, width, height);
  context.fillStyle = themeColor('--black');
  context.fillRect(0, 0, width, height);
  context.strokeStyle = themeColor('--border');
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, middle);
  context.lineTo(width, middle);
  context.stroke();

  if (!tape.buffer && recording) {
    const left = recording.previewLeft;
    const right = recording.previewRight;
    const progress = Math.min(1, recording.frameCount() / (recording.sampleRate * 10));
    context.strokeStyle = themeColor('--cyan');
    context.beginPath();
    for (let x = 0; x < Math.max(1, Math.floor(progress * width)); x += 1) {
      const index = Math.min(left.length - 1, Math.floor((x / width) * left.length));
      const amplitude = left[index] * (middle - 5);
      context.moveTo(x, middle / 2 - amplitude);
      context.lineTo(x, middle / 2 + amplitude);
    }
    context.stroke();
    context.strokeStyle = themeColor('--accent');
    context.beginPath();
    for (let x = 0; x < Math.max(1, Math.floor(progress * width)); x += 1) {
      const index = Math.min(right.length - 1, Math.floor((x / width) * right.length));
      const amplitude = right[index] * (middle - 5);
      context.moveTo(x, middle + middle / 2 - amplitude);
      context.lineTo(x, middle + middle / 2 + amplitude);
    }
    context.stroke();
    context.fillStyle = themeColor('--text-dim');
    context.font = '9px "Share Tech Mono", monospace';
    context.textAlign = 'right';
    context.fillText(`${(recording.frameCount() / recording.sampleRate).toFixed(1)} SEC`, width - 8, 12);
    return;
  }

  if (!tape.buffer) {
    context.fillStyle = themeColor('--text-dim');
    context.font = '11px "Share Tech Mono", monospace';
    context.textAlign = 'center';
    context.fillText('CHOOSE MASTER OR MIC INPUT, THEN RECORD', width / 2, height / 2 + 4);
    return;
  }

  const left = tape.buffer.getChannelData(0);
  const right = tape.buffer.numberOfChannels > 1 ? tape.buffer.getChannelData(1) : left;
  const zoom = Number(refs.looperZoom.value) || 1;
  const selectionCenter = (tape.trimStart + tape.trimEnd) / 2;
  const visibleFraction = 1 / zoom;
  const viewStart = Math.max(0, Math.min(1 - visibleFraction, selectionCenter - visibleFraction / 2));
  const samplePerPixel = Math.max(1, Math.floor(left.length * visibleFraction / width));
  const startSample = Math.floor(viewStart * left.length);
  const viewEnd = viewStart + visibleFraction;
  const viewX = (fraction) => ((fraction - viewStart) / visibleFraction) * width;

  const trimStartX = viewX(tape.trimStart);
  const trimEndX = viewX(tape.trimEnd);
  context.fillStyle = 'rgba(0, 0, 0, 0.52)';
  if (trimStartX > 0) context.fillRect(0, 0, Math.min(width, trimStartX), height);
  if (trimEndX < width) context.fillRect(Math.max(0, trimEndX), 0, width - Math.max(0, trimEndX), height);

  context.lineWidth = 1;
  context.strokeStyle = themeColor('--cyan');
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = startSample + x * samplePerPixel;
    let peak = 0;
    const end = Math.min(left.length, sampleIndex + samplePerPixel);
    for (let index = sampleIndex; index < end; index += Math.max(1, Math.floor(samplePerPixel / 12))) {
      peak = Math.max(peak, Math.abs(left[index] || 0));
    }
    const amplitude = peak * (middle - 5);
    context.moveTo(x, middle / 2 - amplitude);
    context.lineTo(x, middle / 2 + amplitude);
  }
  context.stroke();

  context.strokeStyle = themeColor('--accent');
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = startSample + x * samplePerPixel;
    let peak = 0;
    const end = Math.min(right.length, sampleIndex + samplePerPixel);
    for (let index = sampleIndex; index < end; index += Math.max(1, Math.floor(samplePerPixel / 12))) {
      peak = Math.max(peak, Math.abs(right[index] || 0));
    }
    const amplitude = peak * (middle - 5);
    context.moveTo(x, middle + middle / 2 - amplitude);
    context.lineTo(x, middle + middle / 2 + amplitude);
  }
  context.stroke();

  context.lineWidth = 2;
  context.strokeStyle = themeColor('--text');
  [tape.trimStart, tape.trimEnd].forEach((fraction) => {
    if (fraction < viewStart || fraction > viewEnd) return;
    const x = Math.round(viewX(fraction)) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  });
}

function renderLooperKeyboard() {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const whiteIndices = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23];
  const noteFor = (keyIndex) => {
    const pitch = keyIndex + 5;
    return `${noteNames[pitch % 12]}${state.looperBaseOctave + Math.floor(pitch / 12)}`;
  };
  const whiteKeys = whiteIndices.map((keyIndex) => {
    const note = noteFor(keyIndex);
    return `<button type="button" class="looper-key white-key" data-key="${keyIndex}" aria-label="Play sample at ${note}" title="${note}" disabled>${note}</button>`;
  }).join('');
  const blackSpans = new Map([
    [1, [0, 1.5]],
    [3, [1.5, 1]],
    [5, [2.5, 1.5]],
    [8, [4, 1.5]],
    [10, [5.5, 1.5]]
  ]);
  const blackKeys = Array.from({ length: 24 }, (_, keyIndex) => keyIndex)
    .filter((keyIndex) => !whiteIndices.includes(keyIndex))
    .map((keyIndex) => {
      const note = noteFor(keyIndex);
      const octave = Math.floor(keyIndex / 12);
      const [localStart, span] = blackSpans.get(keyIndex % 12);
      const left = ((octave * 7 + localStart) / 14) * 100;
      const width = (span / 14) * 100;
      return `<button type="button" class="looper-key black-key" data-key="${keyIndex}" style="left:${left}%;width:${width}%" aria-label="Play sample at ${note}" title="${note}" disabled>${note}</button>`;
    }).join('');
  refs.looperKeyboard.innerHTML = `<div class="looper-black-keys">${blackKeys}</div><div class="looper-white-keys">${whiteKeys}</div>`;
}

function renderDjWaveforms() {
  const activeTracks = engine.mixerTracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.buffer);
  const signature = activeTracks.map(({ index, track }) => `${index}:${track.name}`).join('|');

  if (signature !== state.djWaveTrackSignature) {
    state.djWaveTrackSignature = signature;
    refs.djWaveTracks.innerHTML = activeTracks.map(({ index, track }) => `
      <div class="dj-wave-track" data-wave-channel="${index}">
        <div class="dj-wave-track-label">
          <span>CH ${String(index + 1).padStart(2, '0')} · ${escapeHtml(track.name)}</span>
          <span>${track.targetBpm} BPM</span>
        </div>
        <canvas class="dj-wave-canvas" aria-label="Live waveform for channel ${index + 1}"></canvas>
      </div>
    `).join('');
    refs.djWaveEmpty.hidden = activeTracks.length > 0;
  }

  const zoom = state.djWaveZoom;
  const visibleSeconds = 16 / zoom;
  const centerFraction = 0.5;

  activeTracks.forEach(({ index, track }) => {
    const canvas = refs.djWaveTracks.querySelector(`[data-wave-channel="${index}"] canvas`);
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * pixelRatio));
    const height = Math.max(1, Math.floor(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext('2d');
    const middle = height / 2;
    const buffer = track.buffer;
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const position = engine.getMixerTrackPosition(index);
    canvas.dataset.positionSeconds = position.toFixed(3);
    canvas.closest('.dj-wave-track').querySelector('.dj-wave-track-label span:last-child').textContent = `${track.targetBpm} BPM`;
    const secondsPerPixel = visibleSeconds / width;
    const frameStep = Math.max(1, Math.floor(buffer.sampleRate * secondsPerPixel));

    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(document.body).getPropertyValue('--black').trim();
    context.fillRect(0, 0, width, height);
    context.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border').trim();
    context.lineWidth = pixelRatio;
    context.beginPath();
    context.moveTo(0, middle);
    context.lineTo(width, middle);
    context.stroke();

    context.strokeStyle = getComputedStyle(document.body).getPropertyValue('--cyan').trim();
    context.globalAlpha = 0.9;
    context.lineWidth = Math.max(1, pixelRatio);
    context.beginPath();
    for (let x = 0; x < width; x += 1) {
      const time = position + ((x / width) - centerFraction) * visibleSeconds * track.playbackRate;
      const frame = Math.floor(time * buffer.sampleRate);
      if (frame < 0 || frame >= buffer.length) continue;

      let peak = 0;
      const frameEnd = Math.min(buffer.length, frame + frameStep);
      const scanStep = Math.max(1, Math.floor((frameEnd - frame) / 12));
      for (let sampleFrame = frame; sampleFrame < frameEnd; sampleFrame += scanStep) {
        peak = Math.max(peak, Math.abs((left[sampleFrame] + right[sampleFrame]) * 0.5));
      }
      const amplitude = Math.max(1, peak * middle * 0.92);
      context.moveTo(x, middle - amplitude);
      context.lineTo(x, middle + amplitude);
    }
    context.stroke();
    context.globalAlpha = 1;

    const centerX = Math.floor(width * centerFraction) + 0.5;
    context.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    context.lineWidth = Math.max(1, pixelRatio * 1.5);
    context.beginPath();
    context.moveTo(centerX, 0);
    context.lineTo(centerX, height);
    context.stroke();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function updateLoopControls() {
  const count = state.loops.length;
  refs.btnLoopRecord.disabled = !engine.loaded;
  refs.btnLoopPrevious.disabled = count === 0;
  refs.btnLoopNext.disabled = count === 0;
  refs.loopStatus.textContent = count === 0
    ? '0 LOOPS'
    : `LOOP ${state.selectedLoopIndex < 0 ? '-' : state.selectedLoopIndex + 1}/${count}`;
}

function renderMixerChannels() {
  refs.mixerChannels.innerHTML = Array.from({ length: 6 }, (_, index) => `
    <article class="mixer-channel" data-channel="${index}" aria-label="Mixer channel ${index + 1}">
      <div class="mixer-channel-header">
        <span class="mixer-channel-number">CH ${String(index + 1).padStart(2, '0')}</span>
        <span class="mixer-track-state">EMPTY</span>
      </div>
      <span class="mixer-track-name" title="No track loaded">NO TRACK</span>
      <input class="mixer-file-input" type="file" accept="audio/*" aria-label="Choose audio for channel ${index + 1}">
      <button class="mixer-load-button" type="button" data-action="load">LOAD SONG</button>
      <div class="mixer-track-controls">
        <label class="mixer-range-control">
          <span>LEVEL</span>
          <input class="mixer-level-slider" type="range" min="0" max="100" value="80" disabled aria-label="Channel ${index + 1} volume">
          <output class="mixer-level-value">80%</output>
        </label>
        <div class="mixer-tempo-info"><span>DETECTED</span><output class="mixer-detected-bpm">NOT FOUND</output></div>
        <label class="mixer-range-control">
          <span>TEMPO</span>
          <input class="mixer-tempo-slider" type="range" min="50" max="200" value="120" disabled aria-label="Channel ${index + 1} target tempo in BPM">
          <output class="mixer-tempo-value">120 BPM</output>
        </label>
      </div>
      <div class="mixer-eq" aria-label="Three band equalizer">
        ${['BASS', 'MID', 'TOP'].map((band, bandIndex) => `
          <div class="mixer-eq-band">
            <label>${band}</label>
            <div class="eq-dial" role="slider" tabindex="0" aria-label="Channel ${index + 1} ${band.toLowerCase()} EQ" aria-valuemin="-12" aria-valuemax="12" aria-valuenow="0" data-channel="${index}" data-band="${bandIndex}" data-value="0" style="--dial-rotation: 0deg"></div>
            <output class="eq-dial-value">0 dB</output>
          </div>
        `).join('')}
      </div>
      <div class="mixer-actions">
        <button class="mixer-transport-button" type="button" data-action="play" disabled aria-label="Play channel ${index + 1}">PLAY</button>
        <button class="mixer-mute-button" type="button" data-action="mute" disabled aria-label="Mute channel ${index + 1}" aria-pressed="false">MUTE</button>
      </div>
    </article>
  `).join('');
}

function updateMixerChannel(index) {
  const channel = refs.mixerChannels.querySelector(`[data-channel="${index}"]`);
  const track = engine.mixerTracks[index];
  if (!channel || !track) return;

  const name = channel.querySelector('.mixer-track-name');
  const stateLabel = channel.querySelector('.mixer-track-state');
  const playButton = channel.querySelector('[data-action="play"]');
  const muteButton = channel.querySelector('[data-action="mute"]');
  const levelSlider = channel.querySelector('.mixer-level-slider');
  const tempoSlider = channel.querySelector('.mixer-tempo-slider');
  name.textContent = track.name || 'NO TRACK';
  name.title = track.name || 'No track loaded';
  stateLabel.textContent = track.isScrubbing ? 'SCRUB' : track.isPlaying ? 'PLAYING' : track.buffer ? 'LOADED' : 'EMPTY';
  playButton.disabled = !track.buffer || track.isScrubbing;
  playButton.textContent = track.isScrubbing ? 'SCRUB' : track.isPlaying ? 'PAUSE' : 'PLAY';
  playButton.classList.toggle('playing', track.isPlaying);
  muteButton.disabled = !track.buffer;
  muteButton.classList.toggle('muted', track.muted);
  muteButton.setAttribute('aria-pressed', String(track.muted));
  muteButton.textContent = track.muted ? 'MUTED' : 'MUTE';
  levelSlider.disabled = !track.buffer;
  levelSlider.value = String(Math.round(track.volume * 100));
  channel.querySelector('.mixer-level-value').textContent = `${Math.round(track.volume * 100)}%`;
  tempoSlider.disabled = !track.buffer;
  tempoSlider.value = String(Math.round(track.targetBpm));
  channel.querySelector('.mixer-tempo-value').textContent = `${Math.round(track.targetBpm)} BPM`;
  channel.querySelector('.mixer-detected-bpm').textContent = track.detectedBpm
    ? `EST ${track.detectedBpm} BPM`
    : 'NOT FOUND';
}

function setMixerEqDial(dial, value) {
  const clampedValue = Math.round(clamp(value, -12, 12) * 2) / 2;
  const channelIndex = Number(dial.dataset.channel);
  const bandIndex = Number(dial.dataset.band);
  const angle = -135 + ((clampedValue + 12) / 24) * 270;
  dial.dataset.value = String(clampedValue);
  dial.style.setProperty('--dial-rotation', `${angle}deg`);
  dial.setAttribute('aria-valuenow', String(clampedValue));
  dial.nextElementSibling.textContent = `${clampedValue > 0 ? '+' : ''}${clampedValue} dB`;
  state.mixerEq[channelIndex][bandIndex] = clampedValue;
  engine.setMixerEq(channelIndex, bandIndex, clampedValue);
}

async function playSelectedLoop(index) {
  if (state.loops.length === 0 || !engine.loaded) return;

  state.selectedLoopIndex = (index + state.loops.length) % state.loops.length;
  const loop = state.loops[state.selectedLoopIndex];
  state.freeSpin = false;
  state.transportEffect = null;
  await engine.playRange(loop.start, loop.end);
  refs.loopStatus.textContent = `LOOP ${state.selectedLoopIndex + 1}/${state.loops.length}`;
  setStatus(`LOOP ${state.selectedLoopIndex + 1} PLAYING`, 'ONLINE');
  updateSpeedUI();
  updateTransportButtons();
  updateWheelState();
}

async function handleFileSelect(file) {
  if (!file || !file.type.startsWith('audio/')) {
    setStatus('INVALID FILE SELECTED', 'ERROR');
    return;
  }

  state.currentFile = file;
  state.loops = [];
  state.selectedLoopIndex = -1;
  state.loopRecordStart = null;
  updateLoopControls();
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
  refs.recordSession.addEventListener('click', toggleSessionRecording);
  refs.micRecord.addEventListener('click', toggleMicrophoneRecording);
  refs.chooseRecordingFolder.addEventListener('click', chooseRecordingDirectory);
  refs.microphoneSelect.addEventListener('change', () => localStorage.setItem('tp7-microphone-device', refs.microphoneSelect.value));

  refs.looperSlots.addEventListener('click', (event) => {
    const button = event.target.closest('.looper-slot');
    if (!button || state.looperRecording) return;
    state.selectedLooperTape = Number(button.dataset.slot);
    renderLooper(true);
  });

  refs.looperTapeName.addEventListener('input', () => {
    const tape = engine.looperTapes[state.selectedLooperTape];
    tape.name = refs.looperTapeName.value.trim() || `TAPE ${String(state.selectedLooperTape + 1).padStart(2, '0')}`;
    renderLooper(true);
  });

  refs.looperStyle.addEventListener('change', () => {
    engine.setLooperStyle(state.selectedLooperTape, refs.looperStyle.value);
    renderLooper(true);
  });

  refs.looperKeyboard.addEventListener('click', async (event) => {
    const key = event.target.closest('.looper-key');
    if (!key || key.disabled) return;
    if (engine.context.state === 'suspended') await engine.context.resume();
    engine.triggerLooperKey(state.selectedLooperTape, Number(key.dataset.key), state.looperBaseOctave - 3);
    key.classList.add('active');
    window.setTimeout(() => key.classList.remove('active'), 120);
  });

  refs.looperTrimIn.addEventListener('input', () => {
    const end = Number(refs.looperTrimOut.value);
    const start = Math.min(Number(refs.looperTrimIn.value), end - 1);
    refs.looperTrimIn.value = String(start);
    engine.setLooperTrim(state.selectedLooperTape, start / 100, end / 100);
    renderLooper(true);
  });

  refs.looperTrimOut.addEventListener('input', () => {
    const start = Number(refs.looperTrimIn.value);
    const end = Math.max(Number(refs.looperTrimOut.value), start + 1);
    refs.looperTrimOut.value = String(end);
    engine.setLooperTrim(state.selectedLooperTape, start / 100, end / 100);
    renderLooper(true);
  });

  refs.looperZoom.addEventListener('input', () => {
    refs.looperZoomValue.textContent = `${refs.looperZoom.value}×`;
    renderLooper(true);
  });

  refs.looperOctaveDown.addEventListener('click', () => {
    if (state.looperBaseOctave <= 0) return;
    state.looperBaseOctave -= 1;
    renderLooperKeyboard();
    renderLooper(true);
  });

  refs.looperOctaveUp.addEventListener('click', () => {
    if (state.looperBaseOctave >= 7) return;
    state.looperBaseOctave += 1;
    renderLooperKeyboard();
    renderLooper(true);
  });

  refs.looperRecord.addEventListener('click', async () => {
    if (state.looperRecording) {
      const index = engine.stopLooperRecording();
      state.looperMicStream?.getTracks().forEach((track) => track.stop());
      state.looperMicStream = null;
      state.looperRecording = false;
      if (index !== null) {
        const tape = engine.looperTapes[index];
        if (tape.name.startsWith('TAPE ')) tape.name = `TAKE ${String(index + 1).padStart(2, '0')}`;
        refs.looperTapeName.value = tape.name;
      }
      renderLooper(true);
      return;
    }

    try {
      if (refs.looperSource.value === 'microphone') {
        const deviceId = refs.microphoneSelect.value;
        const audio = deviceId === 'default' ? true : { deviceId: { exact: deviceId } };
        state.looperMicStream = await navigator.mediaDevices.getUserMedia({ audio });
      }
      const started = await engine.startLooperRecording(state.selectedLooperTape, state.looperMicStream);
      if (started) state.looperRecording = true;
      else {
        state.looperMicStream?.getTracks().forEach((track) => track.stop());
        state.looperMicStream = null;
      }
    } catch (error) {
      console.error(error);
      state.looperMicStream?.getTracks().forEach((track) => track.stop());
      state.looperMicStream = null;
      refs.looperStatus.textContent = error.name === 'NotAllowedError' ? 'MICROPHONE ACCESS DENIED' : 'COULD NOT START RECORDING';
    }
    renderLooper(true);
  });

  refs.looperPlay.addEventListener('click', async () => {
    const tape = engine.looperTapes[state.selectedLooperTape];
    if (!tape.buffer) return;
    if (tape.isPlaying) engine.stopLooperTape(state.selectedLooperTape);
    else {
      if (engine.context.state === 'suspended') await engine.context.resume();
      engine.playLooperTape(state.selectedLooperTape);
    }
    renderLooper(true);
  });

  refs.looperStop.addEventListener('click', () => {
    if (state.looperRecording) {
      const index = engine.stopLooperRecording();
      state.looperMicStream?.getTracks().forEach((track) => track.stop());
      state.looperMicStream = null;
      state.looperRecording = false;
      if (index !== null) {
        const tape = engine.looperTapes[index];
        if (tape.name.startsWith('TAPE ')) tape.name = `TAKE ${String(index + 1).padStart(2, '0')}`;
      }
    }
    engine.stopLooperTape(state.selectedLooperTape);
    renderLooper(true);
  });

  refs.looperClear.addEventListener('click', () => {
    engine.clearLooperTape(state.selectedLooperTape);
    const tape = engine.looperTapes[state.selectedLooperTape];
    tape.name = `TAPE ${String(state.selectedLooperTape + 1).padStart(2, '0')}`;
    refs.looperTapeName.value = tape.name;
    renderLooper(true);
  });

  refs.djWaveTracks.addEventListener('pointerdown', (event) => {
    const canvas = event.target.closest('.dj-wave-canvas');
    if (!canvas) return;

    const index = Number(canvas.closest('.dj-wave-track').dataset.waveChannel);
    const track = engine.mixerTracks[index];
    if (!track?.buffer) return;

    event.preventDefault();
    state.djWaveDrag = {
      canvas,
      index,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastTime: performance.now()
    };
    canvas.classList.add('scrubbing');
    canvas.setPointerCapture(event.pointerId);
    engine.beginMixerScrub(index);
    updateMixerChannel(index);
  });

  refs.djWaveTracks.addEventListener('pointermove', (event) => {
    const drag = state.djWaveDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    const deltaX = event.clientX - drag.lastX;
    const elapsed = Math.max(0.004, (now - drag.lastTime) / 1000);
    const track = engine.mixerTracks[drag.index];
    const visibleSeconds = 16 / state.djWaveZoom;
    const secondsDelta = -(deltaX / drag.canvas.clientWidth) * visibleSeconds * track.playbackRate;
    engine.scrubMixerTrack(drag.index, secondsDelta, secondsDelta / elapsed);
    drag.lastX = event.clientX;
    drag.lastTime = now;
  });

  const finishDjWaveDrag = (event) => {
    const drag = state.djWaveDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.djWaveDrag = null;
    drag.canvas.classList.remove('scrubbing');
    if (drag.canvas.hasPointerCapture(event.pointerId)) drag.canvas.releasePointerCapture(event.pointerId);
    engine.endMixerScrub(drag.index);
  };

  refs.djWaveTracks.addEventListener('pointerup', finishDjWaveDrag);
  refs.djWaveTracks.addEventListener('pointercancel', finishDjWaveDrag);
  refs.djWaveTracks.addEventListener('lostpointercapture', finishDjWaveDrag);

  refs.djWaveZoom.addEventListener('input', () => {
    state.djWaveZoom = Number(refs.djWaveZoom.value);
    refs.djWaveZoomValue.textContent = `${state.djWaveZoom}×`;
  });

  refs.mixerChannels.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const channel = button.closest('.mixer-channel');
    const index = Number(channel.dataset.channel);
    if (button.dataset.action === 'load') {
      channel.querySelector('.mixer-file-input').click();
    } else if (button.dataset.action === 'play') {
      await engine.toggleMixerTrack(index);
      updateMixerChannel(index);
    } else if (button.dataset.action === 'mute') {
      engine.setMixerMute(index, !engine.mixerTracks[index].muted);
      updateMixerChannel(index);
    }
  });

  refs.mixerChannels.addEventListener('change', async (event) => {
    if (!event.target.matches('.mixer-file-input')) return;
    const file = event.target.files[0];
    const index = Number(event.target.closest('.mixer-channel').dataset.channel);
    if (file?.type.startsWith('audio/')) {
      try {
        await engine.loadMixerTrack(index, file);
        state.mixerEq[index].forEach((value, band) => engine.setMixerEq(index, band, value));
        engine.setMixerMute(index, false);
        updateMixerChannel(index);
      } catch (error) {
        console.error(error);
        setStatus(`CHANNEL ${index + 1} LOAD FAILED`, 'ERROR');
      }
    }
    event.target.value = '';
  });

  refs.mixerChannels.addEventListener('input', (event) => {
    const slider = event.target;
    if (!slider.matches('.mixer-level-slider, .mixer-tempo-slider')) return;

    const channel = slider.closest('.mixer-channel');
    const index = Number(channel.dataset.channel);
    if (slider.matches('.mixer-level-slider')) {
      const volume = Number(slider.value);
      engine.setMixerVolume(index, volume / 100);
      channel.querySelector('.mixer-level-value').textContent = `${volume}%`;
    } else {
      const bpm = Number(slider.value);
      engine.setMixerTempo(index, bpm);
      channel.querySelector('.mixer-tempo-value').textContent = `${bpm} BPM`;
    }
  });

  refs.mixerChannels.addEventListener('pointerdown', (event) => {
    const dial = event.target.closest('.eq-dial');
    if (!dial) return;
    event.preventDefault();
    dial.dataset.dragY = String(event.clientY);
    dial.dataset.dragValue = dial.dataset.value;
    dial.setPointerCapture(event.pointerId);
  });

  refs.mixerChannels.addEventListener('pointermove', (event) => {
    const dial = event.target.closest('.eq-dial');
    if (!dial || !dial.hasPointerCapture(event.pointerId)) return;
    const delta = (Number(dial.dataset.dragY) - event.clientY) / 4;
    setMixerEqDial(dial, Number(dial.dataset.dragValue) + delta);
  });

  refs.mixerChannels.addEventListener('pointerup', (event) => {
    const dial = event.target.closest('.eq-dial');
    if (dial?.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
  });

  refs.mixerChannels.addEventListener('keydown', (event) => {
    const dial = event.target.closest('.eq-dial');
    if (!dial) return;
    const value = Number(dial.dataset.value);
    const adjustments = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 2, PageDown: -2 };
    if (event.key === 'Home') setMixerEqDial(dial, -12);
    else if (event.key === 'End') setMixerEqDial(dial, 12);
    else if (adjustments[event.key]) setMixerEqDial(dial, value + adjustments[event.key]);
    else return;
    event.preventDefault();
  });

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

  const finishLoopRecording = (event) => {
    if (state.loopRecordStart === null) return;

    const start = state.loopRecordStart;
    const end = engine.getPosition();
    state.loopRecordStart = null;
    refs.btnLoopRecord.classList.remove('recording');
    refs.btnLoopRecord.releasePointerCapture?.(event.pointerId);

    const loopStart = Math.min(start, end);
    const loopEnd = Math.max(start, end);
    if (loopEnd - loopStart < engine.sampleRate * 0.05) {
      setStatus('LOOP TOO SHORT', 'READY');
      return;
    }

    state.loops.push({ start: loopStart, end: loopEnd });
    updateLoopControls();
    setStatus(`LOOP ${state.loops.length} RECORDED`, 'READY');
  };

  refs.btnLoopRecord.addEventListener('pointerdown', (event) => {
    if (!engine.loaded || !engine.isPlaying || Math.abs(engine.getSpeed()) < 0.0001) return;
    event.preventDefault();
    state.loopRecordStart = engine.getPosition();
    refs.btnLoopRecord.classList.add('recording');
    refs.btnLoopRecord.setPointerCapture?.(event.pointerId);
  });
  refs.btnLoopRecord.addEventListener('pointerup', finishLoopRecording);
  refs.btnLoopRecord.addEventListener('pointercancel', finishLoopRecording);
  refs.btnLoopRecord.addEventListener('lostpointercapture', finishLoopRecording);
  refs.btnLoopNext.addEventListener('click', () => {
    playSelectedLoop(state.selectedLoopIndex + 1);
  });
  refs.btnLoopPrevious.addEventListener('click', () => {
    playSelectedLoop(state.selectedLoopIndex < 0 ? state.loops.length - 1 : state.selectedLoopIndex - 1);
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
    updateLoopControls();
    setStatus('TAPE LOADED', 'ONLINE');
  });

  engine.on('mixerTrackEnded', (index) => updateMixerChannel(index));
  engine.on('mixerTrackScrub', (index) => updateMixerChannel(index));

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
  renderMixerChannels();
  renderLooperKeyboard();
  bindEvents();
  refreshMicrophones().catch((error) => console.warn('Could not list microphones.', error));
  navigator.mediaDevices?.addEventListener('devicechange', () => {
    refreshMicrophones().catch((error) => console.warn('Could not refresh microphones.', error));
  });
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
