import env from '../env.js'
import logger from '../log.js'

import fetch from 'node-fetch'

import Client, { inload, module, outload } from '../Client.js'

type payloadCaptcha = outload & {
	action: string
}

const { RECAPTCHA_SECRET } = env

const log = logger.child({ module: 'captcha' })

export type captchaResult = {
	success: boolean // whether this request was a valid reCAPTCHA token for your site
	score?: number // the score for this request (0.0 - 1.0)
	action?: string // the action name for this request (important to verify)
	challenge_ts?: string // timestamp of the challenge load (ISO format yyyy-MM-dd'T'HH:mm:ssZZ)
	hostname?: string // the hostname of the site where the reCAPTCHA was solved
	'error-codes'?: any
}

async function verifyCaptcha(
	client: Client,
	token: string
): Promise<captchaResult> {
	const body = new URLSearchParams()
	body.append('secret', RECAPTCHA_SECRET)
	body.append('response', token)
	body.append('remoteip', client.ip)

	const response = await fetch(
		'https://www.google.com/recaptcha/api/siteverify',
		{
			method: 'POST',
			body,
		}
	)

	const data = <captchaResult>await response.json().catch((err: Error) => {
		log.debug(err, `captcha err`)
		return {
			success: false,
			score: 0,
		}
	})

	client.captcha.status = {
		...client.captcha.status,
		...data,
	}

	log.debug({ id: client.id, ip: client.ip, data }, `verified captcha`)

	return client.captcha.status
}

const captcha: module = {
	label: 'captcha',

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

export default captcha
