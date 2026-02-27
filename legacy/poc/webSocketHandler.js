const WebSocket = require('ws');

module.exports = (wss) => {
    const rooms = {
        'Kitchen': new Map(),
        'Bedroom': new Map(),
        'Living_Room': new Map(),
        'Bathroom': new Map(),
        'Office': new Map(),
        'Balcony': new Map(),
        'Basement': new Map()
    };

    const iceServers = {
        iceServers: [{
            urls: [
                'stun:gismalink.art:3478',
                'turn:gismalink.art:3478',
                'turns:gismalink.art:5349'
            ],
            username: 'boltorezka',
            credential: 'Blt@Turn2024#Secure',
            credentialType: 'password'
        }],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 0
    };

    wss.on('connection', (ws, req) => {
        if (req.url === '/ws') {
            const userIP = req.socket.remoteAddress;
            console.log(`Новое подключение от ${userIP} на пути /ws`);

            let currentRoom = null;
            let username = null;

            // Отправляем список комнат новому клиенту
            sendRoomsToClient(ws);

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    console.log('Получено сообщение:', message);

                    switch (message.type) {
                        case 'rtc-offer':
                            if (message.to && rooms[currentRoom]) {
                                rooms[currentRoom].forEach((userData, client) => {
                                    if (userData.ip === message.to) {
                                        const offerMessage = JSON.stringify({
                                            type: 'rtc-offer',
                                            offer: message.offer,
                                            from: userIP
                                        });
                                        client.send(offerMessage);
                                    }
                                });
                            }
                            break;

                        case 'rtc-answer':
                            if (message.to && rooms[currentRoom]) {
                                rooms[currentRoom].forEach((userData, client) => {
                                    if (userData.ip === message.to) {
                                        const answerMessage = JSON.stringify({type: 'rtc-answer', answer: message.answer, from: userIP});
                                        client.send(answerMessage);
                                    }
                                });
                            }
                            break;

                        case 'ice-candidate':
                            // console.log('ICE кандидат получен:', {from: userIP, to: message.to, candidateType: message.candidate.type, candidateProtocol: message.candidate.protocol, timestamp: new Date().toISOString()});
                            if (message.to && rooms[currentRoom]) {
                                const targetClient = Array.from(rooms[currentRoom]).find(
                                    ([_, userData]) => userData.ip === message.to
                                )?.[0];

                                if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                                    const candidateMessage = JSON.stringify({
                                        type: 'ice-candidate',
                                        candidate: message.candidate,
                                        from: userIP
                                    });
                                    targetClient.send(candidateMessage);
                                    console.log(`ICE кандидат отправлен от ${userIP} к ${message.to}`);
                                } else {
                                    console.warn(`Клиент ${message.to} не найден или не готов к приему`);
                                }
                            }
                            break;

                        case 'joinRoom':
                            const roomNumber = message.room;
                            if (rooms[roomNumber]) {
                                if (currentRoom) {
                                    rooms[currentRoom].delete(ws);
                                }
                                currentRoom = roomNumber;
                                rooms[currentRoom].set(ws, {
                                    ip: userIP,
                                    username: message.username || 'unnamed',
                                    mic: false,
                                    headphones: false,
                                    speaking: false
                                });
                                broadcastAllRooms();
                                // console.log(`Пользователь ${userIP} присоединился к комнате ${roomNumber}`);

                                // Оповещаем других пользователей о новом участнике
                                rooms[roomNumber].forEach((userData, client) => {
                                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            type: 'user-joined',
                                            userId: userIP
                                        }));
                                    }
                                });
                            }
                            break;

                        case 'voiceData' && currentRoom:
                            broadcastToRoom(currentRoom, data, ws);
                            break;

                        case 'deviceStatus':
                            if (currentRoom && rooms[currentRoom].has(ws)) {
                                const userData = rooms[currentRoom].get(ws);
                                rooms[currentRoom].set(ws, {
                                    ...userData,
                                    mic: message.mic,
                                    headphones: message.headphones,
                                    username: message.username || 'unnamed',
                                    speaking: message.speaking
                                });
                                broadcastAllRooms();
                            }
                            break;

                        case 'chat-message':
                            if (currentRoom && rooms[currentRoom]) {
                                rooms[currentRoom].forEach((userData, client) => {
                                    if (client.readyState === WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            type: 'chat-message',
                                            room: currentRoom,
                                            message: message.message,
                                            sender: message.username,
                                            timestamp: Date.now()
                                        }));
                                    }
                                });
                            }
                            break;

                        case 'leaveRoom':
                            if (currentRoom && rooms[currentRoom]) {
                                console.log(`Пользователь ${userIP} покидает комнату ${currentRoom}`);
                                rooms[currentRoom].delete(ws);
                                
                                // Оповещаем остальных пользователей о выходе
                                rooms[currentRoom].forEach((userData, client) => {
                                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            type: 'user-left',
                                            userId: userIP
                                        }));
                                    }
                                });

                                currentRoom = null;
                                broadcastAllRooms(); // Обновлм список комнат для всех
                            }
                            break;

                        case 'video-stream-ready':
                            console.log(`Пользователь ${userIP} готов к видеосвязи`);
                            if (currentRoom) {
                                console.log(`Отправка запроса на video-offer всем пользователям в комнате ${currentRoom}`);
                                rooms[currentRoom].forEach((userData, client) => {
                                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                                        console.log(`Отправка запроса пользователю ${userData.ip}`);
                                        client.send(JSON.stringify({
                                            type: 'request-video-offer',
                                            from: userIP
                                        }));
                                    }
                                });
                            }
                            break;
                    }
                } catch (error) {
                    console.error('Ошибка обработки сообщения:', error);
                }
            });

            ws.on('close', () => {
                console.log(`Клиент ${userIP} отключился`);
                if (currentRoom && rooms[currentRoom]) {
                    rooms[currentRoom].delete(ws);
                    
                    // Оповещаем остальных пользователей о выходе
                    rooms[currentRoom].forEach((userData, client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({type: 'user-left', userId: userIP}));
                        }
                    });
                    
                    broadcastAllRooms();
                }
            });

            ws.on('error', (error) => {
                console.error(`Ошибка WebSocket от ${userIP}:`, error);
                if (currentRoom) {
                    rooms[currentRoom].delete(ws);
                    broadcastAllRooms();
                }
            });

            ws.send(JSON.stringify({
                type: 'ice-config',
                config: iceServers
            }));
        } else {
            ws.close();
        }
    });

    // Функция для отправки списка комнат конкретному клиенту
    function sendRoomsToClient(ws) {
        const roomsData = {};
        Object.keys(rooms).forEach(roomName => {
            roomsData[roomName] = Array.from(rooms[roomName].values());
        });
        const message = JSON.stringify({ type: 'userList', rooms: roomsData });
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);   
        }
        console.log('Отправлен список комнат клиенту:', roomsData);
    }

    // Функция для рассылки всем клиентам
    function broadcastAllRooms() {
        const roomsData = {};
        Object.keys(rooms).forEach(roomName => {
            roomsData[roomName] = Array.from(rooms[roomName].values());
        });
        
        const message = JSON.stringify({ type: 'userList', rooms: roomsData });
        
        console.log('Рассылка обновленного списка комнат:', roomsData);
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) { client.send(message); }
        });
    }

    // Функция для отправки данных всем пользователям в конкретной комнате
    function broadcastToRoom(roomName, data, sender) {
        if (rooms[roomName]) {
            rooms[roomName].forEach((userData, client) => {
                if (client !== sender && client.readyState === WebSocket.OPEN) {
                    client.send(data);
                }
            });
        }
    }

    console.log('WebSocket сервер запущен');
};
