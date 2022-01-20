import chat from './modules/socket/chat.js'
import captcha from './modules/socket/captcha.js'
import sync from './modules/socket/sync.js'
import count from './modules/socket/count.js'

import Connections from './Connections.js'

const modules = {}

for (let module of [chat, captcha, sync, count]) {
	modules[module.label] = module
}
class Client {
	constructor(ws, req) {
		ws.client = this

		this.ws = ws
		this.req = req

		let id = Math.random().toString(36).slice(2, 9) // 7 character id

		this.id = id
		this.ip = req.headers['cf-connecting-ip'] ?? req.headers['x-real-ip']

		this.nick = 'anon_' + id
		this.visibility = true
		this.role = null

		this.burstCount = 0
		this.warns = Connections.warns[this.ip] ? Connections.warns[this.ip] : 0
		this.timedOut = Connections.timeouts[this.ip]
			? Connections.timeouts[this.ip]
			: new Date()
		this.lastMessageTime = [1, 1]
		this.latestMessages = ['', '', '']
		this.messageDelta = Infinity

		this.captchaStatus = {
			verified: false,
		}

		this.modules = { captcha, sync, count }

		let welcome = []
		for (let label in this.modules) {
			let module = modules[label]
			module.connect &&
				welcome.push({ type: module.label, ...module.connect() })
		}

		this.transmit(welcome)

		Connections.open(this)

		this.resetHeartbeat()
	}

	// keep the socket alive
	// sync the time while you're at it
	resetHeartbeat() {
		clearInterval(this.heartbeat)
		this.heartbeat = setInterval(() => {
			sync.heartbeat(this)
		}, 30e3)
	}

	// force close socket
	close(code, reason) {
		this.ws.close(code, reason)
		clearInterval(this.heartbeat)
	}

	// cleanup
	onClose(code, reason = '') {
		Connections.close(this, code, reason)
	}

	transmit(payload, type) {
		if (!Array.isArray(payload)) payload = [payload]

		payload = payload.map((chunk) => {
			chunk.time || (chunk.time = new Date())
			type && (chunk.type = type)
			chunk.mid = Math.random().toString(36).slice(2, 9)
			return chunk
		})

		this.ws.send(JSON.stringify(payload))
	}

	receive(payload) {
		// subscribe only
		if (payload.subscribe) return this.sub(payload.type)
		else if (payload.unsubscribe) return this.unsub(payload.type)
		// subscribe automatically
		else if (!this.modules[payload.type]) this.sub(payload.type)

		modules[payload.type].receive(this, payload)
	}

	sub(name) {
		if (!Object.keys(this.modules).includes(name)) {
			this.modules[name] = modules[name]
			this.transmit({ type: name, ...this.modules[name].connect() })
		}
	}

	unsub(name) {
		if (Object.keys(this.modules).includes(name)) {
			this.modules[name] = modules[name]
		}
	}
}

export default Client
