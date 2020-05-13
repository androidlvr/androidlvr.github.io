// connect to socket.io relay server
var socket = io("https://relay.komodo-dev.library.illinois.edu");
// var socket = io("http://localhost:3000");


/**
 * Get the URL parameters
 * source: https://css-tricks.com/snippets/javascript/get-url-variables/
 * @param  {String} url The URL
 * @return {Object}     The URL parameters
 */
var getParams = function (url) {
    var params = {};
    var parser = document.createElement('a');
    parser.href = url;
    var query = parser.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        params[pair[0]] = decodeURIComponent(pair[1]);
    }
    return params;
};

let params = getParams(window.location.href);
console.log(params);



//dummy ids
var session_id = Number(params.session);
var client_id = Number(params.client);
var isTeacher = Number(params.teacher) || 0;
var playback_id = Number(params.playback);


//  receiving asset list using API
var assets = [];
var assets_url = "https://api.komodo-dev.library.illinois.edu/api/portal/labs/"+ session_id.toString() + "/assets";
var request = new XMLHttpRequest();
request.open("GET", assets_url, true);
request.responseType = "json";
request.send();

request.onload = function(){
    let assets_response = request.response;
    for (idx = 0; idx<assets_response.length; idx++)
    {
        asset = new Object;
        asset.name = assets_response[idx].asset_name.toString();
        asset.url = assets_response[idx].path.toString();
        asset.scale = 0.1;
        assets.push(asset);
    }
    console.log(JSON.stringify(assets));
}



// join session by id
var joinIds = [session_id, client_id]
socket.emit("join", joinIds);

const startPlayback = function() {
    console.log('playback started:', playback_id);
    let playbackArgs = [client_id, session_id, playback_id]
    socket.emit('playback', playbackArgs);
}

socket.on('playbackEnd', function() {
    console.log('playback ended');
})

// To prevent the EMFILE error, clear the sendbuffer when reconnecting
socket.on('reconnecting',function(){
    socket.sendBuffer = [];
});

// clear client audio buffer on join to reset scheduling
socket.on('joined', function(client_id) {
    delete clientAudioBuffers[client_id];
    console.log('client joined session:', client_id);
});


/////////////////
// audio relay //
/////////////////
const PLAYBACK_SAMPLE_RATE = 48000
const MIC_SAMPLE_RATE = PLAYBACK_SAMPLE_RATE;
const RECORD_BUFFER_SIZE = 2048;

let playContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
let recordContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });

// after the user has granted access to the microphone
// create recording audio source, grab raw pcm data off the audio processor node

let initMic = 0;
let enableMicrophone = function() {
    if (initMic == 0) {
        navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
        navigator.mediaDevices.getUserMedia({ audio: { sampleRate: MIC_SAMPLE_RATE }, video: false })
            .then(handleSuccess);
    } else if (recordContext.state == "running") {
        recordContext.suspend().then( () => {
            console.log("Microphone state:", recordContext.state)
        })
    } else if (recordContext.state == "suspended") {
        recordContext.resume().then( () => {
            console.log("Microphone state:", recordContext.state)
        })
    };
};

const handleSuccess = function (stream) {
    initMic = 1;
    console.log("Microphone initialized:", recordContext);
    let recordSource = recordContext.createMediaStreamSource(stream);
    let recordProcessor = recordContext.createScriptProcessor(RECORD_BUFFER_SIZE, 1, 1); 

    recordSource.connect(recordProcessor);
    recordProcessor.connect(recordContext.destination);

    recordProcessor.onaudioprocess = function (e) {
        // send record buffer to server
        data = e.inputBuffer.getChannelData(0); // returns Float32Array
        socket.emit('mic', { session_id: session_id, client_id: client_id, buffer: data.buffer, sampleRate: recordContext.sampleRate });
    };
};


let clientAudioBuffers = {};
let nextTime = 0;

socket.on('micUpdate', function (data) {

    let micClientId = data.client_id;

    // if client leaves session, destroy audio buffer

    // if the client_id doesn't have a buffer
    if (!clientAudioBuffers[micClientId]) {
        console.log('create new client audio buffer:', micClientId);
        clientAudioBuffers[micClientId] = { stack: [], initScheduler: 0, nextTime: 0 };
    } 
    // push new mic data onto client buffer stack
    // after we have at least 10 chunks, start scheduling playback
    let farr = new Float32Array(data.buffer);
    clientAudioBuffers[micClientId].stack.push(farr);
    if((clientAudioBuffers[micClientId].initScheduler !=0) || (clientAudioBuffers[micClientId].stack.length > 10)) {
        scheduleBuffers(micClientId);
        clientAudioBuffers[micClientId].initScheduler++;
    }
});

// mic data playback scheduler
let scheduleBuffers = function(micClientId) {
    while(clientAudioBuffers[micClientId].stack.length) {
        farr = clientAudioBuffers[micClientId].stack.shift();
        let newClientPlaySource = playContext.createBufferSource();
        clientAudioBuffers[micClientId].buffer = playContext.createBuffer(1, RECORD_BUFFER_SIZE, PLAYBACK_SAMPLE_RATE);
        clientAudioBuffers[micClientId].buffer.getChannelData(0).set(farr, 0);
        newClientPlaySource.buffer = clientAudioBuffers[micClientId].buffer;
        newClientPlaySource.connect(playContext.destination);
        if (clientAudioBuffers[micClientId].nextTime == 0) {
            clientAudioBuffers[micClientId].nextTime = playContext.currentTime + 0.10;
        }
        newClientPlaySource.start(clientAudioBuffers[micClientId].nextTime);
        clientAudioBuffers[micClientId].nextTime += newClientPlaySource.buffer.duration;
    }
}

socket.on('micText', function(data) {
    console.log(data);
})
