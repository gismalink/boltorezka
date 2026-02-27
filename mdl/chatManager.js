// Менеджер чата, отвечающий за обработку сообщений и управление состоянием чата
export class ChatManager {
    // Инициализация менеджера чата с привязкой к менеджеру комнат
    constructor(roomManager) {
        this.roomManager = roomManager;
        this.messages = new Map();          // Хранилище сообщений по комнатам
        this.currentRoom = null;            // Текущая активная комната
        this.onMessagesUpdate = null;       // Callback для обновления UI
        this.chatElement = null;            // DOM элемент чата
        this.newMessage = '';               // Текст нового сообщения
        this.username = roomManager.username;
        this.wsManager = roomManager.wsManager;
        this.typingTimeout = null;
        
        // Привязываем обработчик сообщений к текущему контексту
        this.roomManager.setChatMessageHandler(this.handleMessage.bind(this));
    }

    // Создает объект сообщения с заданными параметрами
    _createMessage(room, text, username, timestamp = Date.now()) {
        if (!username) {
            console.warn('Попытка создать сообщение без имени пользователя');
            username = 'Аноним';
        }
        return {
            type: 'chat-message',
            room,
            message: text.trim(),
            username,
            timestamp
        };
    }

    // Создает массив сообщений для комнаты, если он не существует
    _ensureRoomExists(room) {
        if (!this.messages.has(room)) {
            this.messages.set(room, []);
        }
    }

    // Обновляет UI и прокручивает чат вниз
    _updateMessages(messages) {
        if (!this.onMessagesUpdate) {
            return;
        }
        this.onMessagesUpdate(messages);
        this.scrollToBottom();
    }

    // Устанавливает DOM элемент чата для управления скроллом
    setChatElement(element) {
        this.chatElement = element;
    }

    // Прокручивает чат к последнему сообщению
    scrollToBottom() {
        if (this.chatElement) {
            setTimeout(() => {
                this.chatElement.scrollTop = this.chatElement.scrollHeight;
            }, 0);
        }
    }

    // Устанавливает callback для обновления UI при изменении сообщений
    setMessagesUpdateCallback(callback) {
        this.onMessagesUpdate = callback;
        if (this.currentRoom) {
            callback(this.getCurrentMessages());
        }
    }

    // Обрабатывает входящее сообщение и обновляет UI
    handleMessage(message) {
        const { room, sender, message: text, timestamp } = message;
        if (!room || !text) {
            // console.warn('Получено некорректное сообщение:', message);
            return;
        }
        
        this._ensureRoomExists(room);
        
        const formattedMessage = this._createMessage(room, text, sender, timestamp);
        this.messages.get(room).push(formattedMessage);

        if (room === this.currentRoom) {
            this._updateMessages(this.getCurrentMessages());
            this.scrollToBottom();
        }
    }

    // Отправляет сообщение в указанную комнату через WebSocket
    sendMessageToRoom(room, text, username) {
        if (!text?.trim() || !room) {
            return null;
        }
        
        const message = this._createMessage(room, text, username);
        this.wsManager.send({
            type: 'chat-message',
            ...message
        });
        return message;
    }

    // Обрабатывает вход пользователя в комнату
    handleRoomJoin(roomName) {
        this.currentRoom = roomName;
        this.username = this.roomManager.username;
        this._ensureRoomExists(roomName);
        this._updateMessages(this.getCurrentMessages());
    }

    // Обрабатывает выход пользователя из комнаты
    handleRoomExit(roomName) {
        this.clearState(roomName);
        this._updateMessages([]);
    }

    // Возвращает массив сообщений текущей комнаты
    getCurrentMessages() {
        if (!this.currentRoom) {
            return [];
        }
        return this.messages.get(this.currentRoom) || [];
    }

    // Очищает состояние комнаты при выходе
    clearState(room) {
        this.messages.delete(room);
        this.currentRoom = null;
        this.newMessage = '';
    }

    // Обрабатывает ввод нового сообщения с debounce
    handleInput(event) {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        this.typingTimeout = setTimeout(() => {
            this.newMessage = event.target.value;
        }, 100); // Задержка в 100мс
    }

    // Возвращает текст текущего сообщения
    getNewMessage() {
        return this.newMessage;
    }

    // Очищает поле ввода сообщения
    clearNewMessage() {
        this.newMessage = '';
    }

    // Проверяет, принадлежит ли сообщение текущему пользователю
    isOwnMessage(message) {
        if (!message) {
            return false;
        }
        return message.username === this.username;
    }

    // Устанавливает имя текущего пользователя
    setUsername(username) {
        this.username = username;
    }

    // Отправляет новое сообщение в текущую комнату
    sendMessage() {
        if (!this.currentRoom || !this.newMessage) {
            return;
        }

        const message = this.sendMessageToRoom(
            this.currentRoom,
            this.newMessage,
            this.username
        );

        if (message) {
            this.clearNewMessage();
            if (this.typingTimeout) {
                clearTimeout(this.typingTimeout);
            }
        }
    }

    formatMessageTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }
}