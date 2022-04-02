import env from './env.js'

import logger from './log.js'
import socketModules from './modules/socket/index.js'

import { RequestClient, WebSocketClient } from './index.js'
import { captchaResult } from './modules/socket/captcha.js'

//
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
	connect?: () => outload
	leave?: () => void
	send?: (client: Client, payload: any) => any
	receive: (client: Client, payload: inload) => any
	[name: string]: any
}

type modules = { [label: string]: module }

type ban = {
	time: Date
	reason: string
}
//

const { MAX_CONCURRENT } = env

const log = logger.child({ module: 'Client' }),
	defaultSubscribed = ['count', 'sync', 'captcha']

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

	static count = 0
	static invisible = 0

	private static nicks: { [nick: string]: boolean } = {}

	private static bans: { [ip: string]: ban } = {}

	static open(client: Client) {
		this.ips[client.ip] ?? (this.ips[client.ip] = [])
		this.ips[client.ip].push(client)

		this.count++

		this.connections[client.id] = client

		Client.modules.count.update()

		log.info(
			{
				id: client.id,
				ip: client.ip,
			},
			`+ ${client.id}`
		)

		// kick if to many concurrent
		if (this.ips[client.ip].length >= MAX_CONCURRENT) {
			client.close(4001, 'Too many concurrent connections')
			return
		}
	}

	static close(client: Client, code: number, reason: string) {
		// propagate counter
		if (!client.visibility) this.invisible--
		this.count--
		// Client.modules.count.update()

		delete this.connections[client.id]

		// free up nick
		this.nicks[client.nick] = false

		// free up ip slot
		let i = this.ips[client.ip].indexOf(client)
		if (i != -1) this.ips[client.ip].splice(i, 1)

		for (let m in client.subscribed) {
			let { leave } = this.modules[m]
			leave && leave()
		}

		log.info(
			{ id: client.id, ip: client.ip, ...(!!reason && { reason }) },
			`- ${client.id}`
		)
	}

	static nick(client: Client, nick: string) {
		if (this.nicks[nick]) {
			return false // unavailable
		} else {
			this.nicks[nick] = true // reserve the new nick
			this.nicks[client.nick] = false // free up the old one
			client.nick = nick // change clients nick
			return true
		}
	}

	static visibility(client: Client, visible: boolean) {
		if (client.visibility && !visible) {
			// goes invisible
			this.invisible++
		} else if (!client.visibility && visible) {
			// goes visible
			this.invisible--
		}
		client.visibility = visible
		Client.modules.count.update()
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

	static ban(client: Client, reason = '') {
		this.bans[client.ip] = {
			time: new Date(),
			reason,
		}
		client.close(4003, reason)
	}

	static isBanned(ip: string): ban | null {
		return Client.bans[ip] ?? null
	}

	ws: WebSocketClient
	req: RequestClient

	id: string
	ip: string
	nick: string
	visibility: boolean
	role: string | null

	lastMessageTime: [number, number]
	burstCount: number
	messageDelta: number

	heartbeat?: NodeJS.Timer
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
		this.nick = 'anon_' + id
		this.visibility = true
		this.role = null

		this.burstCount = 0
		// this.warns = Client.warns[this.ip] ?? 0
		// this.timedOut = Client.timeouts[this.ip] ?? new Date()
		this.lastMessageTime = [1, 1]
		this.messageDelta = Infinity

		this.captcha = {
			verified: false,
		}

		this.subscribed = defaultSubscribed.reduce((subscribed, name) => {
			subscribed[name] = true
			return subscribed
		}, <typeof this.subscribed>{})

		Client.open(this)

		let welcome: outload[] = [
			{
				type: 'info',
				id: this.id,
			},
		]

		for (let type in Client.modules) {
			let { connect } = this.module(type) ?? {}
			connect && welcome.push({ type, ...connect() })
		}

		this.transmit(welcome)

		this.resetHeartbeat()
	}

	// keep the socket alive
	// cloudflare closes a connection after 100 seconds of silence
	// sync the time while you're at it
	resetHeartbeat() {
		this.heartbeat && clearInterval(this.heartbeat)

		this.heartbeat = setInterval(() => {
			Client.modules.sync.heartbeat(this)
		}, 90e3)
	}

	// force close socket
	close(code: 4001 | 4002 | 4003, reason: string) {
		this.ws.close(code, reason)

		this.heartbeat && clearInterval(this.heartbeat)
	}

	// cleanup
	onClose(code: number, reason: string) {
		Client.close(this, code, reason)
	}

	transmit(payload: outload, type: string): void
	transmit(payload: outload[]): void
	transmit(payload: outload | outload[], type?: string) {
		if (!Array.isArray(payload)) {
			payload.type = type
			payload = [payload]
		}

		payload = payload
			.filter(({ type }: outload) => this.isSubbed(type))
			.map((chunk: outload) => {
				chunk.time || (chunk.time = new Date())
				chunk.mid = Math.random().toString(36).slice(2, 9)
				return chunk
			})

		if (payload.length < 1) return

		this.ws.send(JSON.stringify(payload))
	}

	receive(payload: inload) {
		let { subscribe, type } = payload

		// subscribe
		if (subscribe) return subscribe ? this.sub(type) : this.unsub(type)

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
				this.transmit({ ...connect() }, type)
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
