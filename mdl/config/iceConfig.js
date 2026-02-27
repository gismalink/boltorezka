export const ICE_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.l.google.com:5349" },
        { urls: "stun:stun1.l.google.com:3478" },
        { urls: "stun:stun1.l.google.com:5349" }
        // { 
        //     urls: [
        //         'turns:gismalink.art:5349?transport=tcp'
        //     ],
        //     username: 'boltorezka',
        //     credential: 'Blt@Turn2024#Secure',
        //     credentialType: 'password'
        // }
    ],
    iceCandidatePoolSize: 2,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportTimeoutInMillis: 10000,
    iceTcpCandidatePolicy: 'enable'
}; 