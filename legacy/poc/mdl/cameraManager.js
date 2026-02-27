export class CameraManager {
    constructor() {
        this.videoDevices = [];
        this.selectedCamera = '';
        this.videoSettings = {
            width: 1280,
            height: 720,
            frameRate: 25,
            aspectRatio: 1.777777778,
            facingMode: 'user',
            quality: 'high'
        };
    }

    async loadDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            if (this.videoDevices.length > 0 && !this.selectedCamera) {
                this.selectedCamera = this.videoDevices[0].deviceId;
            }
            
            return this.videoDevices;
        } catch (error) {
            console.error('Ошибка при получении списка устройств:', error);
            return [];
        }
    }

    async getVideoStream(deviceId) {
        const constraints = this.getVideoConstraints(deviceId);
        return await navigator.mediaDevices.getUserMedia({ video: constraints });
    }

    getVideoConstraints(deviceId) {
        return {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: this.videoSettings.width },
            height: { ideal: this.videoSettings.height },
            frameRate: { ideal: this.videoSettings.frameRate },
            aspectRatio: { ideal: this.videoSettings.aspectRatio },
            facingMode: this.videoSettings.facingMode
        };
    }

    async updateVideoSettings(settings) {
        this.videoSettings = { ...this.videoSettings, ...settings };
    }

    getVideoDevices() {
        return this.videoDevices;
    }

    getSelectedCamera() {
        return this.selectedCamera;
    }

    setSelectedCamera(deviceId) {
        this.selectedCamera = deviceId;
    }
} 