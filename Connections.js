import Settings from './Settings.js'

function log(...message) {
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}

var Connections = {
    ips: {},
    list: {},
    count: 0,
    invisible: 0,
    last: 0,
    nicks: {},
    warns: {},
    timeouts: {},
    bans: {},
    cachedMessages: [],
    open(client) {
        // add to ips list
        if (typeof this.ips[client.ip] == 'undefined') this.ips[client.ip] = []
        this.ips[client.ip].push(client.id)

        this.count++
        this.list[client.id] = client
        this.update()

        log('+', client.id, client.ip)

        // kick if to many concurrent
        if (this.ips[client.ip].length >= Settings.maxConcurrent) {
            client.end(4001, "Too many concurrent connections")
            return
        }
    },
    close(client) {
        // propagate counter
        if (!client.visibility) this.invisible--
        this.count--
        this.update()
        delete this.list[client.id]

        // free up nick
        this.nicks[client.nick] = false

        // free up ip slot
        let i = this.ips[client.ip].indexOf(client.id)
        if (i != -1) this.ips[client.ip].splice(i, 1)
    },
    nick(client, nick) {
        if (this.nicks[nick]) {
            return false
        } else {
            this.nicks[nick] = true
            this.nicks[client.nick] = false
            client.nick = nick
            return true
        }
    },
    visibility(client, visible) {
        if (client.visibility && !visible) {    // goes invisible
            this.invisible++
        } else if (!client.visibility && visible) { // goes visible
            this.invisible--
        }
        client.visibility = visible
        this.update()
    },
    update() {
        let change = Math.abs(this.count - this.last)
        if (
            change >= Settings.hysteria ||    // allow hysteria
            this.count <= 5 && // precision at low counts
            change > 0  // dont send on no change
        ) {
            this.last = this.count
            this.broadcast({
                type: 'count',
                count: this.count,
                invisible: this.invisible
            })
            log('$', this.count, `\t${this.count - this.invisible}`)
        }
    },
    broadcast(data) {
        // wss.broadcast(JSON.stringify(data))
        for (let id in this.list) {
            this.list[id].transmit(data)
        }
    },
    cacheMessage(message){
        this.cachedMessages.push(message)
        if (this.cachedMessages.length > 30) this.cachedMessages.shift()
    },
    warn(client) {
        this.warns[client.ip] = ++client.warns
    },
    timeout(client, time) {
        this.timeouts[client.ip] = client.timedOut = new Date(new Date().getTime() + (time))
        this.warns[client.ip] = client.warns = 0
        log('x', client.id, (time / 1e3) + 's')
    },
    ban(client, time, reason) {
        this.bans[client.ip] = {
            time: time,
            reason: reason
        }
    }
}

export default Connections