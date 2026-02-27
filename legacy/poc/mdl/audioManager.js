export class AudioManager {
    constructor() {
        // Базовая конфигурация для микрофона
        this.DEFAULT_MIC_CONFIG = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        // Настройки анализатора по умолчанию
        this.ANALYSER_CONFIG = {
            fftSize: 256,
            smoothingTimeConstant: 0.8
        };

        // Основные аудио-компоненты
        this.mediaStream = null;            // Поток с микрофона
        this.audioContext = null;           // Аудио контекст для обработки звука
        this.microphone = null;             // Источник звука микрофона
        this.gainNode = null;               // Узел управления громкостью микрофона
        this.analyserNode = null;           // Узел для анализа звука
        this.audioOutput = null;            // Выход на наушники/колонки
        this.outputGainNode = null;         // Узел управления громкостью выхода

        // Список доступных устройств
        this.devices = {
            inputs: [],                     // Микрофоны
            outputs: []                     // Наушники/колонки
        };

        // Состояние анализатора звука
        this.volumeCallback = null;         // Функция обратного вызова для уровня громкости
        this.isAnalyzing = false;           // Флаг активности анализатора
    }

    setVolumeCallback(callback) {
        this.volumeCallback = callback;
    }

    async requestPermissions() {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            return true;
        } catch (error) {
            console.error('Ошибка при запросе разрешений:', error);
            return false;
        }
    }

    async getDevices() {
        try {
            let devices = await navigator.mediaDevices.enumerateDevices();
            
            if (devices.some(device => !device.label)) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(track => track.stop());
                    devices = await navigator.mediaDevices.enumerateDevices();
                } catch (error) {
                    console.log('Не удалось получить разрешения:', error);
                }
            }
            
            this.devices.inputs = devices
                .filter(device => device.kind === 'audioinput')
                .map(device => ({
                    deviceId: device.deviceId,
                    label: device.label || `Микрофон ${device.deviceId.slice(0, 5)}...`,
                    groupId: device.groupId
                }));
                
            this.devices.outputs = devices
                .filter(device => device.kind === 'audiooutput')
                .map(device => ({
                    deviceId: device.deviceId,
                    label: device.label || `Динамики ${device.deviceId.slice(0, 5)}...`,
                    groupId: device.groupId
                }));

            return this.devices;
        } catch (error) {
            console.error('Ошибка при получении списка устройств:', error);
            return { inputs: [], outputs: [] };
        }
    }

    // Инициализация аудио контекста с проверкой поддержки браузером
    async initAudioContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                await this.audioContext.resume();
                return true;
            } catch (error) {
                console.error('Ошибка инициализации аудио контекста:', error);
                return false;
            }
        }
        return true;
    }

    // Метод очистки ресурсов
    cleanup() {
        this.stopAnalyzing();
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        if (this.analyserNode) {
            this.analyserNode.disconnect();
            this.analyserNode = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }

    async toggleMicrophone(deviceId = null) {
        if (this.microphone) {
            this.cleanup();
            return false;
        }

        try {
            // Настройки микрофона с шумоподавлением
            const constraints = {
                audio: deviceId ? 
                    { deviceId: { exact: deviceId }, ...this.DEFAULT_MIC_CONFIG } : 
                    this.DEFAULT_MIC_CONFIG
            };

            // Получаем поток с микрофона
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (!await this.initAudioContext()) {
                return false;
            }
            
            // Создаем и настраиваем аудио узлы
            await this.setupAudioNodes();
            
            this.startAnalyzing();
            return true;
        } catch (error) {
            console.error('Ошибка при получении доступа к микрофону:', error);
            this.cleanup();
            return false;
        }
    }

    // Вынесенная логика настройки аудио узлов
    async setupAudioNodes() {
        this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.gainNode = this.audioContext.createGain();
        this.analyserNode = this.audioContext.createAnalyser();
        
        // Применяем настройки анализатора
        Object.assign(this.analyserNode, this.ANALYSER_CONFIG);
        
        // Соединяем узлы обработки
        this.microphone.connect(this.gainNode);
        this.gainNode.connect(this.analyserNode);
    }

    // Оптимизированный метод анализа звука
    startAnalyzing() {
        if (!this.analyserNode || this.isAnalyzing) return;

        this.isAnalyzing = true;
        const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
        let animationFrame;

        const analyze = () => {
            if (!this.isAnalyzing) {
                cancelAnimationFrame(animationFrame);
                return;
            }

            this.analyserNode.getByteFrequencyData(dataArray);
            const volume = this.calculateVolume(dataArray);
            
            if (this.volumeCallback) {
                this.volumeCallback(volume);
            }

            animationFrame = requestAnimationFrame(analyze);
        };

        analyze();
    }

    // Вынесенный расчет громкости
    calculateVolume(dataArray) {
        const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
        return Math.round((average / 255) * 100);
    }

    stopAnalyzing() {
        this.isAnalyzing = false;
    }

    async setAudioOutput(deviceId, element) {
        if (element && typeof element.setSinkId === 'function') {
            try {
                await element.setSinkId(deviceId);
                return true;
            } catch (error) {
                console.error('Ошибка при изменении аудиовыхода:', error);
                return false;
            }
        }
        return false;
    }

    toggleSound() {
        if (this.audioOutput) {
            // Отключаем выход
            if (this.audioContext) {
                this.audioContext.suspend();
            }
            this.audioOutput = null;
            this.outputGainNode = null;
            return false;
        }

        // Включаем выход
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
        } else {
            this.audioContext.resume();
        }
        
        // Создаем цепочку для выходного звука
        this.outputGainNode = this.audioContext.createGain();
        this.audioOutput = this.audioContext.createGain();
        
        this.outputGainNode.connect(this.audioOutput);
        this.audioOutput.connect(this.audioContext.destination);
        return true;
    }

    // Вспомогательные методы для управления громкостью
    setMicrophoneVolume(value) {
        if (this.gainNode) {
            this.gainNode.gain.value = value / 50; // Преобразуем 0-100 в 0-2
        }
    }

    setOutputVolume(value) {
        if (this.outputGainNode) {
            this.outputGainNode.gain.value = value / 50; // Преобразуем 0-100 в 0-2
        }
    }

    // Возвращает текущий статус устройств
    getStatus() {
        return {
            mic: !!this.microphone,
            headphones: !!this.audioOutput
        };
    }
} 