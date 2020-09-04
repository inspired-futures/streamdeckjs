export default class StreamDeckXL
{
    constructor() {
        this.device = null;
        this.handler = null;
        this.canvas = [];
        this.keys = [];

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

    setHandler(handler)
    {
        this.handler = handler;
    }

    async connect(callback)
    {
        if (!navigator.hid) throw "WebHID not available!!!";

        try {
            let devices = await navigator.hid.getDevices();
            this.device = await devices.find(d => d.vendorId === 0x0FD9 && d.productId === 0x006c);
            if (!this.device) this.device = await navigator.hid.requestDevice({filters: [{vendorId: 0x0FD9, productId: 0x006c}]});
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
        context.fillRect(0, 0, 96, 96);
        await this._transferImage(id);
    }

    drawImage(id, url, background)
    {
        console.debug("drawImage", id, url, background);
        const context = this.canvas[id].getContext('2d');
        context.fillStyle = background;
        context.fillRect(0, 0, 96, 96);
        const img = new Image;
        const that = this;

        img.onload = function()
        {
            context.drawImage(img, 0, 0, img.width, img.height, 0, 0, 96, 96);
            that._transferImage(id);
        };
        img.src = url;
    }

    showMediaStream(id, track, fill)
    {
        console.debug("showMediaStream", id, track);

        function errFrame(err)
        {
            console.error('grabFrame() failed: ', err)
        }

        function processFrame(img)
        {
            context.drawImage(img, 0, 0, img.width, img.height, 0, 0, 96, 96);
            that._transferImage(id);
        }

        const that = this;
        const context = that.canvas[id].getContext('2d');
        context.fillStyle = fill;
        context.fillRect(0, 0, 96, 96);
        const imageCapture = new ImageCapture(track);

        return setInterval(function () {
            imageCapture.grabFrame().then(processFrame).catch(errFrame);
        }, 500);
    }

    async writeText(id, text, color, background)
    {
        const context = this.canvas[id].getContext('2d');
        context.fillStyle = background;
        context.fillRect(0, 0, 96, 96);
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
        this._transferImage(id);
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
        for (let i=3; i<35; i++)
        {
            const key = i - 3;
            this.keys[key].down = !!event.data.getUint8(i);
        }
        if (this.handler) this.handler(event, this.keys);
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