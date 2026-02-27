// Импорт необходимых менеджеров для работы с различными функциями приложения
import { AudioManager } from './mdl/audioManager.js';
import { RoomManager } from './mdl/roomManager.js';
import { RTCManager } from './mdl/rtcManager.js';
import { ChatManager } from './mdl/chatManager.js';
import { VideoStreamManager } from './mdl/videoStreamManager.js';
import { CameraManager } from './mdl/cameraManager.js';
import { PeerConnectionManager } from './mdl/PeerConnectionManager.js';
import { ICE_CONFIG } from './mdl/config/iceConfig.js';

// Создание Vue приложения
const { createApp } = Vue;
// Настройка Vue приложения
createApp({
    data() {
        return {
            rooms: {},                           // Список комнат
            currentRoom: null,                   // Текущая комната    
            audioManager: null,                  // Менеджер аудио
            roomManager: null,                   // Менеджер комнат
            rtcManager: null,                    // Менеджер RTC
            chatManager: null,                   // Менеджер чата
            videoManager: null,                  // Менеджер видео
            cameraManager: null,                 // Менеджер камеры
            devices: {
                inputs: [],                      // Устройства ввода
                outputs: []                      // Устройства вывода
            },
            selectedMicrophone: '',              // Выбранный микрофон
            selectedSpeaker: '',                 // Выбранный динамик
            microphoneVolume: 50,                // Громкость микрофона
            currentVolume: 0,                    // Текущая громкость
            outputVolume: 50,                    // Громкость динамика
            username: null,                      // Имя пользователя
            videoStreams: new Map(),             // Потоки видео
            localVideoStream: null,              // Локальный видеопоток
            videoEnabled: false,                 // Включено ли видео
            selectedCamera: '',                  // Выбранная камера
            videoDevices: [],                    // Устройства видео
            videoQuality: 'medium',              // Качество видео
            facingMode: 'user',                  // Режим камеры
            frameRate: 30,                       // Частота кадров
            messages: [],                        // Сообщения
            peerConnectionManager: null,         // Менеджер подключений
            turnServerActive: false,              // Активен ли TURN сервер
            iceConnectionState: 'new',           // Состояние ICE
            iceStats: null,                      // Статистика ICE
        }
    },

    // Вычисляемые свойства
    computed: {
        microphone() {
            return this.audioManager?.getStatus().mic || false;
        },
        audioOutput() {
            return this.audioManager?.getStatus().headphones || false;
        },
        volumeColor() {
            if (this.currentVolume < 30) return '#4CAF50';
            if (this.currentVolume < 80) return '#FFC107';
            return '#F44336';
        },
    },

    // Монтирование приложения
    async mounted() {
        await this.waitForUsername();
        await this.initializeManagers();
        await this.loadDevices();
        
        this.$nextTick(() => {
            this.chatManager.setChatElement(this.$refs.chatMessages);
        });
    
        // Устанавливаем callback для обновления статуса TURN
        this.peerConnectionManager.setTurnStatusCallback((result) => {
            this.turnServerActive = result.success;
            this.iceStats = result.candidates;
            console.log('Найдены ICE кандидаты:', result.candidates);
        });
    
        // Проверяем статус TURN сервера каждые 30 секунд
        this.peerConnectionManager.checkTurnServerStatus();
        setInterval(() => {
            this.peerConnectionManager.checkTurnServerStatus();
        }, 30000);
    },

    // Методы приложения
    methods: {
        // Генерация случайного гостя
        getRandomGuestName() {
            const adjectives = [
                'Happy', 'Sleepy', 'Swift', 'Quiet', 'Nimble',
                'Wise', 'Kind', 'Brave', 'Agile', 'Playful',
                'Dreamy', 'Cheerful', 'Shy', 'Clever', 'Gentle',
                'Fluffy', 'Cozy', 'Silly', 'Jolly', 'Friendly'
            ];
            
            const animals = [
                'Kitty', 'Puppy', 'Fox', 'Bear', 'Bunny',
                'Hedgehog', 'Wolf', 'Squirrel', 'Tiger', 'Lion',
                'Raccoon', 'Panda', 'Hamster', 'Koala', 'Penguin',
                'Owl', 'Deer', 'Lemur', 'Badger', 'Otter'
            ];

            const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
            const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
            
            return `${randomAdjective}_${randomAnimal}`;
        },

        // Ожидание имени пользователя
        async waitForUsername() {
            return new Promise(resolve => {
                // Если имя уже есть в header.js
                const headerContainer = document.querySelector('#auth-info-container');
                if (headerContainer && headerContainer.__vue_app__?._instance?.data?.username) {
                    this.username = headerContainer.__vue_app__._instance.data.username;
                    resolve();
                    return;
                }

                // Ждем событие загрузки имени
                const handleUsernameLoaded = (event) => {
                    this.username = event.detail.username;
                    window.removeEventListener('usernameLoaded', handleUsernameLoaded);
                    resolve();
                };
                window.addEventListener('usernameLoaded', handleUsernameLoaded);

                // Таймаут для неавторизованных пользователей
                setTimeout(() => {
                    if (!this.username) {
                        this.username = this.getRandomGuestName();
                        resolve();
                    }
                }, 1000);
            });
        },

        // Обработка аудиопотока
        handleAudioStream(stream, userId) {
            console.log('Получен аудиопоток от пользователя:', userId);
            const audioElement = new Audio();
            audioElement.srcObject = stream;
            audioElement.autoplay = true;
            audioElement.play().catch(error => {
                console.error('Ошибка воспроизведения:', error);
            });
        },

        // Инициализация менеджеров
        async initializeManagers() {
            // Создаем peerConnectionManager первым
            this.peerConnectionManager = new PeerConnectionManager(ICE_CONFIG, this.roomManager);
            
            // Создаем roomManager
            this.roomManager = new RoomManager(this.handleRoomUpdate, this.handleVoiceData);

            // Создаем остальные менеджеры с передачей peerConnectionManager
            this.cameraManager = new CameraManager();
            this.videoManager = new VideoStreamManager(this.roomManager, this.cameraManager, this.peerConnectionManager);
            this.rtcManager = new RTCManager(this.handleTrack, this.roomManager, this.peerConnectionManager);
            this.audioManager = new AudioManager(this.roomManager);
            this.chatManager = new ChatManager(this.roomManager);

            // Устанавливаем менеджеры в RoomManager
            this.roomManager.setManagers({
                rtcManager: this.rtcManager,
                videoManager: this.videoManager,
                peerConnectionManager: this.peerConnectionManager,
                chatManager: this.chatManager,
                audioManager: this.audioManager,
                cameraManager: this.cameraManager
            });

            // Настраиваем колбэки
            this.setupCallbacks();

            // Добавляем мониторинг ICE состояния
            setInterval(() => {
                this.checkIceState();
            }, 5000);
        },

        // Обработка обновления комнат
        handleRoomUpdate(rooms) {
            this.rooms = rooms;
        },

        // Обработка аудиоданных
        handleVoiceData(data) {
            this.audioManager.playAudioData(data);
        },

        // Загрузка устройств
        async loadDevices() {
            const audioDevices = await this.audioManager.getDevices();
            this.devices.inputs = audioDevices.inputs;
            this.devices.outputs = audioDevices.outputs;
            
            this.videoDevices = await this.cameraManager.loadDevices();
            this.selectedCamera = this.cameraManager.getSelectedCamera();
        },

        // Смена микрофона
        async changeMicrophone() {
            try {
                if (this.microphone) {
                    await this.toggleMicrophone(); // Выключаем текущий микрофон
                }
                if (this.selectedMicrophone) {
                    const success = await this.audioManager.toggleMicrophone(this.selectedMicrophone);
                    if (success) {
                        this.sendDeviceStatus();
                    }
                }
            } catch (error) {
                console.error('Ошибка при смене микрофона:', error);
            }
        },

        // Смена динамика
        async changeSpeaker() {
            if (this.selectedSpeaker) {
                const audioElements = document.querySelectorAll('audio');
                for (const element of audioElements) {
                    await this.audioManager.setAudioOutput(this.selectedSpeaker, element);
                }
            }
        },

        // Обработка входа в комнату
        handleRoomJoin(roomName) {
            this.currentRoom = roomName; // Сначала устанавливаем currentRoom
            this.roomManager.handleRoomJoin(roomName, this.username);
            if (!this.audioOutput) {
                this.toggleSound();
            }
        },

        // Вход в комнату
        joinRoom(roomNumber) {
            this.handleRoomJoin(roomNumber);
        },

        // Переключение микрофона
        async toggleMicrophone() {
            await this.audioManager.toggleMicrophone();
            this.sendDeviceStatus();
        },

        // Переключение звука
        toggleSound() {
            const result = this.audioManager.toggleSound();
            if (result) {
                // Устанавливаем начальную громкость при включении
                this.audioManager.setOutputVolume(this.outputVolume);
            }
            this.sendDeviceStatus();
        },

        // Отправка статуса устройств
        sendDeviceStatus() {
            const status = {
                mic: this.audioManager?.getStatus().mic || false,
                headphones: this.audioManager?.getStatus().headphones || false,
                video: this.videoEnabled || false,
                username: this.username
            };
            this.roomManager.sendDeviceStatus(status);
        },

        // Обновление громкости микрофона
        updateMicrophoneVolume() {
            this.audioManager.setMicrophoneVolume(this.microphoneVolume);
        },

        // Обновление громкости динамика
        updateOutputVolume() {
            this.audioManager.setOutputVolume(this.outputVolume);
        },

        // Переключение видео
        async toggleVideo() {
            try {
                console.log('Начинаем переключение видео');
                const result = await this.videoManager.toggleVideo(this.selectedCamera);
                console.log('Результат переключения видео:', result);
                
                if (result) {
                    this.videoEnabled = !this.videoEnabled;
                    if (this.videoEnabled) {
                        this.localVideoStream = this.videoManager.getLocalStream();
                        console.log('Локальный стрим установлен:', this.localVideoStream);
                    } else {
                        this.localVideoStream = null;
                    }
                    this.sendDeviceStatus();
                }
            } catch (error) {
                console.error('Ошибка при переключении видео:', error);
            }
        },

        // Выход из комнаты
        leaveRoom() {
            if (this.currentRoom) {
                const roomToLeave = this.currentRoom;
                this.currentRoom = null; // Сначала очищаем currentRoom
                this.roomManager.handleRoomExit(roomToLeave);
                this.videoEnabled = false;
            }
        },

        // Обработка клика по комнате
        handleRoomClick(roomName) {
            if (this.currentRoom === roomName) return;
            
            this.currentRoom = roomName;
            this.roomManager.handleRoomJoin(roomName, this.username);
            
            if (this.audioManager) {
                if (!this.audioOutput) {
                    this.toggleSound();
                }
                this.sendDeviceStatus();
            }
        },

        // Обработка клика по выходу из комнаты
        handleExitClick(event, roomName) {
            event.stopPropagation();
            this.roomManager.handleRoomExit(roomName);
            this.currentRoom = null;
            this.videoEnabled = false;
        },

        // Обработка изменения камеры
        async handleCameraChange() {
            if (this.videoEnabled) {
                await this.cameraManager.setSelectedCamera(this.selectedCamera);
                await this.videoManager.restartVideo();
            }
        },

        // Обновление качества видео
        async updateVideoQuality() {
            await this.cameraManager.updateVideoSettings({
                quality: this.videoQuality
            });
            if (this.videoEnabled) {
                await this.videoManager.restartVideo();
            }
        },

        // Обновление режима камеры
        async updateFacingMode() {
            await this.cameraManager.updateVideoSettings({
                facingMode: this.facingMode
            });
            if (this.videoEnabled) {
                await this.videoManager.restartVideo();
            }
        },

        // Обновление частоты кадров
        async updateFrameRate() {
            await this.cameraManager.updateVideoSettings({
                frameRate: parseInt(this.frameRate)
            });
            if (this.videoEnabled) {
                await this.videoManager.restartVideo();
            }
        },

        // Отправка сообщения
        sendMessage() {
            this.chatManager.sendMessage();
        },

        // Настройка колбэков
        setupCallbacks() {
            if (this.audioManager) {
                this.audioManager.setVolumeCallback((volume) => {
                    this.currentVolume = volume;
                });
            }

            if (this.videoManager) {
                this.videoManager.setStreamCallback((userId, stream) => {
                    console.log('Получен видеопоток от:', userId, stream);
                    this.$nextTick(() => {
                        if (stream) {
                            this.videoStreams.set(userId, stream);
                            if (userId === 'local') {
                                this.localVideoStream = stream;
                            }
                        } else {
                            this.videoStreams.delete(userId);
                            if (userId === 'local') {
                                this.localVideoStream = null;
                            }
                        }
                    });
                });
            }

            if (this.chatManager) {
                this.chatManager.setMessagesUpdateCallback((messages) => {
                    console.log('Обновление сообщений в Vue:', messages);
                    this.messages = [...messages];
                });
            }
        },

        // Логирование метаданных видео
        logVideoMetadata(event, userId) {
            const video = event.target;
            console.log(`Видео для ${userId} загружено:`, {
                width: video.videoWidth,
                height: video.videoHeight,
                readyState: video.readyState,
                paused: video.paused,
                currentTime: video.currentTime,
                srcObject: video.srcObject
            });
            
            // Добавляем обработку состояния readyState
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA или выше
                video.play().catch(err => {
                    console.error(`Ошибка автовоспроизведения для ${userId}:`, err);
                    // Пробуем воспроизвести после взаимодействия пользователя
                    const playPromise = () => {
                        video.play().catch(console.error);
                        document.removeEventListener('click', playPromise);
                    };
                    document.addEventListener('click', playPromise);
                });
            }
        },

        // Обеспечение воспроизведения видео
        ensureVideoPlayback(userId) {
            const videoRef = this.$refs[`video-${userId}`];
            if (videoRef && videoRef[0]) {
                const video = videoRef[0];
                
                // Проверяем и обновляем srcObject если нужно
                const expectedStream = userId === 'local' ? this.localVideoStream : this.videoStreams.get(userId);
                if (video.srcObject !== expectedStream) {
                    video.srcObject = expectedStream;
                }

                // Добавляем обработчики для мониторинга состояния
                const handleVideoState = () => {
                    console.log(`Состояние видео ${userId}:`, {
                        readyState: video.readyState,
                        paused: video.paused,
                        videoWidth: video.videoWidth,
                        videoHeight: video.videoHeight,
                        currentTime: video.currentTime
                    });

                    if (video.paused && video.readyState >= 2) {
                        video.play().catch(err => {
                            console.error(`Ошибка воспроизведения для ${userId}:`, err);
                            // Пробуем перезапустить видео элемент
                            video.load();
                            video.play().catch(console.error);
                        });
                    }
                };

                // Добавляем слушатели событий
                video.addEventListener('loadedmetadata', handleVideoState);
                video.addEventListener('pause', handleVideoState);
                video.addEventListener('stalled', handleVideoState);
                video.addEventListener('suspend', handleVideoState);

                // Принудительно устанавливаем параметры воспроизведения
                video.playsInline = true;
                video.autoplay = true;
                video.muted = userId === 'local'; // Локальное видео всегда без звука
                
                // Пробуем воспроизвести
                handleVideoState();
            }
        },

        // Логирование ошибок видео
        logVideoError(event, userId) {
            console.error(`Ошибка видео для ${userId}:`, event.target.error);
        },

        // Логирование состояния видеопотока
        logStreamState(user) {
            console.log('Состояние видеопотока:', {
                userId: user.ip,
                isLocal: user.ip === 'local',
                hasLocalStream: !!this.localVideoStream,
                hasRemoteStream: !!this.videoStreams.get(user.ip),
                streamObject: user.ip === 'local' ? 
                    this.localVideoStream : 
                    this.videoStreams.get(user.ip)
            });
        },

        // Получение отладочной информации о потоке
        getStreamDebugInfo(user) {
            const stream = user.ip === 'local' ? 
                this.localVideoStream : 
                this.videoStreams.get(user.ip);
                
            return stream ? 
                `Stream: ${stream.active ? 'active' : 'inactive'}, Tracks: ${stream.getTracks().length}` : 
                'No stream';
        },

        // Отображение видео
        showVideo(user) {
            const stream = this.getVideoStream(user);
            const hasStream = !!stream;
            console.log(`Проверка отображения видео для ${user.ip}:`, {
                hasStream,
                isActive: stream?.active,
                trackCount: stream?.getTracks().length
            });
            return hasStream && stream.active;
        },

        // Полуение видеопотка
        getVideoStream(user) {
            const stream = user.ip === 'local' ? this.localVideoStream : this.videoStreams.get(user.ip);
            if (stream) {
                console.log(`Поток для ${user.ip}:`, {
                    active: stream.active,
                    tracks: stream.getTracks().map(t => ({
                        kind: t.kind,
                        enabled: t.enabled,
                        readyState: t.readyState
                    }))
                });
            }
            return stream;
        },

        checkIceState() {
            if (this.peerConnectionManager) {
                const connections = this.peerConnectionManager.getAllConnections();
                let worstState = 'connected';
                
                for (const [userId, pc] of connections) {
                    const state = pc.iceConnectionState;
                    if (state === 'failed') {
                        worstState = 'failed';
                        break;
                    } else if (state === 'disconnected' && worstState !== 'failed') {
                        worstState = 'disconnected';
                    } else if (state === 'checking' && worstState === 'connected') {
                        worstState = 'checking';
                    }
                }
                
                this.iceConnectionState = worstState;
            }
        },
    },

    // Наблюдение за изменениями
    watch: {
        // Наблюдение за изменениями видеопотоков
        'videoStreams': {
            handler(newStreams) {
                newStreams.forEach((stream, userId) => {
                    this.$nextTick(() => {
                        this.ensureVideoPlayback(userId);
                    });
                });
            },
            deep: true
        },

        // Наблюдение за локальным видеопотоком
        'localVideoStream'(newStream) {
            if (newStream) {
                this.$nextTick(() => {
                    this.ensureVideoPlayback('local');
                });
            }
        }
    }
}).mount('#app'); 