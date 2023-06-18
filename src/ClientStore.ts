const ClientStore = (initial: any) => {
	return new Proxy({} as { [index: string]: any }, {
		get(target, index: string) {
			if (typeof target[index] == 'undefined') return (target[index] = initial)

			return target[index]
		},
		set(target, index: string, value) {
			target[index] = value
			return true
		},
	})
}

export default ClientStore
