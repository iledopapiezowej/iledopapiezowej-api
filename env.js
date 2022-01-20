import dotenv from 'dotenv'

const env = process.env.NODE_ENV,
	dotfile = {
		production: '.env',
		development: '.dev.env',
	}[env ?? 'production']

console.info(`env: ${env}`)

const config = dotenv.config({ path: `./${dotfile}` })

if (config.error) throw `enviroment file ${dotfile} not found`

export default config
