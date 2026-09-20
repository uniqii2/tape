/*
============================================================
TP-7 Tape Emulator
audio-engine.js
============================================================
*/

export default class AudioEngine {
    constructor() {
        this.context = null;
        this.worklet = null;
        this.masterGain = null;
        this.splitter = null;
        this.leftAnalyser = null;
        this.rightAnalyser = null;

        this.buffer = null;
        this.leftChannel = null;
        this.rightChannel = null;

        this.loaded = false;
        this.initialized = false;
        this.isPlaying = false;
        this.position = 0;
        this.speed = 1;
        this.sampleRate = 44100;

        this.callbacks = {
            ready: null,
            loaded: null,
            position: null,
            ended: null
        };
    }

    async init() {
        if (this.initialized) {
            return;
        }

        this.context = new AudioContext({ latencyHint: 'interactive' });
        await this.context.audioWorklet.addModule('./player-worklet.js');

        this.worklet = new AudioWorkletNode(this.context, 'tp7-player', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 1;

        this.splitter = this.context.createChannelSplitter(2);
        this.leftAnalyser = this.context.createAnalyser();
        this.rightAnalyser = this.context.createAnalyser();

        this.leftAnalyser.fftSize = 1024;
        this.rightAnalyser.fftSize = 1024;

        this.worklet.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
        this.masterGain.connect(this.splitter);
        this.splitter.connect(this.leftAnalyser, 0);
        this.splitter.connect(this.rightAnalyser, 1);

        this.worklet.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        this.initialized = true;
        this.fire('ready');
    }

    async load(file) {
        if (!this.initialized) {
            await this.init();
        }

        const arrayBuffer = await file.arrayBuffer();
        const decoded = await this.context.decodeAudioData(arrayBuffer);

        this.buffer = decoded;
        this.leftChannel = decoded.getChannelData(0);
        this.rightChannel = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : this.leftChannel;
        this.sampleRate = decoded.sampleRate;
        this.position = 0;

        const leftForWorklet = this.leftChannel.slice();
        const rightForWorklet = this.rightChannel.slice();

        this.worklet.port.postMessage({
            type: 'load',
            left: leftForWorklet,
            right: rightForWorklet,
            sampleRate: this.sampleRate,
            length: this.buffer.length
        }, [leftForWorklet.buffer, rightForWorklet.buffer]);

        this.loaded = true;
        this.fire('loaded', {
            duration: this.buffer.duration,
            length: this.buffer.length,
            sampleRate: this.sampleRate
        });
    }

    handleMessage(message) {
        if (!message || !message.type) {
            return;
        }

        switch (message.type) {
            case 'position':
                this.position = Number(message.position || 0);
                this.fire('position', this.position);
                break;
            case 'ended':
                this.isPlaying = false;
                this.fire('ended');
                break;
            default:
                break;
        }
    }

    on(name, callback) {
        if (Object.prototype.hasOwnProperty.call(this.callbacks, name)) {
            this.callbacks[name] = callback;
        }
    }

    fire(name, data = null) {
        const callback = this.callbacks[name];
        if (callback) {
            callback(data);
        }
    }

    async play() {
        if (!this.loaded) {
            return;
        }

        if (this.context.state === 'suspended') {
            await this.context.resume();
        }

        this.worklet.port.postMessage({ type: 'speed', speed: this.speed });
        this.worklet.port.postMessage({ type: 'play' });
        this.isPlaying = true;
    }

    pause() {
        if (!this.loaded) {
            return;
        }

        this.worklet.port.postMessage({ type: 'pause' });
        this.isPlaying = false;
    }

    stop() {
        if (!this.loaded) {
            return;
        }

        this.worklet.port.postMessage({ type: 'stop' });
        this.position = 0;
        this.isPlaying = false;
    }

    setSpeed(speed) {
        this.speed = Math.max(-2, Math.min(2, Number(speed) || 0));

        if (!this.loaded) {
            return;
        }

        this.worklet.port.postMessage({ type: 'speed', speed: this.speed });
    }

    getSpeed() {
        return this.speed;
    }

    seek(position) {
        if (!this.loaded || !this.buffer) {
            return;
        }

        const frame = Math.max(0, Math.min(position, this.buffer.length - 1));
        this.position = frame;
        this.worklet.port.postMessage({ type: 'seek', frame });
    }

    seekSeconds(seconds) {
        this.seek(Math.floor(seconds * this.sampleRate));
    }

    getPosition() {
        return this.position;
    }

    getCurrentTime() {
        return this.position / this.sampleRate;
    }

    getDuration() {
        return this.buffer ? this.buffer.duration : 0;
    }

    setVolume(value) {
        if (!this.masterGain) {
            return;
        }

        const volume = Math.max(0, Math.min(1, Number(value) || 0));
        this.masterGain.gain.setTargetAtTime(volume, this.context.currentTime, 0.02);
    }

    getVolume() {
        return this.masterGain ? this.masterGain.gain.value : 1;
    }

    getLeftAnalyser() {
        return this.leftAnalyser;
    }

    getRightAnalyser() {
        return this.rightAnalyser;
    }

    createAnalyserBuffer() {
        return new Uint8Array(this.leftAnalyser ? this.leftAnalyser.frequencyBinCount : 0);
    }

    async resume() {
        if (!this.context) {
            return;
        }

        await this.context.resume();
    }

    async suspend() {
        if (!this.context) {
            return;
        }

        await this.context.suspend();
    }

    async destroy() {
        if (!this.context) {
            return;
        }

        this.pause();

        if (this.worklet) {
            this.worklet.disconnect();
        }

        if (this.masterGain) {
            this.masterGain.disconnect();
        }

        if (this.leftAnalyser) {
            this.leftAnalyser.disconnect();
        }

        if (this.rightAnalyser) {
            this.rightAnalyser.disconnect();
        }

        await this.context.close();
        this.initialized = false;
        this.loaded = false;
        this.buffer = null;
    }
}
