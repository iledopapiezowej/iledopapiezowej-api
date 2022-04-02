import env from '../../env.js'

import Client, { inload, module, outload } from '../../Client.js'
import logger from '../../log.js'

const { COUNT_HYSTERIA } = env

const log = logger.child({ socket: 'count' })

var lastSent = 0,
	timeSent = Date.now()

function update() {
	let change = Math.abs(Client.count - lastSent),
		delta = Date.now() - timeSent

	if (delta < 6e3) return // min time between updates

	if (
		change >= COUNT_HYSTERIA || // allow hysteria
		(Client.count <= COUNT_HYSTERIA && // precision at low counts
			change > 0) // dont send on no change
	) {
		lastSent = Client.count
		timeSent = Date.now()

		log.info(
			{ count: Client.count, invis: Client.invisible },
			`$ ${Client.count}`
		)

		Client.broadcast('count', {
			count: Client.count,
			invisible: Client.invisible,
		})
	}
}

const count: module = {
	label: 'count',

	connect(): outload {
		return {
			count: Client.count,
			invisible: Client.invisible,
		}
	},

	update,

	leave: update,

	send(client: Client, payload: outload) {
		client.transmit(payload, 'count')
	},

	receive(client: Client, { visible }: inload) {
		Client.visibility(client, visible)
	},
}

export default count as module
