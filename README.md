# streamdeck.js
JavaScript library to control the Stream Deck USB device. Only tested on Chrome 85+

```
import StreamDeckXL from "./stream-deck-xl.js";
import StreamDeck from "./stream-deck.js";

const streamDeck = new StreamDeckXL();

window.addEventListener("unload", function()
{
    if (streamDeck.device) streamDeck.disconnect();
});

window.addEventListener("load", function()
{
    const connect = document.getElementById("connect");

    connect.addEventListener('click', event =>
    {
        streamDeck.connect(function(error)
        {
            if (!error)
            {
                streamDeck.reset();
                streamDeck.setBrightness(80);
                streamDeck.drawImage(0, "./images/normal/Webcam-On.png", "black");
                streamDeck.drawImage(1, "./images/normal/Multimedia-Mute.png", "black");
                streamDeck.drawImage(2, "./images/normal/Audio-Mixer-On.png", "black");
                streamDeck.setKeyColor(3, "#0000ff");
                streamDeck.writeText(4, "Hello", "white", "red");
            }
        });
    });

    const eventChannel = new BroadcastChannel('stream-deck-event');

    eventChannel.addEventListener('message', event =>
    {
        const keys = event.data;
        console.log("key press", keys);

        if (keys[0]?.down) streamDeck.drawImage(0, "./images/normal/Webcam-Off.png", "white");
        if (keys[1]?.down) streamDeck.drawImage(1, "./images/normal/Multimedia-Mute.png", "white");
        if (keys[2]?.down) streamDeck.drawImage(2, "./images/normal/Audio-Mixer-On.png", "white");
    });
});
```
