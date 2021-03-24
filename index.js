const { Connection } = require("mongoose")

const express = require("express"),
    bodyParser = require("body-parser"),
    websocket = require('ws'),
    package = require('./package'),
    dotenv = require('dotenv').config()

const app = express(),
    wss = new websocket.Server({ port: process.env.PORT_WS || 5502 }),
    PORT_API = process.env.PORT_API || 5501,
    Settings = {
        maxWarns: 5,
        timeoutDuration: 30e3,
        nickLimit: 12,
        burst: process.env.CHAT_BURST || 3,
        maxConcurrent: process.env.MAX_CONCURRENT || 15,
        hysteria: process.env.HYSTERIA || 5,
        release: process.env.CHAT_RELEASE || 0.8,
        messageMax: process.env.CHAT_MESSAGE || 120,
        reservedNicks: [
            'mathias',
            'malina',
            'admin',
            'serwer',
            'root',
            'local'
        ]
    },
    Connections = {
        ips: {},
        list: {},
        count: 0,
        invisible: 0,
        last: 0,
        nicks: {},
        warns: {},
        timeouts: {},
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
        warn(client) {
            this.warns[client.ip] = ++client.warns
        },
        timeout(client, time) {
            this.timeouts[client.ip] = client.timedout = new Date(new Date().getTime() + (time))
            this.warns[client.ip] = client.warns = 0
            log('x', client.id, (time / 1e3) + 's')
        }
    }

class Client {
    constructor(ws, req) {

        ws.client = this

        this.ws = ws
        this.req = req

        let id = Math.random().toString(36).slice(2, 9)    // 7 character id

        this.id = id
        this.ip = req.headers['x-real-ip']

        this.nick = 'anon_' + id  // anon + 7 chars of id
        this.nickPad = function(){return ' '.repeat(Settings.nickLimit-this.nick.length)+this.nick}
        this.visibility = true
        this.role = null
        this.ready = false

        this.burst = 0
        this.warns = Connections.warns[this.ip] ? Connections.warns[this.ip] : 0
        this.timedout = Connections.timeouts[this.ip] ? Connections.timeouts[this.ip] : new Date()
        this.lastMessage = [1, 1]
        this.latest = []
        this.delta = Infinity

        Connections.open(this)

        this.ready = true
    }

    end(code, reason) {
        this.ws.close(code, reason)
    }

    close(code, reason = '') {
        log('-', this.id, this.ip, reason)
        Connections.close(this)
    }

    transmit(obj) {
        if (typeof obj.time == 'undefined') obj.time = new Date()
        this.ws.send(JSON.stringify(obj))
    }

    chat(message) {

        // discard
        // ws timed out
        if (new Date() < this.timedout) {
            this.feedback(`Trzeba było nie spamić (timeout do ${this.timedout.toTimeString().slice(0, 8)})`)
            return false
        }

        // discard and warn
        // too fast messages
        if (this.delta < Settings.release && this.burst > Settings.burst) {
            this.warn("Nie spam")
            return false
        }

        // discard
        // content too long or too short
        if ((message.length > Settings.messageMax) || (message.length < 1)) {
            this.feedback('Wiadomość musi zawierać od 1 do 120 znaków')
            return false
        }

        // discard and warn 
        // repetitive spam
        if (this.latest.indexOf(message) != -1) {
            this.warn("Może coś nowego napisz")
            return false
        }
        this.latest.push(message)
        if (this.latest.length > 2) this.latest.shift()

        // discard and warn
        // blacklisted words
        if (new RegExp([
            'http',
            ':\/\/',
            '\.com',
            '\.gg',
            '\.pl'
        ].join("|")).test(message)) {
            this.warn("Nie wolno tak")
            return false
        }

        // discard and warn
        // repetetive characters
        // if(data.content.replace(new RegExp(data.content[Math.floor(Math.random() * (data.content.length))], 'g'), "").length < (data.content.length * 0.1))
        // {
        //     Sockets.warn(ws, `repetetive character`)
        //     return
        // }

        // discard and warn
        // blacklisted characters
        // if (/[^\x00-\x7Fążśźęćń€łóĄŻŚŹĘĆŃÓŁ]/.test(data.content)) {
        //     Sockets.warn(ws, `blacklist character`)
        //     return
        // }

        Connections.broadcast({
            type: 'chat',
            nick: this.nick,
            // role: ws.ip.startsWith('10.0') ? 'owner' : undefined,
            role: this.role,
            id: this.id,
            content: message,
            time: new Date()
        })
        return true
    }

