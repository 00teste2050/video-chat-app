import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

let localStream;
let peerConnection;
const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ]
};

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const roomIdInput = document.getElementById('roomId');
const joinBtn = document.getElementById('joinBtn');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const roomInfo = document.getElementById('roomInfo');
const leaveBtn = document.getElementById('leaveBtn');
const localStatus = document.getElementById('localStatus');
const remoteStatus = document.getElementById('remoteStatus');

// Initial button states
toggleVideoBtn.disabled = true;
toggleAudioBtn.disabled = true;
leaveBtn.disabled = true;

function updateStatus(element, message, isConnected = false) {
    element.innerHTML = `<i class="fas fa-circle"></i> ${message}`;
    element.className = `connection-status ${isConnected ? 'status-connected' : 'status-disconnected'}`;
}

async function setupMediaStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        
        toggleVideoBtn.disabled = false;
        toggleAudioBtn.disabled = false;
        updateStatus(localStatus, 'Connected', true);
        
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        roomInfo.textContent = 'Error: Could not access camera/microphone';
        updateStatus(localStatus, 'Media access denied');
        return false;
    }
}

function handleTrackToggle(track, button, type) {
    if (track) {
        track.enabled = !track.enabled;
        const icon = type === 'video' ? 'fa-video' : 'fa-microphone';
        const iconOff = type === 'video' ? 'fa-video-slash' : 'fa-microphone-slash';
        button.innerHTML = `<i class="fas ${track.enabled ? icon : iconOff}"></i> ${type} ${track.enabled ? 'On' : 'Off'}`;
        button.className = track.enabled ? '' : 'active';
    }
}

// Initialize WebRTC
async function initializeCall() {
    peerConnection = new RTCPeerConnection(config);
    
    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                roomId: roomIdInput.value,
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.addEventListener('connectionstatechange', () => {
        switch(peerConnection.connectionState) {
            case 'connected':
                updateStatus(remoteStatus, 'Peer connected', true);
                break;
            case 'disconnected':
            case 'failed':
                updateStatus(remoteStatus, 'Connection lost');
                break;
            case 'closed':
                updateStatus(remoteStatus, 'Peer disconnected');
                break;
        }
    });
}

// Join room
joinBtn.addEventListener('click', async () => {
    const roomId = roomIdInput.value;
    if (!roomId) return;
    
    await setupMediaStream();
    await initializeCall();
    
    socket.emit('join-room', roomId);
    roomInfo.textContent = `Connected to room: ${roomId}`;
});

// Toggle video/audio
toggleVideoBtn.addEventListener('click', () => {
    const videoTrack = localStream?.getVideoTracks()[0];
    handleTrackToggle(videoTrack, toggleVideoBtn, 'Video');
});

toggleAudioBtn.addEventListener('click', () => {
    const audioTrack = localStream?.getAudioTracks()[0];
    handleTrackToggle(audioTrack, toggleAudioBtn, 'Audio');
});

leaveBtn.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    socket.emit('leave-room', roomIdInput.value);
    
    // Reset UI
    updateStatus(localStatus, 'Disconnected');
    updateStatus(remoteStatus, 'Waiting for peer...');
    toggleVideoBtn.disabled = true;
    toggleAudioBtn.disabled = true;
    leaveBtn.disabled = true;
    roomInfo.textContent = 'Left the room';
});

// Socket events
socket.on('user-joined', async () => {
    updateStatus(remoteStatus, 'Peer connected', true);
    leaveBtn.disabled = false;
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', {
        roomId: roomIdInput.value,
        offer: offer
    });
});

socket.on('offer', async (offer) => {
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', {
        roomId: roomIdInput.value,
        answer: answer
    });
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(answer);
});

socket.on('ice-candidate', async (candidate) => {
    await peerConnection.addIceCandidate(candidate);
});

socket.on('user-left', () => {
    updateStatus(remoteStatus, 'Peer disconnected');
    remoteVideo.srcObject = null;
});