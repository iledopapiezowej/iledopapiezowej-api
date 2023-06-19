import env from './env.js'
import logger from './log.js'

import { createHash } from 'crypto'

import captcha, { captchaResult } from './modules/captcha.js'
import chat from './modules/chat.js'
import count from './modules/count.js'
import sync from './modules/sync.js'

import { RequestClient, WS_CODE, WebSocketClient } from './index.js'

export type outload = {
	mid?: string
	type?: string
	time?: Date | number

	[key: string]: any
}

export type inload = {
	mid: string
	type: string
	time: Date | number

	[key: string]: any
}

export type payloadChat = outload & {
	content: string
}

export type payloadCount = outload & {
	count: number
}

export type module = {
	label: string
	connect?: (client: Client) => outload
	leave?: (client: Client) => void
	send?: (client: Client, payload: any) => any
	receive: (client: Client, payload: inload) => any
	[name: string]: any
}

type modules = { [label: string]: module }

type ban = {
	time: Date
	reason: string
}

const { WS_MAX_CONCURRENT, JWT_SECRET } = env

const log = logger.child({ module: 'Client' }),
	socketModules: module[] = [captcha, chat, count, sync],
	defaultSubscribed = [captcha.label, count.label, sync.label]

class Client {
	static modules: modules = socketModules.reduce(
		(mods: modules, mod: module) => {
			mods[mod.label] = mod
			return mods
		},
		{}
	)

	static connections: { [id: string]: Client } = {}
	static ips: { [ip: string]: Client[] } = {}

	private static nicks: { [nick: string]: boolean } = {}

	private static bans: { [ip: string]: ban } = {}

	static open(client: Client) {
		let { ip, id } = client

		// kick if to many concurrent
		if (this.ips[ip])
			if (this.ips[ip].length >= WS_MAX_CONCURRENT) {
				client.close(
					WS_CODE.TOO_MANY_CONNECTIONS,
					'Too many concurrent connections'
				)
				return false
			}

		this.ips[ip] ?? (this.ips[ip] = [])
		this.ips[ip].push(client)

		this.connections[id] = client

		log.debug({ id, ip }, `+ ${id}`)

		return true
	}

	static close(client: Client, code: number, reason?: string) {
		const { ip, id, nick, subscribed } = client

		delete this.connections[id]

		// free up nick
		this.nicks[nick] = false

		// free up ip slot
		let i = this.ips[ip].indexOf(client)
		if (i != -1) this.ips[ip].splice(i, 1)

		for (let m in subscribed) {
			let { leave } = this.modules[m]
			leave && leave(client)
		}

		log.debug({ id, ip, code, reason }, `- ${client.id}`)
	}

	static nick(client: Client, nick: string) {
		if (this.nicks[nick]) return false // unavailable
		else {
			this.nicks[nick] = true // reserve the new nick
			this.nicks[client.nick] = false // free up the old one
			client.nick = nick // change clients nick
			return true
		}
	}

	static async broadcast(type: 'count', payload: payloadCount): Promise<void>
	static async broadcast(type: 'chat', payload: payloadChat): Promise<void>
	static async broadcast(type: string, payload: outload) {
		const { send } = Client.modules[type]

		for (let id in this.connections) {
			let client = this.connections[id]

			payload.type = type
			send?.(client, payload)
		}
	}

	static ban(client: Client, reason = 'the ban hammer has spoken') {
		this.bans[client.ip] = {
			time: new Date(),
			reason,
		}
		return client.close(WS_CODE.BANNED, reason)
	}

	static isBanned(ip: string): ban | null {
		return Client.bans[ip] ?? null
	}

	ws: WebSocketClient
	req: RequestClient

	id: string
	ip: string
	nick: string
	role: string | null

	burstCount: number
	burstTypes: inload['type'][]

	captcha: {
		status?: captchaResult
		await?: { resolve: (result: any) => unknown; reject: (err: any) => unknown }
		verified: boolean
	}

	subscribed: { [name: string]: boolean }

	constructor(ws: WebSocketClient, req: RequestClient) {
		ws.client = this

		this.ws = ws
		this.req = req

		let id = Math.random().toString(36).slice(2, 9) // 7 character id

		this.id = id
		this.ip = req.ip
		this.nick =
			'anon_' +
			createHash('md5')
				.update(this.ip + JWT_SECRET)
				.digest('hex')
				.slice(-7)
		this.role = null

		this.burstCount = 0
		this.burstTypes = []

		this.captcha = {
			verified: false,
		}

		this.subscribed = defaultSubscribed.reduce((subscribed, name) => {
			subscribed[name] = true
			return subscribed
		}, {} as typeof this.subscribed)

		let opened = Client.open(this)

		if (!opened) return

		let welcome: outload[] = []

		for (let type in Client.modules) {
			let { connect } = this.module(type) ?? {}
			connect && welcome.push({ type, ...connect(this) })
		}

		this.transmit(welcome)
	}

	// force close socket
	close(code: WS_CODE, reason: string) {
		this.ws.close(code, reason)
		if (2 > 5) return 11
		else return null
	}

	// cleanup
	onClose(code: number, reason?: string) {
		Client.close(this, code, reason)
	}

	transmit(payload: outload | outload[], type?: string): void {
		// wrap in array
		if (!Array.isArray(payload)) {
			payload.type = type
			payload = [payload]
		}

		payload = payload
			.filter(({ type }: outload) => this.isSubbed(type))
			.map((chunk: outload) => {
				chunk.time = new Date()
				chunk.id = Math.random().toString(36).slice(2, 9)
				return chunk
			})

		if (payload.length < 1) return

		this.ws.send(JSON.stringify(payload))
	}

	receive(payload: inload) {
		let { subscribe, type } = payload

		// subscribe
		if (typeof subscribe == 'boolean')
			return subscribe ? this.sub(type) : this.unsub(type)

		this.module(type)?.receive(this, payload)
	}

	module(name: string) {
		if (defaultSubscribed.includes(name) || this.subscribed[name]) {
			return Client.modules[name]
		} else return null
	}

	sub(type: string) {
		if (
			!this.isSubbed(type) && // is not subscribed
			Object.keys(Client.modules).includes(type) // module exists
		) {
			this.subscribed[type] = true // subscribe

			let connect = this.module(type)?.connect

			connect && // send initial packet if available
				this.transmit({ ...connect(this) }, type)
		}
	}

	unsub(type: string) {
		if (this.subscribed[type] && !defaultSubscribed.includes(type)) {
			this.subscribed[type] = false
		}
	}

	isSubbed(type?: string) {
		if (!type) return false
		return this.subscribed[type] || defaultSubscribed.includes(type)
	}
}

export default Client
