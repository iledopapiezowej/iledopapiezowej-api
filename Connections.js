import logger from './log.js'

import chat from './modules/socket/chat.js'

const { MAX_CONCURRENT, COUNT_HYSTERIA, CHAT_MAX_WARNS } = process.env

const log = logger.child({ module: 'Connections' })

var Connections = {
	ips: {},
	list: {},
	count: 0,
	invisible: 0,
	last: 0,
	nicks: {},
	warns: {},
	timeouts: {},
	bans: {},

	open(client) {
		// add to ips list
		if (typeof this.ips[client.ip] == 'undefined') this.ips[client.ip] = []
		this.ips[client.ip].push(client.id)

		this.count++
		this.list[client.id] = client
		this.update()

		log.info(
			{
				id: client.id,
				ip: client.ip,
			},
			`+ ${client.id}`
		)

		// kick if to many concurrent
		if (this.ips[client.ip].length >= MAX_CONCURRENT) {
			client.end(4001, 'Too many concurrent connections')
			return
		}
	},

	close(client, code, reason) {
		// propagate counter
		if (!client.visibility) this.invisible--
		this.count--
		this.update()
		delete this.list[client.id]

		// free up nick
		this.nicks[client.nick] = false

		// free up ip slot
		let i = this.ips[client.ip].indexOf(client.id)
		if (i != -1) this.ips[client.ip].splice(i, 1)

		log.info(
			{ id: client.id, ip: client.ip, ...(!!reason && { reason }) },
			`- ${client.id}`
		)
	},

	nick(client, nick) {
		if (this.nicks[nick]) {
			return false
		} else {
			this.nicks[nick] = true
			this.nicks[client.nick] = false
			client.nick = nick
			return true
		}
	},

	visibility(client, visible) {
		if (client.visibility && !visible) {
			// goes invisible
			this.invisible++
		} else if (!client.visibility && visible) {
			// goes visible
			this.invisible--
		}
		client.visibility = visible
		this.update()
	},

	update() {
		let change = Math.abs(this.count - this.last)
		if (
			change >= COUNT_HYSTERIA || // allow hysteria
			(this.count <= 5 && // precision at low counts
				change > 0) // dont send on no change
		) {
			this.last = this.count

			log.info({ count: this.count, invis: this.invisible }, `$ ${this.count}`)

			this.broadcast('count', {
				count: this.count,
				invisible: this.invisible,
			})
		}
	},

	async broadcast(type, payload) {
		for (let id in this.list) {
			let client = this.list[id]
			payload.type = type
			client.modules[type]?.send(client, payload)
		}
	},

	_broadcast(data) {
		// wss.broadcast(JSON.stringify(data))
		for (let id in this.list) {
			this.list[id].transmit(data)
		}
	},

	warn(client, message) {
		this.warns[client.ip] = ++client.warns
		chat.feedback(client, 'warn: ' + message)

		if (client.warns >= CHAT_MAX_WARNS) {
			this.timeout(client, 30e3)
		}
	},

	timeout(client, time) {
		this.timeouts[client.ip] = client.timedOut = new Date(
			new Date().getTime() + time
		)

		this.warns[client.ip] = client.warns = 0

		chat.feedback(client, `No i masz timeout: ` + 30e3)
		log.info({ id: client.id, time: time / 1e3 }, `x ${client.id}`)
	},

	ban(client, time, reason) {
		this.bans[client.ip] = {
			time: time,
			reason: reason,
		}
	},
}

export default Connections
