export class PeerConnectionManager {
    constructor(config, roomManager) {
        this.config = config;
        this.roomManager = roomManager;
        this.peerConnections = new Map();
        this.onTrackCallback = null;
        this.connectionStateCallbacks = new Map();
        this.connectionStats = new Map();
        this.monitoringIntervals = new Map();
        this._reconnectTimers = new Map();
        this._iceRestartTimers = new Map();
        this._connectionTimeout = 30000;
        this.turnStatusCallback = null;
    }

    setOnTrackCallback(callback) {
        this.onTrackCallback = callback;
    }

    setTurnStatusCallback(callback) {
        this.turnStatusCallback = callback;
    }

    async createConnection(userId) {
        try {
            console.log(`=== Создание нового peer-соединения для ${userId} ===`);
            
            this.closeConnection(userId);

            const pc = new RTCPeerConnection(this.config);
            pc._createdAt = Date.now();
            
            setTimeout(() => {
                if (pc.connectionState !== 'connected') {
                    console.log(`Превышено время ожидания соединения для ${userId}`);
                    this.restartConnection(userId);
                }
            }, this._connectionTimeout);
            
            this._setupConnectionHandlers(pc, userId);
            this.peerConnections.set(userId, pc);
            
            return pc;
        } catch (error) {
            console.error(`Ошибка создания peer connection для ${userId}:`, error);
            return null;
        }
    }

