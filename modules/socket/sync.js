const sync = {
	label: 'sync',

	heartbeat(client) {
		client.transmit({
			type: 'sync',
			flag: 'begin',
			heartbeat: true,
		})
	},

	connect() {
		return {
			type: 'sync',
			flag: 'begin',
		}
	},

	receive(client, { flag, heartbeat }) {
		if (flag === 'received')
			client.transmit({
				type: 'sync',
				flag: 'end',
				time: Date.now(),
				heartbeat: heartbeat,
			})
	},
}

export default sync
