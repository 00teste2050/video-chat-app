const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify other user in the room
        socket.to(roomId).emit('user-joined');
    });

    socket.on('offer', ({roomId, offer}) => {
        socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', ({roomId, answer}) => {
        socket.to(roomId).emit('answer', answer);
    });

    socket.on('ice-candidate', ({roomId, candidate}) => {
        socket.to(roomId).emit('ice-candidate', candidate);
    });

    socket.on('leave-room', (roomId) => {
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
            socket.to(roomId).emit('user-left');
            socket.leave(roomId);
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((users, roomId) => {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                if (users.size === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});