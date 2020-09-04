export default class StreamDeck
{
    constructor()
    {
        this.device = null;
        this.handler = null;

        this.keys = [];

        for (let i=0; i<15; i++)
        {
            this.keys[i] = {};
            this.keys[i].col = (i % 5) + 1;
            this.keys[i].row = Math.floor(i/5) + 1;
        }
    }

    setHandler(handler)
    {
        this.handler = handler;
    }

    async connect(callback)
    {
        if (!navigator.hid) throw "WebHID not available!!!";

        try {
            let devices = await navigator.hid.getDevices();
            this.device = devices.find(d => d.vendorId === 0x0FD9 && d.productId === 0x0060);
            if (!this.device) this.device = await navigator.hid.requestDevice({filters: [{vendorId: 0x0FD9, productId: 0x0060}]});
            if (!this.device.opened) await this.device.open();
            this.device.addEventListener('inputreport', this._handler.bind(this));
            if (callback) callback();
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
        const offscreen = new OffscreenCanvas(72, 72);
        const context = offscreen.getContext('2d');
        context.fillStyle = fill;
        context.fillRect(0, 0, 72, 72);
        const pic = context.getImageData(0, 0, 72, 72).data;
        this._transferImage(id, pic);
    }

    drawImage(id, url, background)
    {
        if (!background) background = "#ffffff";

        console.debug("drawImage", id, url);
        const offscreen = new OffscreenCanvas(72, 72);
        const context = offscreen.getContext('2d');
        const img = new Image;
        const that = this;

        img.onload = function()
        {
            context.fillStyle = background;
            context.fillRect(0, 0, 72, 72);
            context.drawImage(img, 0, 0, img.width, img.height, 0, 0, 72, 72);
            const pic = context.getImageData(0, 0, 72, 72).data;
            that._transferImage(id, pic);
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
            const pic = context.getImageData(0, 0, 72, 72).data;
            that._transferImage(id, pic);
        }

        const that = this;
        const imageCapture = new ImageCapture(track);
        const offscreen = new OffscreenCanvas(72, 72);
        const context = offscreen.getContext('2d');
        context.fillStyle = fill;
        context.fillRect(0, 0, 72, 72);

        return setInterval(function () {
            imageCapture.grabFrame().then(processFrame).catch(errFrame);
        }, 500);
    }

    writeText(id, text, color, background)
    {
        if (!background) background = "#000000";
        if (!color) color = "#ffffff";

        console.debug("writeText", id, text, color, background);
        const offscreen = new OffscreenCanvas(72, 72);
        const context = offscreen.getContext('2d');
        context.fillStyle = background;
        context.fillRect(0, 0, 72, 72);
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

        const pic = context.getImageData(0, 0, 72, 72).data;
        this._transferImage(id, pic);
    }


    async disconnect()
    {
        if (this.device?.opened)
        {
            await this.device.close();
            this.device.removeEventListener('inputreport', this._handler);
        }
    }

    _handler(event)
    {
        for (let i=0; i<15; i++)
        {
            const key = i;
            this.keys[key].down = !!event.data.getUint8(i);
        }
        if (this.handler) this.handler(event, this.keys);
    }

    _transferImage(id, pic)
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
        this._setKeyBitmap(id, img);
    }

    async _setKeyBitmap(id, imgData)
    {
        console.debug("_setKeyBitmap", id, imgData);
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
            const firstPart = imgData.slice(0, numFirstPageBytes);
            const secondPart = imgData.slice(numFirstPageBytes);
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