export class WebSocketMessageManager {
    constructor() {
        this.socket = null;
        this.messageHandlers = new Map();
        this.isConnected = false;
    }

    initialize(url) {
        this.socket = new WebSocket(url);
        
        this.socket.onopen = () => {
            this.isConnected = true;
            //console.log('WebSocket соединение установлено');
        };

        this.socket.onclose = () => {
            this.isConnected = false;
            //console.log('WebSocket соединение закрыто');
        };

        this.socket.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                //console.log('WebSocket сообщение получено:', message);
                await this.handleMessage(message);
            } catch (error) {
                //console.error('Ошибка обработки WebSocket сообщения:', error);
            }
        };
    }

    registerHandler(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
    }

    async handleMessage(message) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            await handler(message);
        }
    }

    send(message) {
        if (this.isConnected) {
            //console.log('Отправка WebSocket сообщения:', message);
            this.socket.send(JSON.stringify(message));
        } else {
            //console.warn('Попытка отправить сообщение при закрытом соединении:', message);
        }
    }

    // Методы-обертки для различных типов сообщений
    sendRTCOffer(userId, offer) {
        this.send({
            type: 'rtc-offer',
            to: userId,
            offer
        });
    }

    sendRTCAnswer(userId, answer) {
        if (!answer) {
            //console.warn('Попытка отправить пустой answer');
            return;
        }
        this.send({
            type: 'rtc-answer',
            to: userId,
            answer
        });
    }

    sendIceCandidate(userId, candidate) {
        this.send({
            type: 'ice-candidate',
            to: userId,
            candidate
        });
    }

    sendDeviceStatus(status, username) {
        this.send({
            type: 'deviceStatus',
            ...status,
            username: username || 'unnamed'
        });
    }

    sendVideoStreamReady() {
        this.send({
            type: 'video-stream-ready'
        });
    }

    sendVideoIceCandidate(userId, candidate) {
        this.send({
            type: 'video-ice-candidate',
            to: userId,
            candidate
        });
    }

    close() {
        if (this.socket) {
            this.socket.close();
        }
    }
} 