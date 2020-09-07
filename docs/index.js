import streamDeckXL from "./stream-deck-xl.js";
import streamDeck from "./stream-deck.js";

const stream_deck = new streamDeck();
const stream_deck_xl = new streamDeckXL();

window.addEventListener("unload", function()
{
    window.eventChannel.close();
    if (window.streamDeck?.device) window.streamDeck.disconnect()
});

window.addEventListener("load", function()
{
    const connect = document.getElementById("connect");
    const show = document.getElementById("show");
    const streamdeck_div = document.getElementById("streamdeck");

    connect.addEventListener('click', event =>
    {
        getStreamDeck();

        if (connect.dataset.status == "off")
        {
            window.streamDeck.connect(function(error)
            {
                if (!error)
                {
                    window.streamDeck.reset();
                    window.streamDeck.setBrightness(80);
                    window.streamDeck.drawImage(0, "./images/normal/Webcam-On.png", "black");
                    window.streamDeck.drawImage(1, "./images/normal/Multimedia-Mute.png", "black");
                    window.streamDeck.drawImage(2, "./images/normal/Audio-Mixer-On.png", "black");
                    window.streamDeck.setKeyColor(3, "#0000ff");
                    window.streamDeck.writeText(4, "Hello", "white", "red");
                    window.streamDeck.drawImage(5, "./images/normal/Source-On.png", "black");
                    window.streamDeck.drawImage(6, "./images/normal/Record-On.png", "black");
                    window.streamDeck.drawImage(7, "./images/normal/Scene-1-On.png", "black");
                    window.streamDeck.drawImage(14, "./images/normal/Screenshot.png", "black");

                    connect.innerHTML = "Disconnect Device";
                    connect.dataset.status = "on";
                }
                else alert("Stream Deck device not found");
            });

        }
        else {
            window.streamDeck.reset();
            window.streamDeck.disconnect();

            connect.innerHTML = "Connect Device";
            connect.dataset.status = "off";
        }
    });

    show.addEventListener('click', event =>
    {
        getStreamDeck();

        window.streamDeck.showUI(function()
        {
            window.actionChannel = new BroadcastChannel('stream-deck-action');
            window.actionChannel.postMessage({action: 'refresh'});

        }, streamdeck_div);
    });

    setupEventHandler();
});

function getStreamDeck()
{
    const device = document.getElementById("device");
    console.debug("device", device.value);

    window.streamDeck = (device.value == "stream-deck") ? stream_deck : stream_deck_xl;
}

function setupEventHandler()
{
    window.eventChannel = new BroadcastChannel('stream-deck-event');
    window.eventChannel.addEventListener('message', event =>
    {
        if (event.data.event == "keys")
        {
            const keys = event.data.keys;
            console.debug("key press", keys);

            if (keys[0]?.down) window.streamDeck.drawImage(0, "./images/normal/Webcam-Off.png", "white");
            if (keys[1]?.down) window.streamDeck.drawImage(1, "./images/normal/Multimedia-Mute.png", "white");
            if (keys[2]?.down) window.streamDeck.drawImage(2, "./images/normal/Audio-Mixer-On.png", "white");
        }
        else

        if (event.data.event == "images")
        {
            console.debug("screen refresh", event.data);
            window.streamDeck.handleScreen(event);
        }
    });
}