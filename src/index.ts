import env from './env.js'

import WebSocket, { WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'

import Client from './Client.js'
import logger from './log.js'

export type WebSocketClient = WebSocket & { client: Client }
export type RequestClient = IncomingMessage & { ip: string }

export enum WS_CODE {
	TOO_MANY_CONNECTIONS = 4001,
	FLOODING = 4002,
	BANNED = 4003,
}

const { PORT, WS_RELEASE, WS_FLOODING_THRESHOLD, WS_MAX_PAYLOAD } = env

const wss = new WebSocketServer({ port: PORT })

wss.on('listening', () => logger.info(`ws: listening :${PORT}`))

wss.on('connection', (ws: WebSocketClient, req: RequestClient) => {
	// parse ip
	req.ip = (req.headers['cf-connecting-ip'] ??
		req.headers['x-real-ip'] ??
		req.socket.remoteAddress ??
		'?') as string

	// ip banned
	if (Client.isBanned(req.ip)) {
		ws.close(WS_CODE.BANNED, 'Remote address banned')
		return
	}

	let client = new Client(ws, req)

	ws.on('close', (code, reason) => {
		client.onClose(code, reason.toString() || undefined)
	})

	let lastMessageTime = 0n

	ws.on('message', async function (payload: Buffer) {
		if (payload.length > WS_MAX_PAYLOAD) return

		try {
			var data = JSON.parse(payload.toString())
		} catch (error) {
			return
		}

		// calculate message delta
		const delta = process.hrtime.bigint() - lastMessageTime
		lastMessageTime = process.hrtime.bigint()

		// count bursts
		if (delta < WS_RELEASE * 1e6) {
			client.burstCount++
			client.burstTypes.push(data?.type || '*')
		} else {
			client.burstCount = 0
			client.burstTypes = []
		}

		// kick for flooding
		if (client.burstCount > WS_FLOODING_THRESHOLD) {
			Client.ban(client, 'Flooding')
			// client.close(4002, 'Flooding') // redundant
			return
		}

		client.receive(data)
	})
})
