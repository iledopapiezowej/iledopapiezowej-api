import levenshtein from 'js-levenshtein'
import logger from '../../log.js'

import Connections from '../../Connections.js'
import captcha from './captcha.js'

const log = logger.child({ socket: 'chat' })

const {
	CHAT_BURST,
	CHAT_MAX_MESSAGE,
	CHAT_MAX_NICK,
	CHAT_RESERVED = '',
	CHAT_MAX_WARNS,
} = process.env

const cachedMessages = []

function send(client, message) {
	// discard
	// ip banned
	if (Connections.bans[client.ip]) {
		feedback(
			client,
			`Trzeba było nie spamić (timeout do ${client.timedOut
				.toTimeString()
				.slice(0, 8)})`
		)
	}

	// ws timed out
	if (new Date() < client.timedOut) {
		feedback(
			client,
			`Trzeba było nie spamić (timeout do ${client.timedOut
				.toTimeString()
				.slice(0, 8)})`
		)
		return false
	}

	// discard and warn
	// too fast messages
	if (client.burstCount == CHAT_BURST) {
		warn(client, 'Zwolnij')
	}

	if (client.burstCount > CHAT_BURST) {
		warn(client, 'Za dużo wiadomości')
		return false
	}

	// discard
	// content too long or too short
	if (message.length > CHAT_MAX_MESSAGE || message.length < 1) {
		feedback(client, 'Wiadomość musi zawierać od 1 do 120 znaków')
		return false
	}

	// discard and warn
	// repetitive spam
	// if (this.latestMessages.indexOf(message) != -1) {
	//     this.warn("Może coś nowego napisz")
	//     return false
	// }

	// keep latest sent messages
	client.latestMessages.push(message)
	if (client.latestMessages.length > 3) client.latestMessages.shift()

	let l = {
			ab: levenshtein(client.latestMessages[0], client.latestMessages[1]),
			ac: levenshtein(client.latestMessages[0], client.latestMessages[2]),
			bc: levenshtein(client.latestMessages[1], client.latestMessages[2]),
		},
		avg = {
			ab:
				(client.latestMessages[0].length + client.latestMessages[1].length) / 2,
			ac:
				(client.latestMessages[0].length + client.latestMessages[2].length) / 2,
			bc:
				(client.latestMessages[1].length + client.latestMessages[2].length) / 2,
		},
		calc = {
			ab: l.ab / avg.ab,
			ac: l.ac / avg.ac,
			bc: l.bc / avg.bc,
		}

	client.messageOffsetAvg = ((calc.ab + calc.ac + calc.bc) / 3).toFixed(2)
	client.messageOffsetMin = Math.min(calc.ab, calc.ac, calc.bc).toFixed(2)

	// discard and warn
	// spam
	if (client.messageOffsetAvg <= 0.66) {
		warn(client, 'we we nie spam')
		return true
	}

	// discard and warn
	// blacklisted words
	if (
		new RegExp(['http', '://', '\\.com', '\\.gg', '\\.pl'].join('|')).test(
			message
		)
	) {
		warn(client, 'Nie wolno tak')
		return false
	}

	// discard and warn
	// repetetive characters
	// if(data.content.replace(new RegExp(data.content[Math.floor(Math.random() * (data.content.length))], 'g'), "").length < (data.content.length * 0.1))
	// {
	//     Sockets.warn(ws, `repetetive character`)
	//     return
	// }

	// discard and warn
	// blacklisted characters
	// if (/[^\x00-\x7Fążśźęćń€łóĄŻŚŹĘĆŃÓŁ]/.test(data.content)) {
	//     Sockets.warn(ws, `blacklist character`)
	//     return
	// }

	let payload = {
		nick: client.nick,
		role: client.role,
		uid: client.id,
		content: message,
		time: new Date(),
	}

	// Connections.cacheMessage(payload)
	Connections.broadcast('chat', payload)

	return true
}

function command(client, arg) {
	switch (arg[0]) {
		case 'nick':
			if (typeof arg[1] != 'string') return false
			if (arg[1].length > CHAT_MAX_NICK || arg[1].length < 1) {
				// invalid nick length
				feedback(client, `Nick musi mieć między 1 a ${CHAT_MAX_NICK} znaków`)
				return false
			} else if (
				new RegExp(CHAT_RESERVED.split(' ').join('|'), 'i').test(arg[1])
			) {
				// reserved nick
				feedback(client, 'Nie możesz użyć tego nicku')
				return false
			} else if (/[^\x00-\x7Fążśźęćń€łóĄŻŚŹĘĆŃÓŁ]/.test(arg[1])) {
				// invalid character
				feedback(client, `Nick nie może zawierać znaków specjalnych`)
				return false
			} else {
				if (Connections.nick(client, arg[1])) {
					feedback(client, `Zmieniono nick na '${arg[1]}'`)
					return true
				} else {
					feedback(client, 'Ten nick jest zajęty')
					return false
				}
			}

		case 'login':
			if (process.env[`pwd_${arg[1]}`])
				if (arg[2] === process.env[`pwd_${arg[1]}`]) {
					Connections.nick(client, arg[1])
					client.role = 'owner'
					feedback(client, `Zalogowano jako ${arg[1]}`)
					return true
				}
			arg[2] = '***'
			return false

		case 'ban':
			if (client.role === 'owner') {
				if (arg[1]) {
					let banned = Connections.list[arg[1]]
					if (banned) {
						Connections.timeout(banned, arg[2] ? arg[2] * 1e3 : 10 * 60 * 1e3)
						feedback(client, `${banned.nick} ${banned.id} został zbanowany`)
						return true
					}
				}
			}
			return false
	}
}

function feedback(client, message) {
	client.transmit({
		type: 'chat',
		nick: 'serwer',
		role: 'root',
		content: message,
		time: new Date(),
	})
}

function warn(client, message) {
	feedback(client, `${message} (${client.warns}/${CHAT_MAX_WARNS})`)
}

const chat = {
	label: 'chat',

	feedback: feedback,
	warn: warn,

	connect() {
		return {
			flag: 'messages',
			messages: cachedMessages,
		}
	},

	send(client, payload) {
		client.transmit(payload)

		cachedMessages.push(payload)
		if (cachedMessages.length > 30) cachedMessages.shift()
	},

	async receive(client, { content }) {
		if (typeof content != 'string') return

		if (!client.captchaStatus.verified) {
			let { success, score } = await captcha.request(client, 'chat')

			if (success) {
				if (score > 0.75) {
					client.captchaStatus.verified = true
					client.burstCount = 0
				} else {
					log.warn(
						{ id: client.id, ip: client.ip, score },
						`Insufficient captcha`
					)
					return feedback(client, `Nie osiągnięto wymagań captcha`)
				}
			} else return feedback(client, `Błąd weryfikacji captcha`)
		}

		if (content.startsWith('/')) {
			// command parsing
			let arg = content.slice(1).split(' ') // split with spaces

			let ok = command(client, arg)
			log.info(
				{ id: client.id, ip: client.ip, nick: client.nick, content },
				`${ok ? '/' : '_'}`
			)
		} else {
			// chat parsing
			let ok = send(client, content)
			log.info({ id: client.id, ip: client.ip, content }, `${ok ? '#' : '.'}`)
		}
	},
}

export default chat
