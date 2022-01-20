import axios from 'axios'
import logger from '../../log.js'

const log = logger.child({ module: 'captcha' })

const { RECAPTCHA_SECRET } = process.env

function requestCaptcha(client, action = 'general') {
	return captcha.send(client, action).catch((err) => {
		log.info({ id: client.id, ip: client.ip, action, err }, `captcha failed`)
		return { success: false }
	})
}

// TODO: replace axios with got
async function verifyCaptcha(client, token) {
	let { data } = await axios.post(
		'https://www.google.com/recaptcha/api/siteverify',
		undefined,
		{
			params: {
				secret: RECAPTCHA_SECRET,
				response: token,
				remoteip: client.ip,
			},
		}
	)

	client.captchaStatus = {
		...client.captchaStatus,
		...data,
	}

	log.debug({ id: client.id, ip: client.ip, data }, `verified captcha`)

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
