import env from '../env.js'

import Client, { module, outload } from '../Client.js'
import logger from '../log.js'

const { COUNT_HYSTERIA, COUNT_DELTA } = env

const log = logger.child({ socket: 'count' })

var counter = 0,
	sentCount = -1,
	sentTime = Date.now() - COUNT_DELTA

function update() {
	let dTime = Date.now() - sentTime // calculate time difference

	if (dTime < COUNT_DELTA) return // enforce min time between updates

	counter = Object.keys(Client.connections).length // count connections

	let dCounter = Math.abs(counter - sentCount) // calculate count difference

	if (
		dCounter >= COUNT_HYSTERIA || // allow hysteria
		counter <= COUNT_HYSTERIA // precision at low counts
	) {
		sentCount = counter
		sentTime = Date.now()

		log.info({ counter, dTime, dCounter }, `$ ${counter}`)

		Client.broadcast('count', { count: counter })
	}
}

const count: module = {
	label: 'count',

	connect() {
		update()
		return {
			count: counter,
		}
	},

	leave: update,

	send(client: Client, payload: outload) {
		client.transmit(payload, 'count')
	},

	receive(client, {}) {},
}

export default count
