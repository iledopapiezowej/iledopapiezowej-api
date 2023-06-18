import assert from 'assert'
import { exit } from 'process'
import WebSocket from 'ws'

describe('first connect', () => {
	const ws_connection = new WebSocket('ws://localhost:2137')

	const onError = jest.fn(console.error),
		onOpen = jest.fn(),
		onMessage = jest.fn((data: string) => {
			JSON.stringify(data)
			ws_connection.close()
		})

	// function onError(e: Error) {
	// 	console.error(e)
	// }

	// function onOpen() {
	// 	console.info('ws connected')
	// }

	// function onMessage

	ws_connection.on('error', onError).on('open', onOpen).on('message', onMessage)

	it('connects with no error', async () => {
		await new Promise((r) => setTimeout(r, 50))
		expect(onError).not.toHaveBeenCalled()
	})

	it('opens a connection', () => {
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it('sends valid JSON', () => {
		expect(onMessage).toHaveBeenCalledTimes(2)
		expect(onMessage).not.toThrow()
	})

	// ws_connection.on('message', (data) => {
	// 	test('payload is a valid JSON', () => {
	// 		assert.doesNotThrow(() => JSON.stringify(data))
	// 	})
	// })

	// return fetchData().then(data => {
	// 	expect(data).toBe('peanut butter');
	// });

	// ws_connection.close()
})

// ws_connection
// 	.on('error', (e) => onExit())
// 	.on('open', () => {
// 		console.info('ws connected')
// 	})
// 	.on('message', function message(data) )
