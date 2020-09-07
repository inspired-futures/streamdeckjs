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
            if (!this.device) this.device = await navigator.hid.requestDevice({filters: [{vendorId: 0x0FD9, productId: 0x0060}]});
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

    showMediaStream(id, track, fill)
    {
        console.debug("showMediaStream", id, track, fill);

        function errFrame(err)
        {
            console.error('grabFrame() failed: ', err)
        }

        function processFrame(img)
        {
            context.drawImage(img, 0, 0, img.width, img.height, 0, 0, 72, 72);
            const imgData = context.getImageData(0, 0, 72, 72);
            const pic = imgData.data;
            that._transferImage(id, pic, imgData);
        }

        const that = this;
        const imageCapture = new ImageCapture(track);
        const context = this.canvas.getContext('2d');
        context.fillStyle = fill;
        context.roundRect(0, 0, 72, 72, 20).fill();

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
           context.font = "24px Arial";
           context.fillText(text, 3, 48);
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

                console.debug("handleScreen", imgBitmap);

            });
        }
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
        console.debug("_transferImage", id, pic);
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
        console.debug("_setKeyBitmap", id, imgData);

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