    command(arg) {
        switch (arg[0]) {
            case 'nick':
                if (typeof arg[1] != 'string') break
                if ((arg[1].length > Settings.nickLimit) || (arg[1].length < 1)) {
                    // invalid nick length
                    this.feedback(`Nick musi mieć między 1 a ${Settings.nickLimit} znaków`)

                } else if (new RegExp(Settings.reservedNicks.join("|"), 'i').test(arg[1])) {
                    // reserved nick
                    this.feedback('Nie możesz użyć tego nicku')

                } else if (/[^\x00-\x7Fążśźęćń€łóĄŻŚŹĘĆŃÓŁ]/.test(arg[1])) {
                    // invalid character
                    this.feedback(`Nick nie może zawierać znaków specjalnych`)
                    break

                } else {
                    if (Connections.nick(this, arg[1])) {
                        this.feedback(`Zmieniono nick na '${arg[1]}'`)
                    } else {
                        this.feedback('Ten nick jest zajęty')
                    }
                }

                break;
            case 'login':
                if (process.env[`pwd_${arg[1]}`])
                    if (arg[2] === process.env[`pwd_${arg[1]}`]) {
                        Connections.nick(this, arg[1])
                        this.role = 'owner'
                        this.feedback(`Zalogowano jako ${arg[1]}`)
                    }
                arg[2] = '***'
                break;
            case 'ban':
                if (this.role === 'owner') {
                    if (arg[1]) {
                        let banned = Connections.list[arg[1]]
                        if (banned) {
                            Connections.timeout(banned, arg[2] ? arg[2] * 1e3 : 10 * 60 * 1e3)
                            this.feedback(`${banned.nick} ${banned.id} został zbanowany`)
                        }
                    }

                }
                break;
        }
        log('/', this.id, `${this.nickPad()} /${arg.join(' ')}`)
    }

    feedback(message) {
        this.transmit({
            type: 'chat',
            nick: 'serwer',
            role: 'root',
            content: message,
            time: new Date()
        })
    }

    warn(message) {
        Connections.warn(this)
        this.feedback(`${message} (${this.warns}/${Settings.maxWarns})`)
        if (this.warns >= Settings.maxWarns) {
            this.timeout(`No i masz timeout`, 10e3)
        }
    }

    timeout(message, time) {
        Connections.timeout(this, time)
        this.feedback(message)
    }
}

function log(...message) {
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}

wss.on('connection', function connection(ws, req) {

    let client = new Client(ws, req)

    client.transmit([
        {
            type: 'sync.begin'
        },
        {
            type: 'count',
            count: Connections.count,
            invisible: Connections.invisible
        },
        {
            type: 'version',
            version: package.version
        },
        {
            type: 'id',
            id: client.id
        }
    ])

    ws.on('close', function (code, reason) { client.close(code, reason) })

    ws.on('message', function (payload) {

        // try parse input
        try {
            var data = JSON.parse(payload)
        } catch (error) {
            return
        }

        let client = ws.client
        let delta = process.hrtime(client.lastMessage)

        // calculate message delta
        delta = (delta[0] + delta[1] / 1e9)

        // count bursts
        if (delta < Settings.release) client.burst++
        else client.burst = 0

        client.lastMessage = process.hrtime()
        client.delta = delta

        // kick for flooding
        if (client.burst > Settings.burst * 3)
            client.end(4002, "Flooding")


        if (data.type == 'sync.received') {
            client.transmit({
                type: 'sync.end',
                time: Date.now()
            })
        }

        if (data.type == 'visibility') {
            Connections.visibility(client, data.visible)
        }

        if (data.type == 'chat') {

            if (typeof data.content != 'string') return

            if (data.content.startsWith('/')) {
                // command parsing

                let arg = data.content.split(' ')   // split with spaces
                arg[0] = arg[0].slice(1)    // remove slash

                client.command(arg)
            } else {
                // chat parsing
                let ok = client.chat(data.content)
                log(ok ? '#' : '.', client.id, `${client.nickPad()}: ${data.content}`)
            }
        }
    })
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.json({ comment: "Welcome to iledopapiezowej.pl API" });
});

app.listen(PORT_API, () => {
    console.log(`Server is running on port ${PORT_API}.`);
});