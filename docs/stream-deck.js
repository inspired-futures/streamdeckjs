export default class StreamDeck
{
    constructor()
    {
        this.actionChannel = new BroadcastChannel('stream-deck-action');
        this.eventChannel = new BroadcastChannel('stream-deck-event');

        this.device = null;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 72;
        this.canvas.height = 72;
        this.keys = [];
        this.images = [];

        for (let i=0; i<15; i++)
        {
            this.keys[i] = {};
            this.keys[i].col = (i % 5) + 1;
            this.keys[i].row = Math.floor(i/5) + 1;
        }
    }

    async connect(callback)
    {
        if (!navigator.hid) throw "WebHID not available!!!";

        try {
            let devices = await navigator.hid.getDevices();
            this.device = devices.find(d => d.vendorId === 0x0FD9 && d.productId === 0x0060);
            if (!this.device) this.device = (await navigator.hid.requestDevice({filters: [{vendorId: 0x0FD9, productId: 0x0060}]}))[0];
            if (!this.device.opened) await this.device.open();
            this.device.addEventListener('inputreport', this._handleDevice.bind(this));
            if (callback) callback();
            const that = this;

            this.actionChannel.addEventListener('message', event =>
            {
                if (that.actionChannel && event.data.action == 'refresh')
                {
                    for (let i=0; i<15; i++)
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
        if (this.device?.opened)
        {
            let data = Uint8Array.from([0x63, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            await this.device.sendFeatureReport(0x0B, data);
        }
    }

    async setBrightness(percent)
    {
        if (this.device?.opened)
        {
            if (percent > 100) throw "Percent must not be over 100!";
            let data = Uint8Array.from([0x55, 0xaa, 0xd1, 0x01, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            data[4] = percent;
            await this.device.sendFeatureReport(0x05, data);
        }
    }

    setKeyColor(id, fill)
    {
        const context = this.canvas.getContext('2d');
        context.fillStyle = fill;
        context.roundRect(0, 0, 72, 72, 20).fill();
        const img = context.getImageData(0, 0, 72, 72);
        const pic = img.data;
        this._transferImage(id, pic, img);
    }

    drawImage(id, url, background)
    {
        if (!background) background = "#ffffff";

        console.debug("drawImage", id, url);
        const context = this.canvas.getContext('2d');
        const img = new Image;
        const that = this;

        img.onload = function()
        {
            context.fillStyle = background;
            context.roundRect(0, 0, 72, 72, 20).fill();
            context.drawImage(img, 0, 0, img.width, img.height, 0, 0, 72, 72);
            const imgData = context.getImageData(0, 0, 72, 72);
            const pic = imgData.data;
            that._transferImage(id, pic, imgData);
        };
        img.src = url;
    }

    showAudioStream(id, stream, label)
    {
        console.debug("showAudioStream", id, stream);

        const canvasCtx = this.canvas.getContext('2d');
        this._roundRect(canvasCtx, 2, 2, 68, 68, 20);

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
        var WIDTH = this.canvas.width * window.devicePixelRatio;
        var HEIGHT = this.canvas.height * window.devicePixelRatio;

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

                canvasCtx.fillRect(x, HEIGHT-barHeight + 15, barWidth, barHeight);

                canvasCtx.fillStyle = "white";
                canvasCtx.fillText(label, 36, 18);

                const imgData = canvasCtx.getImageData(0, 0, 72, 72);
                const pic = imgData.data;
                this._transferImage(id, pic, imgData);

                x += barWidth + 2;
            }
        }

        var gb = uuidToColor(label);
        var g = gb[0], b = gb[1];

        canvasCtx.fillStyle = 'rgb(0, 0, 0)';
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
        canvasCtx.font = "12px Arial";

        audioCtx.resume();
        return setInterval(draw, 1000);
    }

    showMediaStream(id, track, label)
    {
        console.debug("showMediaStream", id, track, label);

        const errFrame = (err) =>
        {
            console.error('grabFrame() failed: ', err)
        }

        const processFrame = (img) =>
        {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 72, 72);
            ctx.fillText(label, 48, 18);
            const imgData = ctx.getImageData(0, 0, 72, 72);
            const pic = imgData.data;
            this._transferImage(id, pic, imgData);
        }

        const ctx = this.canvas.getContext('2d');
        this._roundRect(ctx, 2, 2, 68, 68, 20);
        ctx.font = "12px Arial";
        ctx.fillStyle = "white";

        const imageCapture = new ImageCapture(track);

        return setInterval(function () {
            imageCapture.grabFrame().then(processFrame).catch(errFrame);
        }, 500);
    }

    writeText(id, text, color, background)
    {
        if (!background) background = "#000000";
        if (!color) color = "#ffffff";

        console.debug("writeText", id, text, color, background);
        const context = this.canvas.getContext('2d');
        context.fillStyle = background;
        context.roundRect(0, 0, 72, 72, 20).fill();
        context.fillStyle = color;

        if (text.indexOf(" ") > -1)
        {
           context.font = "16px Arial";
           const texts = text.split(" ");
           context.fillText(texts[0], 3, 32);
           context.fillText(texts[1], 3, 48);

        } else {
           context.font = "20px Arial";
           context.fillText(text, 3, 40);
        }

        const img = context.getImageData(0, 0, 72, 72);
        const pic = img.data;
        this._transferImage(id, pic, img);
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
        this.ui.canvas.id = 'stream-deck';
        this.ui.canvas.width = 638;
        this.ui.canvas.height = 503;
        this.ui.canvas.style.cursor = "pointer";

        this.ui.canvas.addEventListener("click", function(e)
        {
            const r = this.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            const col = 5 - Math.floor((x + 40) / 106);
            const row = Math.floor((y - 100) / 103);
            const key = (row * 5) + col;
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

        img.src = "./stream-deck.png";
    }

    handleScreen(event)
    {
        const that = this;

        if (that.ui)
        {
            createImageBitmap(event.data.img).then(function(imgBitmap)
            {
                const col = 5 - (event.data.id % 5);
                const row = Math.floor(event.data.id / 5);
                const x = -40 + (col * 106);
                const y = 100 + (row * 103);
                that.ui.context.drawImage(imgBitmap, 0, 0, 72, 72, x, y, 80, 80);
            });
        }
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
        for (let i=0; i<15; i++)
        {
            const key = i;
            this.keys[key].down = !!event.data.getUint8(i);
        }

        if (this.eventChannel) this.eventChannel.postMessage({event: 'keys', keys: this.keys});
    }

    _transferImage(id, pic, imgData)
    {
        //console.debug("_transferImage", id, pic);
        const height = 72;
        const width = 72;
        const img = new Uint8Array(height * width * 3);

        for (let row = 0; row < height; row++)
        {
            for (let col = 0; col < width; col++)
            {
                const i = ((row + 1) * height * 3) - ((col) * 3) - 3;
                const j = ((row + 1) * height * 4) - ((width - col) * 4) - 4;

                img[i] = pic[j + 2];
                img[i + 1] = pic[j + 1];
                img[i + 2] = pic[j];
            }
        }
        this._setKeyBitmap(id, img, imgData);
    }

    async _setKeyBitmap(id, img, imgData)
    {
        //console.debug("_setKeyBitmap", id, imgData);

        if (this.eventChannel)
        {
            const data = {event: 'images', id: id, img: imgData};
            this.eventChannel.postMessage(data);
            this.images[id] = data;
        }

        const pagePacketSize = 8191;
        const numFirstPageBytes = 7749;

        const headerTemplatePage1 = [
            0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x42, 0x4d, 0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x36, 0x00, 0x00, 0x00, 0x28, 0x00,
            0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x48, 0x00,
            0x00, 0x00, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00,
            0x00, 0x00, 0xc0, 0x3c, 0x00, 0x00, 0xc4, 0x0e,
            0x00, 0x00, 0xc4, 0x0e, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ];

        const headerTemplatePage2 = [
            0x01, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ];

        if (this.device?.opened)
        {
            const firstPart = img.slice(0, numFirstPageBytes);
            const secondPart = img.slice(numFirstPageBytes);
            const firstPage = [...headerTemplatePage1, ...firstPart];
            const secondPage = [...headerTemplatePage2, ...secondPart];
            firstPage[4] = id + 1;
            secondPage[4] = id + 1;
            const page1 = Uint8Array.from(firstPage.slice(0, pagePacketSize));
            const page2 = Uint8Array.from(secondPage.slice(0, pagePacketSize));
            await this.device.sendReport(0x02, page1);
            await this.device.sendReport(0x02, page2);
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