import env from './env.js'

import express from 'express'
import bodyParser from 'body-parser'
import websocket from 'ws'
import fs from 'fs'

import Client from './Client.js'

const { PORT_API, PORT_WS, CHAT_RELEASE = 3, CHAT_BURST = 3 } = process.env

const app = express(),
	wss = new websocket.Server({ port: PORT_WS }),
	pkg = JSON.parse(fs.readFileSync('package.json'))

wss.on('connection', (ws, req) => {
	let client = new Client(ws, req)

	client.transmit({
		type: 'info',
		version: pkg.version,
		supports: pkg.supports,
		id: client.id,
	})

	ws.on('close', (code, reason) => client.onClose(code, reason))

	ws.on('message', async function (payload) {
		// try parse input
		try {
			var data = JSON.parse(payload)
		} catch (error) {
			return
		}

		let client = ws.client

		// calculate message delta
		let delta = process.hrtime(client.lastMessage)
		delta = delta[0] + delta[1] / 1e9

		// count bursts
		if (delta < CHAT_RELEASE) client.burstCount++
		else client.burstCount = 0

		client.lastMessage = process.hrtime()
		client.messageDelta = delta

		// kick for flooding
		if (client.burstCount > CHAT_BURST * 3) client.close(4002, 'Flooding')

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
