import streamDeckXL from "./stream-deck-xl.js";
import streamDeck from "./stream-deck.js";

const stream_deck = new streamDeck();
const stream_deck_xl = new streamDeckXL();

window.addEventListener("unload", function()
{
    window.eventChannel.close();
    if (window.streamDeck?.device) window.streamDeck.disconnect();
    if (window.webcam_animation) clearInterval(window.webcam_animation);
    if (window.mic_animation) clearInterval(window.mic_animation);
});

window.addEventListener("load", function()
{
    const connect = document.getElementById("connect");
    const showui = document.getElementById("showui");
    const showcam = document.getElementById("showcam");
    const showmic = document.getElementById("showmic");
    const load = document.getElementById("load");
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

    showui.addEventListener('click', event =>
    {
        getStreamDeck();

        window.streamDeck.showUI(function()
        {
            window.actionChannel = new BroadcastChannel('stream-deck-action');
            window.actionChannel.postMessage({action: 'refresh'});

        }, streamdeck_div);
    });

    showcam.addEventListener('click', event =>
    {
        let track = null;

        const gotMedia = mediaStream =>
        {
            track = mediaStream.getVideoTracks()[0];
            window.webcam_animation = window.streamDeck.showMediaStream(8, track, "John");
        }

        const errMedia = err =>
        {
            console.error('grabFrame() failed: ', err)
        }

        if (window.webcam_animation) {
            clearInterval(window.webcam_animation);
            window.webcam_animation = null;
            showcam.innerHTML = "Show Webcam";
            if (track) track.stop();
        } else {
            navigator.mediaDevices.getUserMedia({video: true, audio: false}).then(gotMedia).catch(errMedia);
            showcam.innerHTML = "Stop Webcam";
        }
    });

    showmic.addEventListener('click', event =>
    {
        let track = null;

        const gotMedia = mediaStream =>
        {
            track = mediaStream.getAudioTracks()[0];
            window.mic_animation = window.streamDeck.showAudioStream(9, mediaStream, "John");
        }

        const errMedia = err =>
        {
            console.error('grabFrame() failed: ', err)
        }

        if (window.mic_animation) {
            clearInterval(window.mic_animation);
            window.mic_animation = null;
            showmic.innerHTML = "Show Mic";
            if (track) track.stop();
        } else {
            navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(gotMedia).catch(errMedia);
            showmic.innerHTML = "Stop Mic";
        }
    });

    load.addEventListener('click', event =>
    {
        window.streamDeck.drawImage(0, "./images/normal/Webcam-On.png", "black");
        window.streamDeck.drawImage(1, "./images/normal/Multimedia-Mute.png", "black");
        window.streamDeck.drawImage(2, "./images/normal/Audio-Mixer-On.png", "black");
        window.streamDeck.setKeyColor(3, "#0000ff");
        window.streamDeck.writeText(4, "Hello", "white", "red");
        window.streamDeck.drawImage(5, "./images/normal/Source-On.png", "black");
        window.streamDeck.drawImage(6, "./images/normal/Record-On.png", "black");
        window.streamDeck.drawImage(7, "./images/normal/Scene-1-On.png", "black");
        window.streamDeck.writeText(8, "Webcam", "white", "black");
        window.streamDeck.writeText(9, "Mic", "white", "black");
        window.streamDeck.drawImage(14, "./images/normal/Screenshot.png", "black");
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
            window.streamDeck.handleScreen(event);
        }
    });
}