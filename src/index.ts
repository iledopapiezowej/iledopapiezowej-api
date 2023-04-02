import env from './env.js'

import express from 'express'
import bodyParser from 'body-parser'
import WebSocket, { WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'

import Client from './Client.js'
import logger from './log.js'

const { PORT_API, PORT_WS, WS_RELEASE, WS_FLOODING_THRESHOLD, WS_MAX_PAYLOAD } =
	env

const app = express(),
	wss = new WebSocketServer({ port: PORT_WS })

export type WebSocketClient = WebSocket & { client: Client }
export type RequestClient = IncomingMessage & { ip: string }

wss.on('connection', (ws: WebSocketClient, req: RequestClient) => {
	// parse ip
	req.ip = (req.headers['cf-connecting-ip'] ??
		req.headers['x-real-ip'] ??
		req.socket.remoteAddress ??
		'?') as string

	// ip banned
	if (Client.isBanned(req.ip)) {
		ws.close(4003, 'Remote address banned')
		return
	}

	let client = new Client(ws, req)

	ws.on('close', (code, reason) => {
		client.onClose(code, reason.toString() || undefined)
	})

	let lastMessageTime = 0n

	ws.on('message', async function (payload: Buffer) {
		// enfore max payload size
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

		// Payload parsing
		client.receive(data)
	})
})

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.get('/', (req, res) => {
	res.json({ comment: 'Welcome to iledopapiezowej.pl API' })
})

app.listen(PORT_API, () => logger.info(`http: listening :${PORT_API}`))
