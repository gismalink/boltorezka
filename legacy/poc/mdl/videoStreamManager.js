import { ICE_CONFIG } from './config/iceConfig.js';

export class VideoStreamManager {
    static ICE_CONFIG = ICE_CONFIG;

    constructor(roomManager, cameraManager, peerConnectionManager = null) {
        this.roomManager = roomManager;
        this.cameraManager = cameraManager;
        
        this.peerConnectionManager = peerConnectionManager || 
            new PeerConnectionManager(VideoStreamManager.ICE_CONFIG, roomManager);
            
        this.localStream = null;            
        this.videoEnabled = false;     
        
        this.peerConnectionManager.setOnTrackCallback((userId, event) => {
            if (event.streams && event.streams[0]) {
                this.onStreamCallback?.(userId, event.streams[0]);
            }
        });
        
        this.wsManager = roomManager.wsManager;
    }     

    async setStreamCallback(callback) {
        this.onStreamCallback = async (userId, stream) => {
            if (!stream) {
                console.warn('Получен пустой поток для', userId);
                return;
            }

            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = true;
                
                videoTrack.addEventListener('mute', () => {
                    console.warn(`Видео трек ${userId} заглушен, активируем...`);
                    videoTrack.enabled = true;
                });

                const settings = videoTrack.getSettings();
                console.log(`Настройки трека для ${userId}:`, settings);

                await new Promise(resolve => {
                    if (videoTrack.readyState === 'live') {
                        resolve();
                    } else {
                        videoTrack.addEventListener('unmute', resolve, { once: true });
                    }
                });
            }
            callback(userId, stream);
        };
    }

    async createPeerConnection(userId) {
        const pc = await this.peerConnectionManager.createConnection(userId);
        if (pc && this.videoEnabled && this.localStream) {
            await this._attachLocalStreamToPeer(pc);
            await this.peerConnectionManager._sendOffer(userId, await pc.createOffer());
        }
        return pc;
    }

    async _attachLocalStreamToPeer(pc) {
        if (!this.localStream) return;
        
        const tracks = this.localStream.getTracks();
        for (const track of tracks) {
            await this.peerConnectionManager.addTrack(track, this.localStream, pc);
        }
    }

    async toggleVideo(deviceId) {
        try {
            if (!this.videoEnabled) {
                const stream = await this.cameraManager.getVideoStream(deviceId);
                await this._initializeLocalStream(stream);
                this.videoEnabled = true;
            } else {
                this.stopLocalVideo();
                this.videoEnabled = false;
            }
            
            this._notifyDeviceStatus();
            return true;
        } catch (error) {
            console.error('Ошибка переключения видео:', error);
            this.videoEnabled = false;
            return false;
        }
    }

    _notifyDeviceStatus() {
        const currentStatus = this.roomManager.getCurrentDeviceStatus();
        this.roomManager.sendDeviceStatus({
            ...currentStatus,
            video: this.videoEnabled
        });
    }

    async _initializeLocalStream(stream) {
        if (!stream) return false;
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 20 },
                    facingMode: 'user'
                },
                audio: false
            };
            
            try {
                await videoTrack.applyConstraints(constraints);
            } catch (e) {
                console.warn('Не удалось применить ограничения:', e);
            }
            
            videoTrack.enabled = true;
        }
        
        this.localStream = stream;
        this._updateLocalStreamUI(stream);
        
        return true;
    }

    _updateLocalStreamUI(stream) {
        this.onStreamCallback?.('local', stream);
        
        if (!stream) {
            console.log('Локальный поток отключен');
            return;
        }
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            console.log('Состояние видео трека:', {
                enabled: videoTrack.enabled,
                readyState: videoTrack.readyState,
                muted: videoTrack.muted,
                settings: videoTrack.getSettings()
            });

            if (!videoTrack.enabled) {
                videoTrack.enabled = true;
            }
        }
    }

    stopLocalVideo() {
        if (!this.localStream) return;
        
        this._updateLocalStreamUI(null);
        
        this.localStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Трек ${track.kind} остановлен`);
        });
        
        this.localStream = null;
    }

    async updateVideoSettings(settings) {
        await this.cameraManager.updateVideoSettings(settings);
        if (this.videoEnabled) {
            await this.restartVideo();
        }
    }

    async restartVideo() {
        if (!this.videoEnabled) return;
        
        const currentDeviceId = this.cameraManager.getSelectedCamera();
        this.stopLocalVideo();
        const newStream = await this.cameraManager.getVideoStream(currentDeviceId);
        await this._initializeLocalStream(newStream);
    }

    getLocalStream() {
        return this.localStream;
    }

    async initializeVideo(deviceId) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            });
            
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                console.log('Настройки видео:', videoTrack.getSettings());
                videoTrack.enabled = true;
            }
            
            return stream;
        } catch (error) {
            console.error('Ошибка инициализации видео:', error);
            throw error;
        }
    }

    async optimizeVideoTrack(track) {
        try {
            const constraints = {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            };
            
            await track.applyConstraints(constraints);
            return true;
        } catch (error) {
            console.warn('Не удалось оптимизировать видеотрек:', error);
            return false;
        }
    }

    handleIncomingVideoStream(stream, userId) {
        if (!stream) {
            console.warn('Получен пустой видеопоток');
            return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = true;
            
            videoTrack.addEventListener('ended', () => {
                console.log(`Видеотрек ��т ${userId} завершен`);
            });
            
            videoTrack.addEventListener('mute', () => {
                console.warn(`Видеотрек ${userId} заглушен`);
                videoTrack.enabled = true;
            });
        }

        this.onStreamCallback?.(userId, stream);
    }

    clearStreams() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.onStreamCallback) {
            this.onStreamCallback(null, null);
        }
        
        this.videoEnabled = false;
    }
} 