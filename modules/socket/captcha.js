import got from 'got'
import logger from '../../log.js'

const log = logger.child({ module: 'captcha' })

const { RECAPTCHA_SECRET } = process.env

function requestCaptcha(client, action = 'general') {
	return captcha.send(client, action).catch((err) => {
		log.info({ id: client.id, ip: client.ip, action, err }, `captcha failed`)
		return { success: false }
	})
}

async function verifyCaptcha(client, token) {
	let body = await got
		.post('https://www.google.com/recaptcha/api/siteverify', {
			searchParams: {
				secret: RECAPTCHA_SECRET,
				response: token,
				remoteip: client.ip,
			},
		})
		.catch((err) => {
			log.debug(err, `captcha err`)
			return {
				success: false,
				score: 0,
			}
		})
		.json()

	client.captchaStatus = {
		...client.captchaStatus,
		...body,
	}

	log.debug({ id: client.id, ip: client.ip, data: body }, `verified captcha`)

	return client.captchaStatus
}

const captcha = {
	label: 'captcha',

	request: requestCaptcha,

	send(client, action = 'general') {
		return new Promise((resolve, reject) => {
			client.transmit({
				type: 'captcha',
				action,
			})
			client.awaitCaptcha = { resolve, reject }

			setTimeout(() => {
				reject(`Request timed out`)
			}, 3e3)
		})
	},

	receive(client, { token }) {
		if (client.awaitCaptcha) {
			client.awaitCaptcha.resolve(verifyCaptcha(client, token))
		}
	},
}

export default captcha
