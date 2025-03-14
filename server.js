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

        // Notify all existing users about the new user
        socket.to(roomId).emit('user-joined', socket.id);
        
        // Send list of existing users to the new user
        const usersInRoom = Array.from(rooms.get(roomId)).filter(id => id !== socket.id);
        socket.emit('existing-users', usersInRoom);
    });

    socket.on('offer', ({roomId, offer, toUserId}) => {
        socket.to(toUserId).emit('offer', {
            offer,
            fromUserId: socket.id
        });
    });

    socket.on('answer', ({roomId, answer, toUserId}) => {
        socket.to(toUserId).emit('answer', {
            answer,
            fromUserId: socket.id
        });
    });

    socket.on('ice-candidate', ({roomId, candidate, toUserId}) => {
        socket.to(toUserId).emit('ice-candidate', {
            candidate,
            fromUserId: socket.id
        });
    });

    socket.on('chat-message', ({roomId, message}) => {
        socket.to(roomId).emit('chat-message', {
            message: message,
            fromUserId: socket.id
        });
    });

    socket.on('leave-room', (roomId) => {
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
            socket.to(roomId).emit('user-left', socket.id);
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
                socket.to(roomId).emit('user-left', socket.id);
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});