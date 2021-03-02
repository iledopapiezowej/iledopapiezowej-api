module.exports = {
    apps: [{
        name: "iledopapiezowej-api",
        script: "./index.js",
        env: {
            NODE_ENV: "development",
            PORT_API: 5501,
            PORT_WS: 5502,
            MAX_CONCURRENT: 5,
            HYSTERIA: 2,
            CHAT_BURST: 3,
            CHAT_RELEASE: 1.5,
            CHAT_MESSAGE: 120
        },
        env_production: {
            NODE_ENV: "production",
            PORT: "4000"
        }
    }]
}