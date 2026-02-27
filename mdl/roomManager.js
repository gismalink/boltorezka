import { WebSocketMessageManager } from './webSocketMessageManager.js';

export class RoomManager {
    constructor(onRoomUpdate = null, onVoiceData = null) {
        this.managers = {
            rtc: null,
            video: null,
            chat: null,
            audio: null,
            camera: null,
            peerConnection: null
        };
        
        this.onRoomUpdate = onRoomUpdate || (() => {});
        this.onVoiceData = onVoiceData || (() => {});
        this.currentRoom = null;
        this.chatMessageHandler = null;
        this.username = null;
        this.onRoomStateChange = null;
        
        this.wsManager = new WebSocketMessageManager();
        this.initializeWebSocket();
        this.setupMessageHandlers();
    }

    initializeWebSocket() {
        this.wsManager.initialize('wss://gismalink.art/ws');
    }
    // Регистрация обработчиков сообщений
    setupMessageHandlers() {
        // Обработка списка пользователей в комнате
        this.wsManager.registerHandler('userList', (message) => {
            if (typeof this.onRoomUpdate === 'function') {
                this.onRoomUpdate(message.rooms);
            }
            this.handleUserListUpdate(message.rooms);
        });
        // Обработка offer от пользователя
        this.wsManager.registerHandler('rtc-offer', async (message) => {
            if (this.managers.peerConnection) {
                await this.managers.peerConnection.handleOffer(message.from, message.offer);
            }
        });
        // Обработка answer от пользователя
        this.wsManager.registerHandler('rtc-answer', async (message) => {
            if (this.managers.peerConnection && message.answer) {
                await this.managers.peerConnection.handleAnswer(message.from, message.answer);
            }
        });
        // Обработка ICE кандидата от пользователя  
        this.wsManager.registerHandler('ice-candidate', async (message) => {
            if (this.managers.peerConnection) {
                await this.managers.peerConnection.handleIceCandidate(message.from, message.candidate);
            }
        });
        // Обработка события о присоединении пользователя
        this.wsManager.registerHandler('user-joined', async (message) => {
            if (this.managers.video?.videoEnabled) {
                await this.managers.peerConnection.createConnection(message.userId);
            }
        });
        // Обработка события о покидании пользователя
        this.wsManager.registerHandler('user-left', (message) => {
            if (this.managers.peerConnection) {
                this.managers.peerConnection.closeConnection(message.userId);
            }
        });
        // Обработка video-offer
        this.wsManager.registerHandler('video-offer', async (message) => {
            if (this.managers.peerConnection && this.currentRoom) {
                await this.managers.peerConnection.handleOffer(message.from, message.offer);
            }
        });
        // Обработка video-answer
        this.wsManager.registerHandler('video-answer', async (message) => {
            if (this.managers.peerConnection) {
                await this.managers.peerConnection.handleAnswer(message.from, message.answer);
            }
        });
        // Обработка video-ice-candidate
        this.wsManager.registerHandler('video-ice-candidate', async (message) => {
            if (this.managers.peerConnection) {
                await this.managers.peerConnection.handleIceCandidate(message.from, message.candidate);
            }
        });
        // Обработка сообщения чата (без изменений)
        this.wsManager.registerHandler('chat-message', (message) => {
            if (this.chatMessageHandler) {
                this.chatMessageHandler(message);
            }
        });
        // Обработка запроса video-offer
        this.wsManager.registerHandler('request-video-offer', async (message) => {
            if (this.managers.peerConnection) {
                const pc = await this.managers.peerConnection.createConnection(message.from);
                if (pc) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    this.wsManager.send({
                        type: 'video-offer',
                        to: message.from,
                        offer
                    });
                }
            }
        });
    }

    // Методы установки менеджеров и колбэков
    setManagers({ rtcManager, videoManager, peerConnectionManager, chatManager, audioManager, cameraManager }) {
        if (rtcManager) {
            this.managers.rtc = rtcManager;
            rtcManager.setSendOfferCallback((userId, offer) => 
                this.wsManager.sendRTCOffer(userId, offer));
        }
        if (videoManager) {
            this.managers.video = videoManager;
        }
        if (peerConnectionManager) {
            this.managers.peerConnection = peerConnectionManager;
        }
        if (chatManager) {
            this.managers.chat = chatManager;
        }
        if (audioManager) {
            this.managers.audio = audioManager;
        }
        if (cameraManager) {
            this.managers.camera = cameraManager;
        }
    }

    setChatMessageHandler(handler) {
        this.chatMessageHandler = handler;
    }

    setRoomStateCallback(callback) {
        this.onRoomStateChange = callback;
    }

    // Методы управления комнатами
    handleRoomJoin(roomName, username) {
        if (this.currentRoom === roomName) return;
        
        this.currentRoom = roomName;
        this.username = username;
        
        this.managers.chat?.setUsername(username);
        this.managers.chat?.handleRoomJoin(roomName);
        
        // Очищаем видео стримы при входе в новую комнату
        if (this.managers.video) {
            this.managers.video.clearStreams();
        }
        
        // Закрываем все peer connections
        if (this.managers.peerConnection) {
            this.managers.peerConnection.closeAllConnections();
        }
        
        this.wsManager.send({
            type: 'joinRoom',
            room: roomName,
            username
        });
        
        if (this.onRoomStateChange) {
            this.onRoomStateChange(roomName);
        }
    }

    handleRoomExit(roomName) {
        if (this.currentRoom === roomName) {
            this.wsManager.send({
                type: 'leaveRoom',
                room: roomName
            });
            
            this.clearRoomState(roomName);
            
            if (this.onRoomStateChange) {
                this.onRoomStateChange(null);
            }
        }
    }

    clearRoomState(roomName) {
        this.managers.chat?.handleRoomExit(roomName);
        this.managers.video?.clearStreams();
        this.managers.peerConnection?.closeAllConnections();
        this.currentRoom = null;
    }

    // Вспомогательные методы
    getCurrentRoom() {
        return this.currentRoom;
    }
    // Получение статуса устройства
    getCurrentDeviceStatus() {
        return {
            mic: this.managers.audio?.getStatus()?.mic || false,
            headphones: this.managers.audio?.getStatus()?.headphones || false,
            video: this.managers.video?.videoEnabled || false
        };
    }
    // Отправка статуса устройства
    sendDeviceStatus(status) {
        this.wsManager.sendDeviceStatus(status, this.username);
    }
    // Отправка статуса о готовности видео потока
    notifyVideoStreamReady() {
        if (this.currentRoom) {
            this.wsManager.sendVideoStreamReady();
        }
    }

    handleUserListUpdate(users) {
        if (this.managers.video) {
            console.log('Обновление списка пользователей в RoomManager');
            this.managers.video.handleUserListUpdate(users);
        }
    }
}