import Connections from '../../Connections.js'
import logger from '../../log.js'

const log = logger.child({ socket: 'count' })

const count = {
	label: 'count',
	connect() {
		return {
			count: Connections.count,
			invisible: Connections.invisible,
		}
	},
	send(client, payload) {
		client.transmit(payload)
	},
	receive(client, { visible }) {
		Connections.visibility(client, visible)
	},
}

export default count
