const RELAY_BASE_URL = "https://relay.komodo-dev.library.illinois.edu/"
// const RELAY_BASE_URL = "http://localhost:3000/"

// connect to socket.io relay server
var socket = io(RELAY_BASE_URL);

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



// ids and teacher flag passed to Unity
var session_id = Number(params.session);
var client_id = Number(params.client);
var isTeacher = Number(params.teacher) || 0;
var playback_id = Number(params.playback);

// Assets
// empty assets object to be populated and passed to Unity
// object required because Unity cannot deserialize raw Arrays, they
// have to be inside structs... 
// See commented out asset object for example
var assets = { 
    list: [
        // {
        //     id: 12345,
        //     name: "Test Asset Name",
        //     url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/2CylinderEngine/glTF-Embedded/2CylinderEngine.gltf",
        //     scale: 1
        // }
    ] 
};
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
        asset.id = assets_response[idx].asset_id;
        asset.name = assets_response[idx].asset_name;
        asset.url = assets_response[idx].path;
        asset.scale = assets_response[idx].scale || 1;
        asset.isWholeObject = Boolean(assets_response[idx].is_whole_object);
        assets.list.push(asset);
    }
    console.log("Retrieved assets:", JSON.stringify(assets));
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

socket.on('joined', function(client_id) {
    console.log('client joined session:', client_id);
});


// text chat relay
var chat = io(RELAY_BASE_URL + 'chat');
chat.emit("join", joinIds);

// TODO(rob): wait on UnityProgress == 1
chat.on('micText', function(data) {
    console.log('micText:', data);
    gameInstance.SendMessage("Instantiation Manager", 'Text_Refresh', JSON.stringify(data));
})
