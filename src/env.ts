import dotenv from 'dotenv'

const NODE_ENV = process.env.NODE_ENV,
	// @ts-ignore
	dotfile = {
		production: '.env',
		development: '.dev.env',
	}[NODE_ENV ?? 'production']

console.info(`env: ${NODE_ENV}`)

const config = dotenv.config({ path: `./${dotfile}` })

if (config.error) throw `enviroment file ${dotfile} not found`

const env = {
	PORT_API: 5501,
	PORT_WS: 5502,

	MONGO_HOST: '',
	MONGO_PORT: -1,
	MONGO_AUTH: '',
	MONGO_NAME: '',
	MONGO_USER: '',
	MONGO_PASS: '',

	MAX_CONCURRENT: 5,

	CHAT_ENABLE: true,
	CHAT_MAX_WARNS: 5,
	CHAT_TIMEOUT_DURATION: 30e3,
	CHAT_MAX_NICK: 12,
	CHAT_MAX_MESSAGE: 120,
	CHAT_BURST: 3,
	CHAT_RELEASE: 3,
	CHAT_RESERVED: 'local root serwer admin',

	COUNT_HYSTERIA: 2,

	RECAPTCHA_SECRET: '',
}

for (let key in env) {
	// @ts-ignore
	process.env[key] && (env[key] = process.env[key])
}

export default env
