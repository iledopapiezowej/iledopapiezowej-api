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
	PORT: 2137,

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

	COUNT_DELTA: 2e3,
	RECAPTCHA_SECRET: '',
}

for (let key in env) {
	// @ts-ignore
	process.env[key] && (env[key] = env[key].constructor(process.env[key]))
}

export default env
