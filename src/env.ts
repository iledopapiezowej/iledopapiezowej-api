import dotenv from 'dotenv'

const NODE_ENV = process.env.NODE_ENV,
	dotfile = {
		production: '.env',
		development: '.dev.env',
	}[NODE_ENV ?? 'production']

console.info(`env: ${NODE_ENV}`)

const config = dotenv.config({ path: `./${dotfile}` })

if (config.error) throw `enviroment file ${dotfile} not found`

const env = {
	PORT_API: 2137,
	PORT_WS: 2138,

	MONGO_HOST: '',
	MONGO_PORT: -1,
	MONGO_AUTH: '',
	MONGO_NAME: '',
	MONGO_USER: '',
	MONGO_PASS: '',

	CHAT_ENABLE: false,
	CHAT_MAX_WARNS: 5,
	CHAT_TIMEOUT_DURATION: 30e3,
	CHAT_MAX_NICK: 12,
	CHAT_MAX_MESSAGE: 120,
	CHAT_BURST: 6,
	CHAT_RELEASE: 3e3,
	CHAT_RESERVED: 'local root serwer admin',

	WS_RELEASE: 3e3,
	WS_FLOODING_THRESHOLD: 15,
	WS_MAX_CONCURRENT: 5,
	WS_MAX_PAYLOAD: 1e3,

	COUNT_HYSTERIA: 5,
	COUNT_DELTA: 2e3,

	JWT_SECRET: '',

	RECAPTCHA_SECRET: '',
	DISCORD_APP_ID: '',
	DISCORD_APP_SECRET: '',
	REDIRECT_URI: '',
}

for (let key in env) {
	// @ts-ignore
	process.env[key] && (env[key] = env[key].constructor(process.env[key]))
}

export default env
