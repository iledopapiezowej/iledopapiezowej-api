import env from '../env.js'
import logger from '../log.js'

import levenshtein from 'js-levenshtein'

import Client, { outload, module } from '../Client.js'
import ClientStore from '../ClientStore.js'

const log = logger.child({ socket: 'chat' })

const {
	CHAT_ENABLE,
	CHAT_BURST,
	CHAT_RELEASE,
	CHAT_MAX_MESSAGE,
	CHAT_MAX_NICK,
	CHAT_RESERVED,
	CHAT_MAX_WARNS,
} = env

const goldenHour: [number, number, number, number] = [21, 0, 0, 0],
	goldenHourDuration = 3600e3

const cachedMessages: outload[] = []

const latestMessages = ClientStore(['', '', '']),
	warns = ClientStore(0),
	timeouts = ClientStore(false),
	bursts = ClientStore({ lastSend: 0n, count: 0 })

var isGoldenHour = false

function cacheMessage(payload: outload) {
	cachedMessages.push(payload)
	if (cachedMessages.length > 30) cachedMessages.shift()
}

function send(client: Client, message: string): number {
	// client timed out
	if (new Date() < timeouts[client.ip]) return 1

	// too fast messages
	if (bursts[client.id].count > CHAT_BURST) {
		return 3
	}

	// content too long or too short
	if (message.length > CHAT_MAX_MESSAGE || message.length < 1) return 4

	// keep latest sent messages
	let clientLastMsgs = latestMessages[client.id]

	clientLastMsgs.push(message)
	if (clientLastMsgs.length > 3) clientLastMsgs.shift()

	// TODO: optimize this mess
	let l = {
			ab: levenshtein(clientLastMsgs[0], clientLastMsgs[1]),
			ac: levenshtein(clientLastMsgs[0], clientLastMsgs[2]),
			bc: levenshtein(clientLastMsgs[1], clientLastMsgs[2]),
		},
		avg = {
			ab: (clientLastMsgs[0].length + clientLastMsgs[1].length) / 2,
			ac: (clientLastMsgs[0].length + clientLastMsgs[2].length) / 2,
			bc: (clientLastMsgs[1].length + clientLastMsgs[2].length) / 2,
		},
		calc = {
			ab: l.ab / avg.ab,
			ac: l.ac / avg.ac,
			bc: l.bc / avg.bc,
		}

	let messageOffsetAvg = (calc.ab + calc.ac + calc.bc) / 3,
		messageOffsetMin = Math.min(calc.ab, calc.ac, calc.bc)

	// spam
	if (messageOffsetAvg <= 0.66) return 5

	// blacklisted words
	const badWords = ['http', '://', '\\.com', '\\.gg', '\\.pl']
	if (new RegExp(badWords.join('|')).test(message)) return 6

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

	return 0
}

function command(client: Client, arg: string[]) {
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
				if (Client.nick(client, arg[1])) {
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
					Client.nick(client, arg[1])
					client.role = 'owner'
					feedback(client, `Zalogowano jako ${arg[1]}`)
					return true
				}
			arg[2] = '***'
			return false

		default:
			return false

		// case 'ban':
		// 	if (client.role === 'owner') {
		// 		if (arg[1]) {
		// 			let banned = Connections.list[arg[1]]
		// 			if (banned) {
		// 				Connections.timeout(banned, arg[2] ? arg[2] * 1e3 : 10 * 60 * 1e3)
		// 				feedback(client, `${banned.nick} ${banned.id} został zbanowany`)
		// 				return true
		// 			}
		// 		}
		// 	}
		// 	return false
	}
}

function feedback(client: Client, content: string) {
	client.transmit(
		{
			nick: 'serwer',
			role: 'root',
			content,
		},
		'chat'
	)
}

function warn(client: Client, message: string) {
	warns[client.ip]++

	if (warns[client.ip] >= CHAT_MAX_WARNS) {
		timeout(client, 10)
		warns[client.ip] = 0
	} else
		feedback(client, `${message} (${warns[client.ip]}/${CHAT_MAX_WARNS - 1})`)
}

