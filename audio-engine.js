/*
============================================================
TP-7 Tape Emulator
audio-engine.js
============================================================
*/

export function detectTempo(buffer) {
    if (!buffer || buffer.length < buffer.sampleRate * 6) return null;

    const step = Math.max(1, Math.round(buffer.sampleRate / 11025));
    const hop = step * 128;
    const framesPerSecond = buffer.sampleRate / hop;
    const frameCount = Math.min(Math.floor(buffer.length / hop), Math.floor(framesPerSecond * 45));
    if (frameCount < Math.ceil(framesPerSecond * 6)) return null;

    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const onsets = new Float32Array(frameCount);
    let previousEnergy = 0;
    let peakOnset = 0;

    for (let frame = 0; frame < frameCount; frame += 1) {
        const start = frame * hop;
        let sumSquares = 0;
        let sampleCount = 0;
        for (let offset = 0; offset < hop; offset += step) {
            const sample = (left[start + offset] + right[start + offset]) * 0.5;
            sumSquares += sample * sample;
            sampleCount += 1;
        }
        const energy = Math.sqrt(sumSquares / sampleCount);
        const onset = Math.max(0, energy - previousEnergy);
        onsets[frame] = onset;
        peakOnset = Math.max(peakOnset, onset);
        previousEnergy = energy;
    }

    if (peakOnset < 0.0001) return null;
    for (let frame = 0; frame < frameCount; frame += 1) onsets[frame] /= peakOnset;

    const minimumLag = Math.max(1, Math.ceil(framesPerSecond * 60 / 200));
    const maximumLag = Math.min(Math.ceil(framesPerSecond * 60 / 50), Math.floor(frameCount / 2));
    const lagScores = new Float32Array(maximumLag - minimumLag + 1);
    let bestLag = 0;
    let bestScore = 0;

    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
        let product = 0;
        let firstPower = 0;
        let secondPower = 0;
        for (let frame = lag; frame < frameCount; frame += 1) {
            const first = onsets[frame];
            const second = onsets[frame - lag];
            product += first * second;
            firstPower += first * first;
            secondPower += second * second;
        }
        const score = product / Math.sqrt(firstPower * secondPower || 1);
        lagScores[lag - minimumLag] = score;
        if (score > bestScore) {
            bestScore = score;
            bestLag = lag;
        }
    }

    if (bestScore < 0.08 || bestLag === 0) return null;
    let selectedLag = bestLag;
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
        if (lagScores[lag - minimumLag] >= bestScore * 0.8) {
            selectedLag = lag;
            break;
        }
    }
    let bpm = (framesPerSecond * 60) / selectedLag;
    if (bpm > 180) bpm /= 2;
    return Math.max(50, Math.min(200, Math.round(bpm)));
}

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
        this.sessionRecording = null;
        this.looperRecording = null;
        this.looperTapes = Array.from({ length: 8 }, (_, index) => ({
            buffer: null,
            name: `TAPE ${String(index + 1).padStart(2, '0')}`,
            style: 'normal',
            trimStart: 0,
            trimEnd: 1,
            source: null,
            styleFilter: null,
            isPlaying: false,
            voices: new Set()
        }));
        this.mixerTracks = Array.from({ length: 6 }, () => ({
            buffer: null,
            reverseBuffer: null,
            name: '',
            source: null,
            filters: null,
            gain: null,
            muted: false,
            volume: 0.8,
            isPlaying: false,
            offset: 0,
            startedAt: 0,
            isScrubbing: false,
            resumeAfterScrub: false,
            scrubDirection: 0,
            detectedBpm: null,
            targetBpm: 120,
            playbackRate: 1
        }));
        this.callbacks = {
            ready: null,
            loaded: null,
            position: null,
            ended: null,
            mixerTrackEnded: null,
            mixerTrackScrub: null
        };
    }

    async init() {
        if (this.initialized) return;

        this.context = new AudioContext({ latencyHint: 'interactive' });
        await this.context.audioWorklet.addModule('./player-worklet.js');
        this.worklet = new AudioWorkletNode(this.context, 'tp7-player', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 1;

        this.mixerTracks.forEach((track) => {
            track.filters = [
                this.context.createBiquadFilter(),
                this.context.createBiquadFilter(),
                this.context.createBiquadFilter()
            ];
            track.filters[0].type = 'lowshelf';
            track.filters[0].frequency.value = 200;
            track.filters[1].type = 'peaking';
            track.filters[1].frequency.value = 1000;
            track.filters[1].Q.value = 0.7;
            track.filters[2].type = 'highshelf';
            track.filters[2].frequency.value = 5000;
            track.gain = this.context.createGain();
            track.gain.gain.value = track.volume;
            track.filters[0].connect(track.filters[1]);
            track.filters[1].connect(track.filters[2]);
            track.filters[2].connect(track.gain);
            track.gain.connect(this.masterGain);
        });

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
        this.worklet.port.onmessage = (event) => this.handleMessage(event.data);
        this.initialized = true;
        this.fire('ready');
    }

    async load(file) {
        if (!this.initialized) await this.init();
        const decoded = await this.context.decodeAudioData(await file.arrayBuffer());
        this.loadBuffer(decoded);
    }

    loadBuffer(decoded) {
        if (!decoded || !this.initialized) return;
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
            length: decoded.length
        }, [leftForWorklet.buffer, rightForWorklet.buffer]);
        this.loaded = true;
        this.fire('loaded', { duration: decoded.duration, length: decoded.length, sampleRate: decoded.sampleRate });
    }

    async loadMixerTrack(index, file) {
        if (!file || index < 0 || index >= this.mixerTracks.length) return;
        if (!this.initialized) await this.init();
        const decoded = await this.context.decodeAudioData(await file.arrayBuffer());
        this.loadMixerBuffer(index, decoded, file.name);
    }

    loadMixerBuffer(index, decoded, name) {
        if (!decoded || index < 0 || index >= this.mixerTracks.length) return;
        const track = this.mixerTracks[index];
        this.stopMixerTrack(index);
        track.buffer = decoded;
        track.reverseBuffer = null;
        track.name = name;
        track.offset = 0;
        track.isScrubbing = false;
        track.resumeAfterScrub = false;
        track.detectedBpm = detectTempo(decoded);
        track.targetBpm = Math.max(50, Math.min(200, track.detectedBpm || 120));
        track.playbackRate = 1;
    }

    async toggleMixerTrack(index) {
        const track = this.mixerTracks[index];
        if (!track?.buffer) return false;
        if (this.context.state === 'suspended') await this.context.resume();

        if (track.isPlaying) {
            track.offset = this.getMixerTrackPosition(index);
            track.source.onended = null;
            track.source.stop();
            track.source.disconnect();
            track.source = null;
            track.isPlaying = false;
            return false;
        }

        track.offset %= track.buffer.duration;
        this.startMixerTrack(index);
        return true;
    }

    startMixerTrack(index) {
        const track = this.mixerTracks[index];
        const source = this.context.createBufferSource();
        source.buffer = track.buffer;
        source.connect(track.filters[0]);
        source.playbackRate.value = track.playbackRate;
        source.onended = () => {
            if (track.source !== source) return;
            track.source = null;
            if (track.isScrubbing) return;
            track.isPlaying = false;
            track.offset = 0;
            this.fire('mixerTrackEnded', index);
        };
        track.startedAt = this.context.currentTime;
        track.source = source;
        track.isPlaying = true;
        source.start(0, track.offset);
    }

    seekMixerTrack(index, seconds) {
        const track = this.mixerTracks[index];
        if (!track?.buffer) return;
        track.offset = Math.max(0, Math.min(Number(seconds) || 0, track.buffer.duration - 1 / track.buffer.sampleRate));
        if (!track.isPlaying) return;
        track.source.onended = null;
        track.source.stop();
        track.source.disconnect();
        track.source = null;
        this.startMixerTrack(index);
    }

    beginMixerScrub(index) {
        const track = this.mixerTracks[index];
        if (!track?.buffer || track.isScrubbing) return false;
        const wasPlaying = track.isPlaying;
        if (wasPlaying) {
            track.offset = this.getMixerTrackPosition(index);
            track.source.onended = null;
            track.source.stop();
            track.source.disconnect();
            track.source = null;
        }
        track.resumeAfterScrub = wasPlaying;
        track.isPlaying = false;
        track.isScrubbing = true;
        track.scrubDirection = 0;
        this.fire('mixerTrackScrub', index);
        return true;
    }

    scrubMixerTrack(index, secondsDelta, velocity) {
        const track = this.mixerTracks[index];
        if (!track?.isScrubbing || !track.buffer) return;
        track.offset = Math.max(0, Math.min(
            track.offset + secondsDelta,
            track.buffer.duration - 1 / track.buffer.sampleRate
        ));

        const direction = Math.sign(velocity);
        const rate = Math.min(3, Math.abs(velocity));
        if (direction === 0 || rate < 0.04) {
            if (track.source) {
                track.source.onended = null;
                track.source.stop();
                track.source.disconnect();
                track.source = null;
            }
            track.scrubDirection = 0;
            return;
        }

        if (direction < 0 && !track.reverseBuffer) {
            track.reverseBuffer = this.context.createBuffer(
                track.buffer.numberOfChannels,
                track.buffer.length,
                track.buffer.sampleRate
            );
            for (let channel = 0; channel < track.buffer.numberOfChannels; channel += 1) {
                track.reverseBuffer.getChannelData(channel).set(track.buffer.getChannelData(channel).slice().reverse());
            }
        }

        if (track.source) {
            track.source.onended = null;
            track.source.stop();
            track.source.disconnect();
            track.source = null;
        }
        const source = this.context.createBufferSource();
        source.buffer = direction < 0 ? track.reverseBuffer : track.buffer;
        source.connect(track.filters[0]);
        source.playbackRate.value = rate;
        source.onended = () => {
            if (track.source === source) track.source = null;
        };
        const sourceOffset = direction < 0 ? track.buffer.duration - track.offset : track.offset;
        source.start(0, Math.max(0, Math.min(sourceOffset, track.buffer.duration - 1 / track.buffer.sampleRate)));
        track.source = source;
        track.scrubDirection = direction;
    }

    endMixerScrub(index) {
        const track = this.mixerTracks[index];
        if (!track?.isScrubbing) return;
        if (track.source) {
            track.source.onended = null;
            track.source.stop();
            track.source.disconnect();
            track.source = null;
        }
        track.isScrubbing = false;
        track.scrubDirection = 0;
        track.isPlaying = track.resumeAfterScrub;
        track.resumeAfterScrub = false;
        if (track.isPlaying) this.startMixerTrack(index);
        this.fire('mixerTrackScrub', index);
    }

    getMixerTrackPosition(index) {
        const track = this.mixerTracks[index];
        if (!track?.buffer) return 0;
        if (track.isScrubbing || !track.isPlaying) return track.offset;
        const elapsed = this.context.currentTime - track.startedAt;
        return Math.min(track.buffer.duration, track.offset + elapsed * track.playbackRate);
    }

    stopMixerTrack(index) {
        const track = this.mixerTracks[index];
        if (!track) return;
        if (track.source) {
            track.source.onended = null;
            track.source.stop();
            track.source.disconnect();
            track.source = null;
        }
        track.isPlaying = false;
        track.isScrubbing = false;
        track.resumeAfterScrub = false;
        track.offset = 0;
    }

    setMixerEq(index, band, decibels) {
        const filter = this.mixerTracks[index]?.filters?.[band];
        if (filter) filter.gain.setTargetAtTime(decibels, this.context.currentTime, 0.015);
    }

    setMixerMute(index, muted) {
        const track = this.mixerTracks[index];
        if (!track?.gain) return;
        track.muted = muted;
        track.gain.gain.setTargetAtTime(muted ? 0 : track.volume, this.context.currentTime, 0.015);
    }

    setMixerVolume(index, volume) {
        const track = this.mixerTracks[index];
        if (!track) return;
        track.volume = Math.max(0, Math.min(1, Number(volume) || 0));
        if (track.gain) track.gain.gain.setTargetAtTime(track.muted ? 0 : track.volume, this.context.currentTime, 0.015);
    }

    setMixerTempo(index, bpm) {
        const track = this.mixerTracks[index];
        if (!track) return;
        track.targetBpm = Math.max(50, Math.min(200, Number(bpm) || 120));
        const playbackRate = track.targetBpm / (track.detectedBpm || 120);
        if (track.source && track.isPlaying) {
            const now = this.context.currentTime;
            track.offset = this.getMixerTrackPosition(index);
            track.startedAt = now;
            track.playbackRate = playbackRate;
            track.source.playbackRate.setTargetAtTime(playbackRate, now, 0.02);
        } else {
            track.playbackRate = playbackRate;
        }
    }

    async startLooperRecording(index, inputStream = null) {
        if (!this.initialized) await this.init();
        if (index < 0 || index >= this.looperTapes.length || this.looperRecording) return false;
        if (this.context.state === 'suspended') await this.context.resume();

        const processor = this.context.createScriptProcessor(4096, 2, 2);
        const silentGain = this.context.createGain();
        const chunks = [];
        const previewLeft = new Float32Array(800);
        const previewRight = new Float32Array(800);
        let channels = 2;
        let frameCount = 0;
        processor.onaudioprocess = (event) => {
            const input = event.inputBuffer;
            channels = Math.min(2, input.numberOfChannels);
            const channelData = Array.from({ length: channels }, (_, channel) => input.getChannelData(channel).slice());
            chunks.push(channelData);
            const previewFrames = 10 * this.context.sampleRate;
            for (let frame = 0; frame < input.length && frameCount + frame < previewFrames; frame += 1) {
                const x = Math.min(previewLeft.length - 1, Math.floor(((frameCount + frame) / previewFrames) * previewLeft.length));
                previewLeft[x] = Math.max(previewLeft[x], Math.abs(channelData[0][frame] || 0));
                previewRight[x] = Math.max(previewRight[x], Math.abs(channelData[channels > 1 ? 1 : 0][frame] || 0));
            }
            frameCount += input.length;
            for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
                event.outputBuffer.getChannelData(channel).fill(0);
            }
        };
        silentGain.gain.value = 0;
        const source = inputStream
            ? this.context.createMediaStreamSource(inputStream)
            : this.masterGain;
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(this.context.destination);
        this.looperRecording = {
            index, processor, silentGain, source, inputStream, chunks, channels,
            sampleRate: this.context.sampleRate, previewLeft, previewRight, frameCount: () => frameCount
        };
        return true;
    }

    stopLooperRecording() {
        const recording = this.looperRecording;
        if (!recording) return null;
        this.looperRecording = null;
        recording.processor.onaudioprocess = null;
        recording.source.disconnect(recording.processor);
        recording.processor.disconnect();
        recording.silentGain.disconnect();

        const frameCount = recording.chunks.reduce((total, chunk) => total + chunk[0].length, 0);
        if (!frameCount) return null;
        const buffer = this.context.createBuffer(recording.channels, frameCount, recording.sampleRate);
        const outputChannels = Array.from({ length: recording.channels }, (_, channel) => buffer.getChannelData(channel));
        let offset = 0;
        recording.chunks.forEach((chunk) => {
            for (let channel = 0; channel < recording.channels; channel += 1) {
                outputChannels[channel].set(chunk[channel] || chunk[0], offset);
            }
            offset += chunk[0].length;
        });

        const tape = this.looperTapes[recording.index];
        this.stopLooperTape(recording.index);
        tape.buffer = buffer;
        tape.trimStart = 0;
        tape.trimEnd = 1;
        return recording.index;
    }

    setLooperTrim(index, start, end) {
        const tape = this.looperTapes[index];
        if (!tape) return;
        const safeStart = Math.max(0, Math.min(0.99, Number(start) || 0));
        const safeEnd = Math.max(safeStart + 0.01, Math.min(1, Number(end) || 1));
        tape.trimStart = safeStart;
        tape.trimEnd = safeEnd;
        if (tape.isPlaying) this.playLooperTape(index);
    }

    setLooperStyle(index, style) {
        const tape = this.looperTapes[index];
        if (!tape) return;
        tape.style = style;
        if (tape.isPlaying) this.playLooperTape(index);
    }

    playLooperTape(index) {
        const tape = this.looperTapes[index];
        if (!tape?.buffer) return false;
        this.stopLooperTape(index);
        const start = tape.trimStart * tape.buffer.duration;
        const end = Math.max(start + 0.01, tape.trimEnd * tape.buffer.duration);
        const source = this.context.createBufferSource();
        source.buffer = tape.buffer;
        source.loop = true;
        source.loopStart = start;
        source.loopEnd = Math.min(end, tape.buffer.duration);

        tape.styleFilter = this.connectLooperStyle(tape, source);

        source.onended = () => {
            if (tape.source !== source) return;
            tape.source = null;
            tape.isPlaying = false;
        };
        tape.source = source;
        tape.isPlaying = true;
        source.start(0, start);
        return true;
    }

    stopLooperTape(index) {
        const tape = this.looperTapes[index];
        if (!tape) return;
        if (tape.source) {
            tape.source.onended = null;
            tape.source.stop();
            tape.source.disconnect();
            tape.source = null;
        }
        tape.styleFilter?.disconnect();
        tape.styleFilter = null;
        tape.voices.forEach((voice) => {
            voice.onended = null;
            try {
                voice.stop();
                voice.disconnect();
            } catch {}
        });
        tape.voices.clear();
        tape.isPlaying = false;
    }

    clearLooperTape(index) {
        this.stopLooperTape(index);
        const tape = this.looperTapes[index];
        if (!tape) return;
        tape.buffer = null;
        tape.trimStart = 0;
        tape.trimEnd = 1;
    }

    triggerLooperKey(index, keyIndex, octaveShift = 0) {
        const tape = this.looperTapes[index];
        if (!tape?.buffer || keyIndex < 0 || keyIndex > 23) return false;
        const source = this.context.createBufferSource();
        source.buffer = tape.buffer;
        source.playbackRate.value = 2 ** ((keyIndex + octaveShift * 12) / 12);
        const start = tape.trimStart * tape.buffer.duration;
        const end = Math.min(tape.buffer.duration, tape.trimEnd * tape.buffer.duration);
        const length = Math.max(0.01, end - start);
        source.onended = () => {
            tape.voices.delete(source);
            styleFilter?.disconnect();
            source.disconnect();
        };
        const styleFilter = this.connectLooperStyle(tape, source);
        tape.voices.add(source);
        source.start(0, start, length);
        return true;
    }

    connectLooperStyle(tape, source) {
        if (tape.style === 'normal') {
            source.connect(this.masterGain);
            return null;
        }
        const filter = this.context.createBiquadFilter();
        filter.type = tape.style === 'warm' ? 'lowshelf' : tape.style === 'chrome' ? 'highshelf' : 'lowpass';
        filter.frequency.value = tape.style === 'warm' ? 260 : tape.style === 'chrome' ? 4200 : 5200;
        filter.gain.value = tape.style === 'warm' ? 2 : tape.style === 'chrome' ? 3 : 0;
        source.connect(filter);
        filter.connect(this.masterGain);
        return filter;
    }

    async startSessionRecording() {
        if (!this.initialized) await this.init();
        if (this.sessionRecording) return;
        if (typeof window.lamejs?.Mp3Encoder !== 'function') throw new Error('The MP3 encoder could not be loaded.');
        if (this.context.state === 'suspended') await this.context.resume();

        const processor = this.context.createScriptProcessor(4096, 2, 2);
        const silentGain = this.context.createGain();
        const chunks = [];
        let channelCount = 2;
        processor.onaudioprocess = (event) => {
            const input = event.inputBuffer;
            channelCount = Math.min(2, input.numberOfChannels);
            chunks.push(Array.from({ length: channelCount }, (_, channel) => input.getChannelData(channel).slice()));
            for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
                event.outputBuffer.getChannelData(channel).fill(0);
            }
        };
        silentGain.gain.value = 0;
        this.masterGain.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(this.context.destination);
        this.sessionRecording = { processor, silentGain, chunks, channelCount, sampleRate: this.context.sampleRate };
    }

    async stopSessionRecording() {
        if (!this.sessionRecording) return null;
        const recording = this.sessionRecording;
        this.sessionRecording = null;
        recording.processor.onaudioprocess = null;
        this.masterGain.disconnect(recording.processor);
        recording.processor.disconnect();
        recording.silentGain.disconnect();

        const frameCount = recording.chunks.reduce((total, chunk) => total + chunk[0].length, 0);
        if (frameCount === 0) return new Blob([], { type: 'audio/mpeg' });

        const channelCount = recording.channelCount;
        const audioChannels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
        let offset = 0;
        recording.chunks.forEach((chunk) => {
            for (let channel = 0; channel < channelCount; channel += 1) {
                audioChannels[channel].set(chunk[channel] || chunk[0], offset);
            }
            offset += chunk[0].length;
        });

        const encoder = new window.lamejs.Mp3Encoder(channelCount, recording.sampleRate, 192);
        const mp3Chunks = [];
        for (let start = 0; start < frameCount; start += 1152) {
            const end = Math.min(frameCount, start + 1152);
            const left = this.toPcm16(audioChannels[0].subarray(start, end));
            const encoded = channelCount > 1
                ? encoder.encodeBuffer(left, this.toPcm16(audioChannels[1].subarray(start, end)))
                : encoder.encodeBuffer(left);
            if (encoded.length > 0) mp3Chunks.push(encoded);
        }
        const finalChunk = encoder.flush();
        if (finalChunk.length > 0) mp3Chunks.push(finalChunk);
        return new Blob(mp3Chunks, { type: 'audio/mpeg' });
    }

    toPcm16(samples) {
        const pcm = new Int16Array(samples.length);
        for (let index = 0; index < samples.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, samples[index]));
            pcm[index] = sample < 0 ? sample * 32768 : sample * 32767;
        }
        return pcm;
    }

    handleMessage(message) {
        if (!message || !message.type) return;
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
        if (Object.prototype.hasOwnProperty.call(this.callbacks, name)) this.callbacks[name] = callback;
    }

    fire(name, data = null) {
        const callback = this.callbacks[name];
        if (callback) callback(data);
    }

    async play() {
        if (!this.loaded) return;
        if (this.context.state === 'suspended') await this.context.resume();
        this.worklet.port.postMessage({ type: 'clearRange' });
        this.worklet.port.postMessage({ type: 'speed', speed: this.speed });
        this.worklet.port.postMessage({ type: 'play' });
        this.isPlaying = true;
    }

    async playRange(startFrame, endFrame) {
        if (!this.loaded) return;
        if (this.context.state === 'suspended') await this.context.resume();
        const start = Math.max(0, Math.min(Math.floor(startFrame), this.buffer.length - 1));
        const end = Math.max(start + 1, Math.min(Math.floor(endFrame), this.buffer.length));
        this.speed = 1;
        this.position = start;
        this.worklet.port.postMessage({ type: 'speed', speed: this.speed });
        this.worklet.port.postMessage({ type: 'playRange', start, end });
        this.isPlaying = true;
    }

    pause() {
        if (!this.loaded) return;
        this.worklet.port.postMessage({ type: 'pause' });
        this.isPlaying = false;
    }

    stop() {
        if (!this.loaded) return;
        this.worklet.port.postMessage({ type: 'stop' });
        this.position = 0;
        this.isPlaying = false;
    }

    setSpeed(speed) {
        this.speed = Math.max(-2, Math.min(2, Number(speed) || 0));
        if (this.loaded) this.worklet.port.postMessage({ type: 'speed', speed: this.speed });
    }

    getSpeed() {
        return this.speed;
    }

    seek(position) {
        if (!this.loaded || !this.buffer) return;
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
        if (!this.masterGain) return;
        this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, Number(value) || 0)), this.context.currentTime, 0.02);
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
        if (this.context) await this.context.resume();
    }

    async suspend() {
        if (this.context) await this.context.suspend();
    }

    async destroy() {
        if (!this.context) return;
        this.pause();
        this.mixerTracks.forEach((_, index) => this.stopMixerTrack(index));
        this.looperTapes.forEach((_, index) => this.stopLooperTape(index));
        if (this.looperRecording) this.stopLooperRecording();
        if (this.sessionRecording) await this.stopSessionRecording();
        if (this.worklet) this.worklet.disconnect();
        if (this.masterGain) this.masterGain.disconnect();
        if (this.leftAnalyser) this.leftAnalyser.disconnect();
        if (this.rightAnalyser) this.rightAnalyser.disconnect();
        await this.context.close();
        this.initialized = false;
        this.loaded = false;
        this.buffer = null;
    }
}
