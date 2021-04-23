export default class StreamDeckXL
{
    constructor() {
        this.actionChannel = new BroadcastChannel('stream-deck-action');
        this.eventChannel = new BroadcastChannel('stream-deck-event');

        this.device = null;
        this.canvas = [];
        this.keys = [];
        this.images = [];

        for (let i=0; i<32; i++)
        {
            this.keys[i] = {};
            this.keys[i].col = (i % 8) + 1;
            this.keys[i].row = Math.floor(i/8) + 1;

            this.canvas[i] = document.createElement('canvas');
            this.canvas[i].style.display = 'none';
            this.canvas[i].width = 96;
            this.canvas[i].height = 96;
            const context = this.canvas[i].getContext('2d');
            context.translate(this.canvas[i].width, this.canvas[i].height);
            context.scale(-1, -1);
            document.body.appendChild(this.canvas[i]);
        }
    }

    async connect(callback)
    {
        if (!navigator.hid) throw "WebHID not available!!!";

        try {
            let devices = await navigator.hid.getDevices();
            this.device = await devices.find(d => d.vendorId === 0x0FD9 && d.productId === 0x006c);
            if (!this.device) this.device = (await navigator.hid.requestDevice({filters: [{vendorId: 0x0FD9, productId: 0x006c}]}))[0];
            if (!this.device.opened) await this.device.open();
            this.device.addEventListener('inputreport', this._handleDevice.bind(this));
            if (callback) callback();
            const that = this;

            this.actionChannel.addEventListener('message', event =>
            {
                if (event.data.action == 'refresh')
                {
                    for (let i=0; i<32; i++)
                    {
                        if (that.images[i]) that.eventChannel.postMessage(that.images[i]);
                    }
                }
            });
            console.log("stream deck opened", this.device);
        } catch (e) {
            this.error = e;
            if (callback) callback(e);
            console.error("stream deck error", e);
        }
    }

    async reset()
    {
        console.debug("reset");

        if (this.device?.opened)
        {
            let data = Uint8Array.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            await this.device.sendFeatureReport(0x03, data);
        }
    }

    async setBrightness(percent)
    {
        if (this.device?.opened)
        {
            if (percent > 100) throw "Percent must not be over 100!";
            let data = Uint8Array.from([0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            data[1] = percent;
            await this.device.sendFeatureReport(0x03, data);
        }
    }

    async setKeyColor(id, fill)
    {
        const context = this.canvas[id].getContext('2d');
        context.fillStyle = fill;
        context.roundRect(2, 2, 92, 92, 20).fill();
        await this._transferImage(id);
    }

    async writeText(id, text, color, background)
    {
        const context = this.canvas[id].getContext('2d');
        context.fillStyle = background;
        context.roundRect(2, 2, 92, 92, 20).fill();
        context.fillStyle = color;

        if (text.indexOf(" ") > -1)
        {
           context.font = "14px Arial";
           const texts = text.split(" ");
           context.fillText(texts[0], 8, 32);
           context.fillText(texts[1], 8, 48);

        } else {
           context.font = "20px Arial";
           context.fillText(text, 8, 48);
        }
        this._transferImage(id);
    }


    async disconnect()
    {
        if (this.device?.opened)
        {
            await this.device.close();
            this.device.removeEventListener('inputreport', this._handleDevice);
        }
    }

    showUI(callback, ele)
    {
        if (!ele) ele = document.body;
        ele.innerHTML = "";
        const that = this;
        this.ui = {};
        this.ui.canvas = document.createElement('canvas');
        ele.appendChild(this.ui.canvas);
        this.ui.canvas.id = 'stream-deck-xl';
        this.ui.canvas.width = 956;
        this.ui.canvas.height = 600;
        this.ui.canvas.style.cursor = "pointer";

        this.ui.canvas.addEventListener("click", function(e)
        {
            const r = this.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            const col = Math.floor((x - 60) / (96 * 1.08));
            const row = Math.floor((y - 90) / (96 * 1.08));
            const key = (row * 8) + col;
            const keys = {};

            keys[key] = {down: true, col: col, row: row};
            that.eventChannel.postMessage({event: 'keys', keys: keys});
        });

        this.ui.context = this.ui.canvas.getContext('2d');
        const img = new Image;

        img.onload = function()
        {
            that.ui.context.drawImage(img, 0, 0, img.width, img.height, 0, 0, that.ui.canvas.width, that.ui.canvas.height);
            if (callback) callback();
        };

        img.src = "./stream-deck-xl.png";

        this.ui.canvas2 = document.createElement('canvas');
        this.ui.canvas2.width = 96;
        this.ui.canvas2.height = 96;

        this.ui.context2 = that.ui.canvas2.getContext('2d');
        this.ui.context2.translate(that.ui.canvas2.width, that.ui.canvas2.height);
        this.ui.context2.scale(-1, -1);
    }

    handleScreen(event)
    {
        const that = this;

        if (that.ui)
        {
            createImageBitmap(event.data.img).then(function(imgBitmap)
            {
                that.ui.context2.drawImage(imgBitmap, 0, 0, 96, 96, 0, 0, 96, 96);
                const col = event.data.id % 8;
                const row = Math.floor(event.data.id / 8);
                const x = 72 + (col * 96 * 1.08);
                const y = 102 + (row * 96 * 1.06);
                that.ui.context.drawImage(that.ui.canvas2, 0, 0, 96, 96, x, y, 72, 72);
            });
        }
    }

    drawImage(id, url, background)
    {
        console.debug("drawImage", id, url, background);
        const context = this.canvas[id].getContext('2d');
        context.fillStyle = background;
        context.roundRect(2, 2, 92, 92, 20).fill();
        const img = new Image;
        const that = this;

        img.onload = function()
        {
            context.drawImage(img, 0, 0, img.width, img.height, 0, 0, 96, 96);
            that._transferImage(id);
        };
        img.src = url;
    }

    showAudioStream(id, stream, label)
    {
        console.debug("showAudioStream", id, stream);

        const ctx = this.canvas[id].getContext('2d');
        this._roundRect(ctx, 2, 2, 92, 92, 20);

        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.minDecibels = -80;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.85;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        audioCtx.resume();
        return this._visualize(id, this.canvas[id], analyser, label);
    }

    showMediaStream(id, track, label)
    {
        console.debug("showMediaStream", id, track);

        const errFrame = (err) =>
        {
            console.error('grabFrame() failed: ', err)
        }

        const processFrame = (img) =>
        {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 96, 96);
            ctx.fillText(label, 48, 18);
            this._transferImage(id);
        }

        const ctx = this.canvas[id].getContext('2d');
        this._roundRect(ctx, 2, 2, 92, 92, 20);
        ctx.font = "16px Arial";
        ctx.fillStyle = "white";

        const imageCapture = new ImageCapture(track);

        return setInterval(function () {
            imageCapture.grabFrame().then(processFrame).catch(errFrame);
        }, 500);
    }

    showAudioStream(id, stream, label)
    {
        console.debug("showAudioStream", id, stream);

        const canvasCtx = this.canvas[id].getContext('2d');
        this._roundRect(canvasCtx, 2, 2, 92, 92, 20);

        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.minDecibels = -80;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.85;
        audioCtx.createMediaStreamSource(stream).connect(analyser);

        var bufferLength = analyser.frequencyBinCount;
        var dataArray = new Float32Array(bufferLength);
        var MIN = 7;
        var WIDTH = this.canvas[id].width * window.devicePixelRatio;
        var HEIGHT = this.canvas[id].height * window.devicePixelRatio;

        const uuidToColor = (id) =>
        {
            var g = 0, b = 0;

            for (var i = 0; i < id.length/2; i++)
            {
              var code = id.charCodeAt(i);
              g = g + code;
              code = id.charCodeAt(i*2);
              b = b + code;
            }
            return [g % 256, b % 256];
        }

        const draw = () =>
        {
            analyser.getFloatFrequencyData(dataArray);

            var barWidth = (WIDTH / bufferLength) * 3;
            var barHeight, point, x = 0;

            for (var i = 0; i < bufferLength; i++)
            {
                point = dataArray[i];
                barHeight = (point + 140) * 2.5;
                barHeight = HEIGHT / MIN + barHeight / 256 * HEIGHT * (MIN - 1) / MIN;

                if (barHeight < HEIGHT / MIN) {
                  barHeight = HEIGHT / MIN;
                }

                canvasCtx.fillStyle = 'rgb(0, 0, 0)';
                canvasCtx.fillRect(x, 0, barWidth, HEIGHT);

                var r = Math.floor(barHeight + 64);

                if (g % 3 === 0) {
                  canvasCtx.fillStyle = `rgb(${r},${g},${b})`;
                } else if (g % 3 === 1) {
                  canvasCtx.fillStyle = `rgb(${g},${r},${b})`;
                } else {
                  canvasCtx.fillStyle = `rgb(${g},${b},${r})`;
                }

                canvasCtx.fillRect(x, HEIGHT-barHeight + 20, barWidth, barHeight);

                canvasCtx.fillStyle = "white";
                canvasCtx.fillText(label, 36, 16);
                this._transferImage(id);

                x += barWidth + 2;
            }
        }

        var gb = uuidToColor(label);
        var g = gb[0], b = gb[1];

        canvasCtx.fillStyle = 'rgb(0, 0, 0)';
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
        canvasCtx.font = "14px Arial";

        audioCtx.resume();
        return setInterval(draw, 500);
    }

    _roundRect(ctx, x, y, width, height, radius)
    {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.clip();
    }

    _handleDevice(event)
    {
        for (let i=3; i<35; i++)
        {
            const key = i - 3;
            this.keys[key].down = !!event.data.getUint8(i);
        }
        if (this.eventChannel) this.eventChannel.postMessage({event: 'keys', keys: this.keys});
    }

    _transferImage(id)
    {
        const that = this;

        this.canvas[id].toBlob(function(blob)
        {
            blob.arrayBuffer().then(function(buffer)
            {
                //console.debug("_transferImage", id);
                that._setKeyBitmap(id, new Uint8Array(buffer));
            });

        }, 'image/jpeg', 0.95);
    }

    _setKeyBitmap(id, imgData)
    {
        //console.debug("_setKeyBitmap", id, imgData);

        function getFillImageCommandHeader(keyIndex, partIndex, isLast, bodyLength) {
            const headerTemplatePage = new Uint8Array(7);
            const pI = partIndex++;
            headerTemplatePage[0] = 0x07;
            headerTemplatePage[1] = keyIndex;
            headerTemplatePage[2] = isLast ? 1 : 0;
            headerTemplatePage[3] = (bodyLength) & 0xFF;;
            headerTemplatePage[4] = (bodyLength >> 8) & 0xFF;
            headerTemplatePage[5] = (pI) & 0xFF;;
            headerTemplatePage[6] = (pI >> 8) & 0xFF;
            return headerTemplatePage;
        }

        if (this.eventChannel)
        {
            const data = {event: 'images', id: id, img: this.canvas[id].getContext('2d').getImageData(0, 0, 96, 96)};
            this.eventChannel.postMessage(data);
            this.images[id] = data;
        }

        if (this.device?.opened)
        {
            const MAX_PACKET_SIZE = 1023;
            const PACKET_HEADER_LENGTH = 7;
            const MAX_PAYLOAD_SIZE = MAX_PACKET_SIZE - PACKET_HEADER_LENGTH;

            let remainingBytes = imgData.length;
            const keyId = id;

            for (let part = 0; remainingBytes > 0; part++) {
                const packet = new Uint8Array(MAX_PACKET_SIZE);
                const byteCount = Math.min(remainingBytes, MAX_PAYLOAD_SIZE)
                const hdr = getFillImageCommandHeader(keyId, part, remainingBytes <= MAX_PAYLOAD_SIZE, byteCount)
                const byteOffset = imgData.length - remainingBytes;
                remainingBytes -= byteCount;
                const body = imgData.slice(byteOffset, byteOffset + byteCount);
                const page =  Uint8Array.from([...hdr, ...body]);

                //console.debug("_setKeyBitmap - sendReport", keyId, remainingBytes, byteOffset, byteCount, hdr, page);
                this.device.sendReport(0x02, page);
            }
        }
    }
}
CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r)
{
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x+r, y);
    this.arcTo(x+w, y,   x+w, y+h, r);
    this.arcTo(x+w, y+h, x,   y+h, r);
    this.arcTo(x,   y+h, x,   y,   r);
    this.arcTo(x,   y,   x+w, y,   r);
    this.closePath();
    return this;
}