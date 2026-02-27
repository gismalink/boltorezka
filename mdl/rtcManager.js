// Импорт конфига ICE   
import { ICE_CONFIG } from './config/iceConfig.js';

// Класс RTCManager
export class RTCManager {
    constructor(onTrack, roomManager, peerConnectionManager = null) {
        this.peerConnectionManager = peerConnectionManager || 
            new PeerConnectionManager(ICE_CONFIG, roomManager);
        
        this.localStream = null;
        this.audioContexts = new Map();
        this.onSpeakingChange = null;
        this.onTrack = onTrack;
        this.wsManager = roomManager.wsManager;
        
        this.peerConnectionManager.setOnTrackCallback((userId, event) => {
            this.handleTrack(event, userId);
        });
    }

    // Установка колбэка на изменение состояния говорящего  
    setSpeakingCallback(callback) {
        this.onSpeakingChange = callback;
    }

    // Инициализация локального стрима  
    async initLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 48000,
                    sampleSize: 16,
                }
            });
            return true;
        } catch (error) {
            console.error('Ошибка при получении доступа к микрофону:', error);
            return false;
        }
    }

    // Создание peer connection
    async createPeerConnection(remoteUserId) {
        const pc = await this.peerConnectionManager.createConnection(remoteUserId);
        if (pc && this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnectionManager.addTrack(track, this.localStream, remoteUserId);
            });
        }
        return pc;
    }    

    async initiateCall(remoteUserId) {
        try {
            console.log(`Инициация вызова для ${remoteUserId}`);
            
            const peerConnection = await this.createPeerConnection(remoteUserId);
            if (!peerConnection) {
                console.error('Не удалось создать peer connection');
                return null;
            }

            console.log('Создаем offer');
            const offer = await peerConnection.createOffer();
            
            console.log('Устанавливаем local description (offer)');
            await peerConnection.setLocalDescription(offer);
            
            return offer;
        } catch (error) {
            console.error('Ошибка при инициации вызова:', error);
            return null;
        }
    }

    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    async handleTrack(event, remoteUserId) {
        try {
            console.log('Received remote track:', event);
            
            if (event.track.kind === 'video') {
                const stream = new MediaStream([event.track]);
                if (this.onTrack) {
                    this.onTrack(stream, remoteUserId);
                }
                return;
            }
            
            // Для аудио треков
            const stream = new MediaStream([event.track]);
            
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let speaking = false;
            
            const checkAudioLevel = () => {
                if (!this.audioContexts.has(remoteUserId)) return;
                
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
                const isSpeakingNow = average > 30;
                
                if (speaking !== isSpeakingNow) {
                    speaking = isSpeakingNow;
                    console.log(`User ${remoteUserId} speaking state changed to: ${isSpeakingNow}`);
                    if (this.onSpeakingChange) {
                        this.onSpeakingChange(remoteUserId, speaking);
                    }
                }
                
                requestAnimationFrame(checkAudioLevel);
            };
            
            // Закрываем предыдущий аудиоконтекст, если он существует
            const existingContext = this.audioContexts.get(remoteUserId);
            if (existingContext) {
                existingContext.context.close();
            }
            
            this.audioContexts.set(remoteUserId, { 
                context: audioContext, 
                analyser,
                stream 
            });
            
            checkAudioLevel();
            
            // Вызываем callback с новым стримом
            if (this.onTrack) {
                this.onTrack(stream, remoteUserId);
            }
        } catch (error) {
            console.error('Ошибка при обработке трека:', error);
        }
    }

    // Добавляем метод для установки callback отправки offer
    setSendOfferCallback(callback) {
        this.sendRTCOffer = callback;
    }
} 