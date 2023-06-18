import Client, { module } from '../Client.js'

var heartbeats: { [id: Client['id']]: NodeJS.Timer } = {}

const sync: module = {
	label: 'sync',

	connect(client) {
		// keep the socket alive
		// cloudflare closes a connection after 100 seconds of silence
		// sync the time while you're at it

		heartbeats[client.id] && clearInterval(heartbeats[client.id])

		heartbeats[client.id] = setInterval(() => {
			client.transmit(
				{
					flag: 'begin',
					heartbeat: true,
				},
				'sync'
			)
		}, 90e3)

		return {
			flag: 'begin',
		}
	},

	leave(client) {
		clearInterval(heartbeats[client.id])
		delete heartbeats[client.id]
	},

	receive(client, { flag, heartbeat }) {
		if (flag === 'received')
			client.transmit(
				{
					type: 'sync',
					flag: 'end',
					heartbeat,
				},
				'sync'
			)
	},
}

export default sync
