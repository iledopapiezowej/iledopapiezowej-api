import env from './env.js'

import express from 'express'
import bodyParser from 'body-parser'
import WebSocket, { WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'

import Client from './Client.js'

const { PORT_API, PORT_WS, CHAT_RELEASE, CHAT_BURST } = env

const app = express(),
	wss = new WebSocketServer({ port: PORT_WS })

export type WebSocketClient = WebSocket & { client: Client }
export type RequestClient = IncomingMessage & { ip: string }

wss.on('connection', (ws: WebSocketClient, req: RequestClient) => {
	// parse ip
	req.ip =
		<string>req.headers['cf-connecting-ip'] ??
		req.headers['x-real-ip'] ??
		req.socket.remoteAddress ??
		'?'

	// ip banned
	if (Client.isBanned(req.ip)) {
		ws.close(4003, 'Remote address banned')
		return
	}

	let client = new Client(ws, req)

	ws.on('close', (code, reason) => {
		client.onClose(code, reason.toString())
	})

	ws.on('message', async function (payload) {
		// try parse input
		try {
			var data = JSON.parse(payload.toString())
		} catch (error) {
			return
		}

		let client = ws.client

		// calculate message delta
		const hrnow = process.hrtime(client.lastMessageTime)
		let delta = hrnow[0] + hrnow[1] / 1e9

		// count bursts
		if (delta < CHAT_RELEASE) client.burstCount++
		else client.burstCount = 0

		client.lastMessageTime = process.hrtime()
		client.messageDelta = delta

		// kick for flooding
		if (client.burstCount > CHAT_BURST * 3) {
			Client.ban(client, 'Flooding')
			client.close(4002, 'Flooding')
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

app.listen(PORT_API, () => {
	console.info(`http: listening on ${PORT_API}.`)
})
