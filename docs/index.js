import StreamDeckXL from "./stream-deck-xl.js";
import StreamDeck from "./stream-deck.js";

const streamDeck = new StreamDeckXL();

window.addEventListener("unload", function()
{
    if (streamDeck.device) streamDeck.disconnect()
});

window.addEventListener("load", function()
{
    const connect = document.getElementById("connect");

    connect.addEventListener('click', event =>
    {
        streamDeck.showUI(function()
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
                    streamDeck.drawImage(5, "./images/normal/Source-On.png", "black");
                    streamDeck.drawImage(6, "./images/normal/Record-On.png", "black");
                    streamDeck.drawImage(7, "./images/normal/Scene-1-On.png", "black");
                    streamDeck.drawImage(14, "./images/normal/Screenshot.png", "black");
                }
            });
        });
    });

    const eventChannel = new BroadcastChannel('stream-deck-event');
    const actionChannel = new BroadcastChannel('stream-deck-action');

    eventChannel.addEventListener('message', event =>
    {
        const keys = event.data;
        console.log("key press", keys);

        if (keys[0]?.down) streamDeck.drawImage(0, "./images/normal/Webcam-Off.png", "white");
        if (keys[1]?.down) streamDeck.drawImage(1, "./images/normal/Multimedia-Mute.png", "white");
        if (keys[2]?.down) streamDeck.drawImage(2, "./images/normal/Audio-Mixer-On.png", "white");
    });

    actionChannel.addEventListener('message', event =>
    {
        console.log("screen refresh", event.data);
        streamDeck.handleScreen(event);
    });
});