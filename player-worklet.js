/*
============================================================

TP-7 Tape Emulator
player-worklet.js

Part 1

AudioWorkletProcessor

High-quality playback engine with:

• Smooth speed ramping
• Smooth gain ramping
• Cubic interpolation
• Reverse playback
• Low-latency transport

============================================================
*/

class TP7Player extends AudioWorkletProcessor {

    constructor() {

        super();

        /*=====================================================
            AUDIO
        =====================================================*/

        this.left = null;
        this.right = null;

        this.length = 0;
        this.sampleRate = 44100;

        /*=====================================================
            TRANSPORT
        =====================================================*/

        this.position = 0;

        this.playing = false;
        this.loaded = false;

        /*=====================================================
            SPEED
        =====================================================*/

        this.currentSpeed = 0;

        this.targetSpeed = 0;

        this.speedSmoothness = 0.0015;

        /*=====================================================
            OUTPUT GAIN
        =====================================================*/

        this.currentGain = 0;

        this.targetGain = 0;

        this.gainSmoothness = 0.01;

        /*=====================================================
            POSITION REPORTING
        =====================================================*/

        this.reportCounter = 0;

        this.reportInterval = 2048;

        /*=====================================================
            MESSAGE PORT
        =====================================================*/

        this.port.onmessage =

            event => {

                this.handleMessage(

                    event.data

                );

            };

        this.port.postMessage({

            type: "ready"

        });

    }

    /*=========================================================
        MESSAGE HANDLER
    =========================================================*/

    handleMessage(message) {

        switch (message.type) {

            case "load":

                this.left = message.left;

                this.right = message.right;

                this.length = message.length;

                this.sampleRate = message.sampleRate;

                this.position = 0;

                this.loaded = true;

                this.currentSpeed = 0;

                this.targetSpeed = 0;

                this.currentGain = 0;

                this.targetGain = 0;

                this.playing = false;

                break;

            case "play":

                this.playing = true;

                this.targetGain = 1;

                if (this.targetSpeed === 0) {

                    this.targetSpeed = 1;

                }

                break;

            case "pause":

                this.targetGain = 0;

                break;

            case "stop":

                this.targetGain = 0;

                this.targetSpeed = 0;

                this.currentSpeed = 0;

                this.position = 0;

                this.playing = false;

                this.reportPosition();

                break;

            case "seek":

                this.position = Math.max(

                    0,

                    Math.min(

                        message.frame,

                        this.length - 1

                    )

                );

                this.reportPosition();

                break;

            case "speed":

                this.targetSpeed = Number(message.speed) || 0;

                break;

        }

    }

    /*=========================================================
        POSITION
    =========================================================*/

    reportPosition() {

        this.port.postMessage({

            type: "position",

            position: this.position

        });

    }

    playbackEnded() {

        this.playing = false;

        this.targetGain = 0;

        this.targetSpeed = 0;

        this.currentSpeed = 0;

        this.port.postMessage({

            type: "ended"

        });

    }

    /*=========================================================
        CUBIC INTERPOLATION

        Catmull-Rom spline

        Sounds noticeably smoother than
        linear interpolation.

    =========================================================*/

    cubic(buffer, position) {

        const x = Math.floor(position);

        const t = position - x;

        const xm1 = Math.max(

            0,

            x - 1

        );

        const x0 = x;

        const x1 = Math.min(

            this.length - 1,

            x + 1

        );

        const x2 = Math.min(

            this.length - 1,

            x + 2

        );

        const p0 = buffer[xm1];

        const p1 = buffer[x0];

        const p2 = buffer[x1];

        const p3 = buffer[x2];

        const a =
            -0.5 * p0 +
             1.5 * p1 -
             1.5 * p2 +
             0.5 * p3;

        const b =
             p0 -
             2.5 * p1 +
             2.0 * p2 -
             0.5 * p3;

        const c =
            -0.5 * p0 +
             0.5 * p2;

        const d = p1;

        return (

            ((a * t + b) * t + c) * t + d

        );

    }
        /*=========================================================
        AUDIO RENDERING
    =========================================================*/

    process(inputs, outputs) {

        const output = outputs[0];

        const leftOut = output[0];
        const rightOut = output[1];

        const frames = leftOut.length;

        if (!this.loaded) {

            leftOut.fill(0);
            rightOut.fill(0);

            return true;

        }

        for (let i = 0; i < frames; i++) {

            /*---------------------------------------------
                Smooth parameters
            ---------------------------------------------*/

            this.currentSpeed +=

                (this.targetSpeed - this.currentSpeed)

                * this.speedSmoothness;

            this.currentGain +=

                (this.targetGain - this.currentGain)

                * this.gainSmoothness;

            /*---------------------------------------------
                Silent output
            ---------------------------------------------*/

            if (

                this.currentGain < 0.00005 ||

                Math.abs(this.currentSpeed) < 0.00005 ||

                !this.playing

            ) {

                leftOut[i] = 0;
                rightOut[i] = 0;

                continue;

            }

            /*---------------------------------------------
                Cubic interpolation
            ---------------------------------------------*/

            leftOut[i] =

                this.cubic(

                    this.left,

                    this.position

                ) * this.currentGain;

            rightOut[i] =

                this.cubic(

                    this.right,

                    this.position

                ) * this.currentGain;

            /*---------------------------------------------
                Advance transport
            ---------------------------------------------*/

            this.position += this.currentSpeed;

            /*---------------------------------------------
                End of tape
            ---------------------------------------------*/

            if (this.position >= this.length) {

                this.position = this.length - 1;

                this.playbackEnded();

                leftOut.fill(0, i + 1);
                rightOut.fill(0, i + 1);

                break;

            }

            if (this.position < 0) {

                this.position = 0;

                this.playbackEnded();

                leftOut.fill(0, i + 1);
                rightOut.fill(0, i + 1);

                break;

            }

        }

        /*---------------------------------------------
            Position updates
        ---------------------------------------------*/

        this.reportCounter += frames;

        if (

            this.reportCounter >=

            this.reportInterval

        ) {

            this.reportCounter = 0;

            this.reportPosition();

        }

        return true;

    }

}

registerProcessor(

    "tp7-player",

    TP7Player

);