    async _setupConnectionHandlers(pc, userId) {
        pc.ontrack = (event) => {
            console.log(`Получен трек от ${userId}:`, event.track.kind);
            if (this.onTrackCallback) {
                this.onTrackCallback(userId, event);
            }
        };

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                this._handleIceCandidate(userId, candidate, pc);
            }
        };

        pc.oniceconnectionstatechange = () => {
            this._handleIceConnectionStateChange(pc, userId);
        };

        pc.onconnectionstatechange = () => {
            this._handleConnectionStateChange(pc, userId);
        };

        this._startConnectionMonitoring(pc, userId);
    }

    async _startConnectionMonitoring(pc, userId) {
        if (this.monitoringIntervals.has(userId)) {
            clearInterval(this.monitoringIntervals.get(userId));
        }

        const monitoringInterval = setInterval(async () => {
            try {
                const stats = await this._getDetailedConnectionStats(pc);
                this.connectionStats.set(userId, stats);
                
                console.log(`=== Состояние соединения с ${userId} ===`);
                console.log('Базовое состояние:', {
                    connectionState: pc.connectionState,
                    iceConnectionState: pc.iceConnectionState,
                    iceGatheringState: pc.iceGatheringState,
                    signalingState: pc.signalingState
                });
                
                if (stats.currentRoundTripTime > 1000) {
                    console.warn(`Высокая задержка для ${userId}: ${stats.currentRoundTripTime}ms`);
                }
                
                if (stats.packetsLost > 100) {
                    console.warn(`Высокая потеря пакетов для ${userId}: ${stats.packetsLost}`);
                }

                if (stats.video) {
                    console.log('Статистика видео:', {
                        frameWidth: stats.video.frameWidth,
                        frameHeight: stats.video.frameHeight,
                        frameRate: stats.video.framesPerSecond,
                        bitrate: stats.video.bitrate,
                        packetsLost: stats.video.packetsLost,
                        jitter: stats.video.jitter
                    });
                }

            } catch (error) {
                console.error(`Ошибка мониторинга для ${userId}:`, error);
            }
        }, 5000);

        this.monitoringIntervals.set(userId, monitoringInterval);
    }

    async _getDetailedConnectionStats(pc) {
        const stats = await pc.getStats();
        const result = {
            timestamp: Date.now(),
            currentRoundTripTime: 0,
            availableOutgoingBitrate: 0,
            packetsLost: 0,
            video: null,
            selectedCandidate: null
        };

        stats.forEach(stat => {
            if (stat.type === 'candidate-pair' && stat.selected) {
                result.currentRoundTripTime = stat.currentRoundTripTime * 1000;
                result.availableOutgoingBitrate = stat.availableOutgoingBitrate;
                
                result.selectedCandidate = {
                    local: {
                        type: stat.localCandidateType,
                        protocol: stat.localCandidateProtocol,
                        ip: stat.localCandidateIp
                    },
                    remote: {
                        type: stat.remoteCandidateType,
                        protocol: stat.remoteCandidateProtocol,
                        ip: stat.remoteCandidateIp
                    }
                };
            }

            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                result.video = {
                    frameWidth: stat.frameWidth,
                    frameHeight: stat.frameHeight,
                    framesPerSecond: stat.framesPerSecond,
                    framesDropped: stat.framesDropped,
                    packetsLost: stat.packetsLost,
                    jitter: stat.jitter,
                    bitrate: stat.bytesReceived * 8 / (stat.timestamp - result.timestamp)
                };
            }
        });

        return result;
    }

    _handleIceCandidate(userId, candidate, pc) {
        if (!candidate) return;
        
        console.log(`ICE кандидат для ${userId}:`, {
            type: candidate.type,
            protocol: candidate.protocol,
            address: candidate.address,
            port: candidate.port
        });

        this.roomManager.sendWebSocketMessage({
            type: 'video-ice-candidate',
            to: userId,
            candidate
        });
    }
    // Обработка изенения состояния ICE    
    _handleIceConnectionStateChange(pc, userId) {
        const state = pc.iceConnectionState;
        console.log(`ICE состояние для ${userId}:`, state);

        switch(state) {
            case 'new':
                // Если ICE застрял в new, пробуем перезапустить через 5 секунд
                setTimeout(() => {
                    if (pc.iceConnectionState === 'new') {
                        console.log(`ICE для ${userId} застрял в состоянии new`);
                        this._tryIceRestart(pc, userId);
                    }
                }, 5000);
                break;
            
            case 'checking':
                // Если проверка длится более 10 секунд, пробуем перезапустить
                setTimeout(() => {
                    if (pc.iceConnectionState === 'checking') {
                        console.log(`ICE для ${userId} застрял в состоянии checking`);
                        this._tryIceRestart(pc, userId, true);
                    }
                }, 10000);
                break;
            
            case 'disconnected':
                setTimeout(() => {
                    if (pc.iceConnectionState === 'disconnected') {
                        this._tryIceRestart(pc, userId);
                    }
                }, 5000);
                break;
            
            case 'failed':
                this._tryIceRestart(pc, userId, true);
                break;
        }
    }
    // Попытка перезапуска ICE
    async _tryIceRestart(pc, userId, forceFull = false) {
        try {
            if (!forceFull) {
                const offer = await pc.createOffer({ 
                    iceRestart: true,
                    offerToReceiveVideo: true,
                    offerToReceiveAudio: true
                });
                await pc.setLocalDescription(offer);
                
                this.roomManager.sendWebSocketMessage({
                    type: 'video-offer',
                    to: userId,
                    offer
                });
                
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject('timeout'), 5000);
                    
                    const checkState = () => {
                        if (pc.iceConnectionState === 'connected') {
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                    
                    pc.addEventListener('iceconnectionstatechange', checkState, { once: true });
                });
            } else {
                throw new Error('Требуется полное переподключение');
            }
        } catch (error) {
            console.warn(`ICE restart не удался для ${userId}:`, error);
            this.restartConnection(userId);
        }
    }

    _handleConnectionStateChange(pc, userId) {
        console.log(`Состояние соединения для ${userId}:`, pc.connectionState);
        
        switch(pc.connectionState) {
            case 'new':
                // Если соединение остается в new более 5 секунд, пробуем перезапустить
                setTimeout(() => {
                    if (pc.connectionState === 'new') {
                        console.log(`Соединение для ${userId} застряло в состоянии new`);
                        this._tryIceRestart(pc, userId);
                    }
                }, 5000);
                break;
            
            case 'connecting':
                // Если соединение застряло в connecting более 10 секунд, перезапускаем
                setTimeout(() => {
                    if (pc.connectionState === 'connecting') {
                        console.log(`Соединение для ${userId} застряло в состоянии connecting`);
                        this.restartConnection(userId);
                    }
                }, 10000);
                break;
            
            case 'connected':
                console.log(`Соединение установлено для ${userId}`);
                // Очищаем все таймеры
                clearTimeout(this._reconnectTimers.get(userId));
                clearTimeout(this._iceRestartTimers.get(userId));
                this._reconnectTimers.delete(userId);
                this._iceRestartTimers.delete(userId);
                break;
            
            case 'failed':
                console.log(`Соединение для ${userId} failed, пробуем перезапустить`);
                this.restartConnection(userId);
                break;
            
            case 'disconnected':
                // Даем 5 секунд на восстановление, иначе перезапускаем
                setTimeout(() => {
                    if (pc.connectionState === 'disconnected') {
                        console.log(`Соединение для ${userId} осталось в состоянии disconnected`);
                        this.restartConnection(userId);
                    }
                }, 5000);
                break;
        }
    }

    async restartConnection(userId) {
        try {
            const pc = this.peerConnections.get(userId);
            if (!pc) return;

            await new Promise(resolve => setTimeout(resolve, 1000));

            await this.recreateConnection(userId);
            
            const newPc = this.peerConnections.get(userId);
            if (!newPc) {
                throw new Error('Не удалось создать новое соединение');
            }

            const offer = await newPc.createOffer();
            await newPc.setLocalDescription(offer);
            
            this.roomManager.wsManager.send({
                type: 'video-offer',
                to: userId,
                offer
            });
        } catch (error) {
            console.error(`Ошибка перезапуска соединения для ${userId}:`, error);
        }
    }

    async recreateConnection(userId) {
        this.closeConnection(userId);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.createConnection(userId);
    }

    async addTrack(track, stream, userId) {
        try {
            const pc = this.peerConnections.get(userId);
            if (!pc) return;

            const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
            if (sender) {
                await sender.replaceTrack(track);
            } else {
                pc.addTrack(track, stream);
            }
        } catch (error) {
            console.error(`Ошибка при добавлении трека для ${userId}:`, error);
        }
    }

    closeConnection(userId) {
        if (this.monitoringIntervals.has(userId)) {
            clearInterval(this.monitoringIntervals.get(userId));
            this.monitoringIntervals.delete(userId);
        }
        
        this.connectionStats.delete(userId);
        
        const pc = this.peerConnections.get(userId);
        if (pc) {
            pc.getSenders().forEach(sender => {
                if (sender.track) sender.track.stop();
            });
            pc.close();
            this.peerConnections.delete(userId);
        }
    }

    closeAllConnections() {
        for (const userId of this.peerConnections.keys()) {
            this.closeConnection(userId);
        }
    }

    getConnection(userId) {
        return this.peerConnections.get(userId);
    }
    getActiveConnections() {
        const connections = [];
        for (const [userId, pc] of this.peerConnections) {
            connections.push({
                userId,
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                hasLocalTracks: pc.getSenders().length > 0,
                hasRemoteTracks: pc.getReceivers().length > 0
            });
        }
        console.log('=== Активные соединения ===', connections);
        return connections;
    }

    getConnectionQuality(userId) {
        const stats = this.connectionStats.get(userId);
        if (!stats) return 'unknown';

        if (stats.currentRoundTripTime > 1000 || stats.packetsLost > 100) {
            return 'poor';
        } else if (stats.currentRoundTripTime > 500 || stats.packetsLost > 50) {
            return 'fair';
        } else {
            return 'good';
        }
    }

    async getConnectionInfo(userId) {
        const pc = this.peerConnections.get(userId);
        if (!pc) return null;

        const stats = await this._getDetailedConnectionStats(pc);
        const transceivers = pc.getTransceivers();
        
        return {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
            stats: stats,
            tracks: transceivers.map(transceiver => ({
                kind: transceiver.receiver.track?.kind,
                muted: transceiver.receiver.track?.muted,
                enabled: transceiver.receiver.track?.enabled,
                readyState: transceiver.receiver.track?.readyState
            }))
        };
    }

    getActiveConnections() {
        const connections = [];
        for (const [userId, pc] of this.peerConnections) {
            connections.push({
                userId,
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                hasLocalTracks: pc.getSenders().length > 0,
                hasRemoteTracks: pc.getReceivers().length > 0
            });
        }
        console.log('=== Активные соединения ===', connections);
        return connections;
    }

    getAllConnections() {
        return this.peerConnections;
    }
    // Проверка наличия ICE кандидатов
    async checkIceServers() {
        let candidatesFound = {
            host: 0,
            srflx: 0,
            relay: 0
        };

        const testPc = new RTCPeerConnection({
            ...this.config,
            iceTransportPolicy: 'relay'
        });
        
        return new Promise((resolve) => {
            const timeoutDuration = 15000;
            let timeoutId = setTimeout(() => {
                cleanup();
                resolve({ success: false, candidates: candidatesFound });
            }, timeoutDuration);

            const cleanup = () => {
                clearTimeout(timeoutId);
                testPc.close();
            };

            testPc.onicecandidate = (event) => {
                if (event.candidate) {
                    if (event.candidate.type && event.candidate.protocol && event.candidate.address) {
                        candidatesFound[event.candidate.type]++;
                        
                        console.log('Получен ICE кандидат:', {
                            type: event.candidate.type,
                            protocol: event.candidate.protocol,
                            address: event.candidate.address
                        });
                        
                        if (event.candidate.type === 'relay') {
                            cleanup();
                            resolve({ success: true, candidates: candidatesFound });
                        }
                    }
                }
            };

            testPc.onicecandidateerror = (event) => {
                console.error('Ошибка ICE кандидата:', event);
            };

            testPc.onicegatheringstatechange = () => {
                console.log('ICE состояние:', testPc.iceGatheringState);
                if (testPc.iceGatheringState === 'complete') {
                    console.log('Итоги проверки:', candidatesFound);
                    cleanup();
                    resolve({ 
                        success: candidatesFound.relay > 0,
                        candidates: candidatesFound 
                    });
                }
            };

            const dc = testPc.createDataChannel('test');
            testPc.createOffer()
                .then(offer => testPc.setLocalDescription(offer))
                .catch(error => {
                    console.error('Ошибка при создании offer:', error);
                    cleanup();
                    resolve({ success: false, candidates: candidatesFound });
                });
        });
    }

    // Методы отправки сигналов WebRTC
    _sendIceCandidate(userId, candidate) {
        this.roomManager.sendWebSocketMessage({
            type: 'video-ice-candidate',
            to: userId,
            candidate
        });
    }
    // Отправка offer для создания соединения
    _sendOffer(userId, offer) {
        this.roomManager.sendWebSocketMessage({
            type: 'video-offer',
            to: userId,
            offer
        });
    }
    // Отправка ответа на offer
    _sendAnswer(userId, answer) {
        this.roomManager.sendWebSocketMessage({
            type: 'video-answer',
            to: userId,
            answer
        });
    }

    // Проверка и восстановление соединения
    async checkAndRestoreConnection(userId) {
        const pc = this.getConnection(userId);
        if (!pc || pc.iceConnectionState === 'disconnected') {
            console.log('Переподключение для:', userId);
            await this.restartConnection(userId);
        }
    }
    // Обработка offer для создания соединения
    async handleOffer(userId, offer) {
        const pc = await this.createConnection(userId);
        if (!pc) return;
    
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this._sendAnswer(userId, answer);
    }
    // Обработка ответа на offer
    async handleAnswer(userId, answer) {
        const pc = this.getConnection(userId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }
    // Обработка ICE кандидата
    async handleIceCandidate(userId, candidate) {
        const pc = this.getConnection(userId);
        if (!pc) return;
    
        if (!pc.remoteDescription) {
            console.warn('Ожидание remoteDescription перед добавлением ICE кандидата');
            return;
        }
    
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    // Обработчики состояния соединения
    _setupConnectionHandlers(pc, userId) {
        pc.onconnectionstatechange = () => {
            console.log(`Состояние подключения для ${userId}:`, pc.connectionState);
            
            if (pc.connectionState === 'failed') {
                this.restartConnection(userId);
            }
        };

        pc.oniceconnectionstatechange = () => {
            this._handleIceConnectionStateChange(pc, userId);
        };

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                this._handleIceCandidate(userId, candidate, pc);
            }
        };

        pc.ontrack = (event) => {
            console.log(`Получен трек от ${userId}:`, event.track.kind);
            if (this.onTrackCallback) {
                this.onTrackCallback(userId, event);
            }
        };
    }

    async checkTurnServerStatus() {
        try {
            const statusIcon = document.querySelector('.turn-status i');
            if (statusIcon) {
                statusIcon.classList.add('blinking');
            }
            
            const result = await this.checkIceServers();
            
            if (this.turnStatusCallback) {
                this.turnStatusCallback(result);
            }
            
            if (statusIcon) {
                statusIcon.classList.remove('blinking');
            }
            
            return result;
        } catch (error) {
            console.error('Ошибка при проверке TURN сервера:', error);
            return { success: false, candidates: {} };
        }
    }
} 