import { io } from 'socket.io-client';

const socket = io("https://video-chat-app-zcdn.onrender.com");

let localStream;
let peerConnections = new Map();
const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ]
};

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
const roomIdInput = document.getElementById('roomId');
const joinBtn = document.getElementById('joinBtn');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const roomInfo = document.getElementById('roomInfo');
const leaveBtn = document.getElementById('leaveBtn');
const localStatus = document.getElementById('localStatus');
const chatInput = document.getElementById('chatInput');
const sendMessageBtn = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const participantsList = document.getElementById('participantsList');
const remoteVideos = new Map();

let isScreenSharing = false;
let screenStream = null;

const shareScreenBtn = document.getElementById('shareScreen');

// Initial button states
toggleVideoBtn.disabled = true;
toggleAudioBtn.disabled = true;
leaveBtn.disabled = true;
shareScreenBtn.disabled = true;

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

async function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection(config);
    
    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Create video element for this peer
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper';
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'video-status';
    statusDiv.textContent = `User ${userId}`;
    
    const connectionStatus = document.createElement('div');
    connectionStatus.className = 'connection-status';
    connectionStatus.innerHTML = '<i class="fas fa-circle"></i> Connecting...';
    
    videoWrapper.appendChild(video);
    videoWrapper.appendChild(statusDiv);
    videoWrapper.appendChild(connectionStatus);
    remoteVideosContainer.appendChild(videoWrapper);
    
    remoteVideos.set(userId, { video, statusElement: connectionStatus });

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        const remoteVideo = remoteVideos.get(userId).video;
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                roomId: roomIdInput.value,
                candidate: event.candidate,
                toUserId: userId
            });
        }
    };
    
    peerConnection.addEventListener('connectionstatechange', () => {
        const status = remoteVideos.get(userId).statusElement;
        switch(peerConnection.connectionState) {
            case 'connected':
                status.innerHTML = '<i class="fas fa-circle"></i> Connected';
                status.className = 'connection-status status-connected';
                break;
            case 'disconnected':
            case 'failed':
                status.innerHTML = '<i class="fas fa-circle"></i> Connection lost';
                status.className = 'connection-status status-disconnected';
                break;
            case 'closed':
                status.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
                status.className = 'connection-status status-disconnected';
                break;
        }
    });

    peerConnections.set(userId, peerConnection);
    return peerConnection;
}

// Join room
joinBtn.addEventListener('click', async () => {
    const roomId = roomIdInput.value;
    if (!roomId) return;
    
    await setupMediaStream();
    
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

async function toggleScreenSharing() {
    try {
        if (!isScreenSharing) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            
            for (const peerConnection of peerConnections.values()) {
                const senders = peerConnection.getSenders();
                const sender = senders.find(s => s.track?.kind === 'video');
                await sender.replaceTrack(videoTrack);
            }
            
            localVideo.srcObject = screenStream;
            isScreenSharing = true;
            shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i> Stop Sharing';
            shareScreenBtn.classList.add('active');

            videoTrack.onended = async () => {
                await stopScreenSharing();
            };
        } else {
            await stopScreenSharing();
        }
    } catch (error) {
        console.error('Error sharing screen:', error);
    }
}

async function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        const videoTrack = localStream.getVideoTracks()[0];
        for (const peerConnection of peerConnections.values()) {
            const senders = peerConnection.getSenders();
            const sender = senders.find(s => s.track?.kind === 'video');
            await sender.replaceTrack(videoTrack);
        }
        localVideo.srcObject = localStream;
        isScreenSharing = false;
        shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i> Share Screen';
        shareScreenBtn.classList.remove('active');
    }
}

function addChatMessage(message, isLocal = true, senderId = 'You') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isLocal ? 'local' : 'remote'}`;
    messageDiv.innerHTML = `
        <span class="message-sender">${isLocal ? 'You' : `User ${senderId}`}</span>
        <span class="message-content">${message}</span>
        <span class="message-time">${new Date().toLocaleTimeString()}</span>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

leaveBtn.addEventListener('click', () => {
    peerConnections.forEach(connection => connection.close());
    peerConnections.clear();
    
    remoteVideos.forEach(({video}) => video.parentElement.remove());
    remoteVideos.clear();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    
    socket.emit('leave-room', roomIdInput.value);
    
    // Reset UI
    updateStatus(localStatus, 'Disconnected');
    toggleVideoBtn.disabled = true;
    toggleAudioBtn.disabled = true;
    leaveBtn.disabled = true;
    roomInfo.textContent = 'Left the room';
    
    shareScreenBtn.disabled = true;
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    chatMessages.innerHTML = '';
    chatInput.value = '';
});

shareScreenBtn.addEventListener('click', toggleScreenSharing);

sendMessageBtn.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chat-message', {
            roomId: roomIdInput.value,
            message: message
        });
        addChatMessage(message);
        chatInput.value = '';
    }
});

// Socket events
socket.on('user-joined', async (userId) => {
    const peerConnection = await createPeerConnection(userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', {
        roomId: roomIdInput.value,
        offer: offer,
        toUserId: userId
    });
});

socket.on('existing-users', async (users) => {
    for (const userId of users) {
        await createPeerConnection(userId);
    }
});

socket.on('offer', async ({offer, fromUserId}) => {
    let peerConnection = peerConnections.get(fromUserId);
    if (!peerConnection) {
        peerConnection = await createPeerConnection(fromUserId);
    }
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', {
        roomId: roomIdInput.value,
        answer: answer,
        toUserId: fromUserId
    });
});

socket.on('answer', async ({answer, fromUserId}) => {
    const peerConnection = peerConnections.get(fromUserId);
    if (peerConnection) {
        await peerConnection.setRemoteDescription(answer);
    }
});

socket.on('ice-candidate', async ({candidate, fromUserId}) => {
    const peerConnection = peerConnections.get(fromUserId);
    if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
    }
});

socket.on('user-left', (userId) => {
    const remoteVideo = remoteVideos.get(userId);
    if (remoteVideo) {
        remoteVideo.video.parentElement.remove();
        remoteVideos.delete(userId);
    }
    
    const peerConnection = peerConnections.get(userId);
    if (peerConnection) {
        peerConnection.close();
        peerConnections.delete(userId);
    }
});

socket.on('chat-message', ({ message, fromUserId }) => {
    addChatMessage(message, false, fromUserId);
});