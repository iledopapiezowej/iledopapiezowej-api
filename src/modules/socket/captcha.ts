import env from '../../env.js'

import got from 'got'

import Client, { inload, module, outload } from '../../Client.js'
import logger from '../../log.js'

//
type payloadCaptcha = outload & {
	action: string
}
//

const log = logger.child({ module: 'captcha' })

const { RECAPTCHA_SECRET } = env

export type captchaResult = {
	success: boolean // whether this request was a valid reCAPTCHA token for your site
	score?: number // the score for this request (0.0 - 1.0)
	action?: string // the action name for this request (important to verify)
	challenge_ts?: string // timestamp of the challenge load (ISO format yyyy-MM-dd'T'HH:mm:ssZZ)
	hostname?: string // the hostname of the site where the reCAPTCHA was solved
	'error-codes'?: any
}

function requestCaptcha(
	client: Client,
	action = 'general'
): Promise<captchaResult> {
	return captcha.send(client, action).catch((err) => {
		log.info({ id: client.id, ip: client.ip, action, err }, `captcha failed`)
		return { success: false }
	})
}

async function verifyCaptcha(
	client: Client,
	token: string
): Promise<captchaResult> {
	let body = <captchaResult>await got
		.post('https://www.google.com/recaptcha/api/siteverify', {
			searchParams: {
				secret: RECAPTCHA_SECRET,
				response: token,
				remoteip: client.ip,
			},
		})
		.json()
		.catch((err: Error) => {
			log.debug(err, `captcha err`)
			return {
				success: false,
				score: 0,
			}
		})

	client.captcha.status = {
		...client.captcha.status,
		...body,
	}

	log.debug({ id: client.id, ip: client.ip, data: body }, `verified captcha`)

	return client.captcha.status
}

const captcha = {
	label: 'captcha',

	request: requestCaptcha,

	send(client: Client, action = 'general'): Promise<captchaResult> {
		return new Promise((resolve, reject) => {
			client.captcha.await = { resolve, reject }
			client.transmit(
				{
					action,
				} as payloadCaptcha,
				'captcha'
			)

			setTimeout(() => {
				reject(`Request timed out`)
			}, 3e3)
		})
	},

	receive(client: Client, { token }: inload) {
		if (client.captcha.await) {
			client.captcha.await.resolve(verifyCaptcha(client, token))
		}
	},
}

export default captcha as module
