import Client, { inload, module } from '../../Client.js'

//
type syncLoad = {
	flag: 'begin' | 'end'
	heartbeat: true | undefined
}
//

const sync = {
	label: 'sync',

	heartbeat(client: Client) {
		client.transmit(
			{
				flag: 'begin',
				heartbeat: true,
			} as syncLoad,
			'sync'
		)
	},

	connect() {
		return {
			flag: 'begin',
		} as syncLoad
	},

	receive(client: Client, { flag, heartbeat }: inload) {
		if (flag === 'received')
			client.transmit(
				{
					type: 'sync',
					flag: 'end',
					time: Date.now(),
					heartbeat,
				} as syncLoad,
				'sync'
			)
	},
}

export default sync as module
