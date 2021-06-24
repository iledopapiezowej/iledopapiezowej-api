import dotenv from 'dotenv'
dotenv.config()

var Settings = {
    wsPort: process.env.PORT_WS ?? 5502,
    apiPort: process.env.PORT_API ?? 5501,
    maxWarns: 5,
    timeoutDuration: 30e3,
    nickLimit: 12,
    burst: process.env.CHAT_BURST ?? 3,
    maxConcurrent: process.env.MAX_CONCURRENT ?? 15,
    hysteria: process.env.HYSTERIA ?? 5,
    release: process.env.CHAT_RELEASE ?? 0.8,
    messageMax: process.env.CHAT_MESSAGE ?? 120,
    reservedNicks: [
        'mathias',
        'malina',
        'admin',
        'serwer',
        'root',
        'local'
    ]
}

export default Settings