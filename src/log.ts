import pino, { Logger } from 'pino'

const logger = pino({ level: 'trace' }) as Logger & { traceTime: Function }

logger.traceTime = function (f: Function) {
	let t = process.hrtime.bigint()
	let out = f()
	this.trace('' + new Number(process.hrtime.bigint() - t).valueOf() / 1e6)
	return out
}

export default logger