// @ts-ignore TS7030
function timeout(client: Client, seconds: number) {
	if (timeouts[client.ip])
		if (timeouts[client.ip].getTime() - Date.now() < 30e3) {
			return Client.ban(client, 'Za dużo timeoutów')
		}

	timeouts[client.ip] = new Date(Date.now() + seconds * 1e3)
	feedback(client, `Timeout ${seconds}s`)
}

function toGoldenHour() {
	let s = new Date().setHours(...goldenHour) - Date.now()
	return s > 0 ? s : s + 86400e3
}

function toGoldenHourEnd() {
	let s = new Date().setHours(...goldenHour) - Date.now() + goldenHourDuration
	return s > 0 ? s : s + 86400e3
}

function startGoldenHour() {
	isGoldenHour = true
	Client.broadcast('chat', {
		nick: 'serwer',
		role: 'root',
		content: `Włączono czat`,
	})
	log.info({ isGoldenHour }, `goldenHour on`)
	setTimeout(endGoldenHour, toGoldenHourEnd())
}

function endGoldenHour() {
	isGoldenHour = false
	Client.broadcast('chat', {
		nick: 'serwer',
		role: 'root',
		content: `Wyłączono czat`,
	})
	log.info({ isGoldenHour }, `goldenHour off`)
	setTimeout(startGoldenHour, toGoldenHour())
}

if (toGoldenHour() > toGoldenHourEnd())
	setTimeout(startGoldenHour, toGoldenHour() - 86400e3)
else setTimeout(startGoldenHour, toGoldenHour())

const chat: module = {
	label: 'chat',

	feedback: feedback,
	warn: warn,

	connect({ id }): outload {
		return {
			flag: 'messages',
			messages: cachedMessages,
		}
	},

	leave({ id }) {
		delete latestMessages[id]
	},

	send(client, payload) {
		client.transmit(payload, 'chat')
	},

	async receive(client, { content }) {
		if (typeof content != 'string') return

		if (!CHAT_ENABLE) return feedback(client, 'czat tymczasowo niedostępny')

		if (!isGoldenHour) return feedback(client, 'czat będzie włączony o 21:00')

		const { id, ip, nick, role } = client

		if (!client.captcha.verified && !client.captcha.await) {
			let { success, score } = await Client.modules.captcha.send!(
				client,
				'chat'
			).catch((err: any) => {
				log.info({ id: client.id, ip: client.ip, err }, `captcha failed`)
				return { success: false }
			})

			if (success) {
				if (score ?? 0 > 0.75) {
					client.captcha.verified = true
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
			let arg = content.slice(1).split(' ') // split with spaces

			let ok = command(client, arg)
			log.info({ id, ip, nick, content }, `${ok ? '/' : '_'}`)
		} else {
			bursts[client.id] = ((cBursts) => {
				let now = process.hrtime.bigint()

				if (now - cBursts.lastSend < CHAT_RELEASE * 1e6) cBursts.count += 1
				else cBursts.count = 1

				cBursts.lastSend = now
				return cBursts
			})(bursts[client.id])

			let sendCode = logger.traceTime(() => send(client, content))

			if (sendCode > 0) {
				switch (sendCode) {
					case 1:
						let date = timeouts[client.ip].toTimeString().slice(0, 8)
						feedback(client, `Trzeba było nie spamić (timeout do ${date})`)
						break
					case 2:
						warn(client, 'Zwolnij')
						break
					case 3:
						warn(client, 'Za dużo wiadomości')
						break
					case 4:
						feedback(client, 'Wiadomość musi zawierać od 1 do 120 znaków')
						break
					case 5:
						warn(client, 'we we nie spam')
						break
					case 6:
						warn(client, 'Nie wolno tak')
						break
					default:
						feedback(client, 'nie.')
						break
				}
			} else {
				let payload = {
					nick,
					role,
					uid: id,
					content,
				}

				Client.broadcast('chat', payload)
				cacheMessage(payload)
			}

			log.info({ id, ip, content, sendCode }, `${sendCode > 0 ? '.' : '#'}`)
		}
	},
}

export default chat
