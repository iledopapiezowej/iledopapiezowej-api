import env from '../env.js'
import logger from '../log.js'

import Client, { module, outload } from '../Client.js'

const { COUNT_DELTA } = env

const log = logger.child({ socket: 'count' })

var counter = 0,
	sentCount = -1,
	sentTime = Date.now() - COUNT_DELTA

function update() {
	// enforce min time between updates
	let dTime = Date.now() - sentTime
	if (dTime < COUNT_DELTA) return

	counter = Object.keys(Client.connections).length

	sentCount = counter
	sentTime = Date.now()

	log.info({ counter, dTime }, `$ ${counter}`)

	Client.broadcast('count', { count: counter })
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

	receive() {},
}

export default count
