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
        messageMax: process.env.CHAT_MESSAGE || 120
    },
    Sockets = {
        _count: 0,
        _invisible: 0,
        _last: 0,
        _list: {},
        _ips: {},
        _nicks: {},
        _warns: {},
        _timeouts: {},
        open(ws, ip) {

            let id = Math.random().toString(36).slice(2, 10)    // 8 character id

            ws.id = id
            ws.visibility = true
            ws.ip = ip
            ws.nick = 'anon_' + id.slice(1, 8)  // anon + 7 chars of id
            ws.burst = 0
            ws.warns = Sockets._warns[ip] ? Sockets._warns[ip] : 0
            ws.timeout = new Date()
            ws.role = undefined
            ws.latest = []

            // overwrite default send
            ws._send = ws.send
            ws.send = function (obj) { this._send(JSON.stringify(obj)) }

            // default server feedback
            ws.feedback = function (text) {
                ws.send({
                    type: 'chat',
                    nick: 'serwer',
                    role: 'root',
                    content: text,
                    time: new Date()
                })
            }

            // add to ips list
            if (typeof this._ips[ip] == 'undefined') this._ips[ip] = []
            this._ips[ip].push(id)

            // kick if to many concurrent
            if (this._ips[ip].length >= Settings.maxConcurrent) {
                ws.close()
                log(ip, `too many concurrent connections`)
            }

            this._list[id] = ws

            // propagate counter
            this._count++
            this.update()
        },
        close(ws) {
            // propagate counter
            if (!ws.visibility) this._invisible--
            this._count--
            this.update()
            delete this._list[ws.id]

            // free up nick
            if (ws.nick) {
                this._nicks[ws.nick] = false
            }

            // free up ip slot
            let index = this._ips[ws.ip].indexOf(ws.id)
            if (index != -1) this._ips[ws.ip].splice(index, 1)
        },
        visibility(ws, visible) {
            if (ws.visibility && !visible) {
                this._invisible++
                // log(' ', this.counter(), '\t', `(${this.invisible()}) -`, ws.id)
            } else if (!ws.visibility && visible) {
                this._invisible--
                // log(' ', this.counter(), '\t', `(${this.invisible()}) +`, ws.id)
            }
            ws.visibility = visible
            this.update()
        },
        nick(ws, nick) {
            if (!this._nicks[nick]) {
                this._nicks[nick] = true
                this._nicks[ws.nick] = false
                ws.nick = nick
                return true
            } else {
                return false
            }
        },
        warn(ws, message = `Nie spam bo timeout`) {
            ws.warns++
            this._warns[ws.ip] = ws.warns

            ws.feedback(`${message} (${ws.warns}/${Settings.maxWarns} ostrzeżeń)`)

            if (ws.warns >= Settings.maxWarns) {
                ws.feedback(`No i masz timeout (${Settings.timeoutDuration / 1e3}s)`)
                this.timeout(ws, 30e3)
            }
        },
        timeout(ws, time) {
            this._timeouts[ws.ip] = ws.timeout = new Date(new Date().getTime() + (time))
            this._warns[ws.ip] = ws.warns = 0
            log(ws.id, 'timeout')
        },
        update() {
            let change = Math.abs(this._count - this._last)
            if (
                change >= Settings.hysteria ||    // allow hysteria
                this._count <= 5 && // precision at low counts
                change > 0  // dont send on no change
            ) {
                this._last = this._count
                this.broadcast({
                    type: 'count',
                    count: this._count,
                    invisible: this._invisible
                })
                // log(' ', this.counter(), '\t', `(${this.invisible()})`)
            }
        },
        broadcast(data) {
            // wss.broadcast(JSON.stringify(data))
            for (let id in this._list) {
                this._list[id].send(data)
            }
        }
    }

// function sendObject(ws, object) {
//     return ws.send(JSON.stringify(object))
// }

function log(...message) {
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}

wss.on('connection', function connection(ws, req) {
    Sockets.open(ws, req.headers['x-real-ip'])

    log('+', Sockets._count, '\t', ws.id, req.headers['x-real-ip'])

    ws.send({
        type: 'sync.begin'
    })

    ws.send({
        type: 'count',
        count: Sockets._count,
        invisible: Sockets._invisible
    })

    ws.send({
        type: 'version',
        version: package.version
    })

    ws.send({
        type: 'id',
        id: ws.id
    })

    ws.on('close', function () {
        Sockets.close(ws)
        log('-', Sockets._count, '\t', ws.id, req.headers['x-real-ip'])
    })

    ws.on('message', function (e) {

        var data = JSON.parse(e),
            now = new Date()

        function message(content) {
            Sockets.broadcast({
                type: 'chat',
                nick: ws.nick,
                // role: ws.ip.startsWith('10.0') ? 'owner' : undefined,
                role: ws.role,
                id: ws.id,
                content: content,
                time: now
            })
        }

        if (data.type == 'sync.received') {
            ws.send({
                type: 'sync.end',
                time: Date.now()
            })
        } else if (data.type == 'visibility') {
            Sockets.visibility(ws, data.visible)
        } else if (data.type == 'chat') {

            log(' \t', ws.id, ws.nick, '>', data.content)

            if (ws.role !== 'owner') {
                // calculate message delta
                let delta = process.hrtime(ws.lastMessage),
                    burst = Settings.burst,
                    release = Settings.release

                delta = (delta[0] + delta[1] / 1e9)

                // count bursts
                if (delta < release) {
                    ws.burst++
                } else {
                    ws.burst = 0
                }
                ws.lastMessage = process.hrtime()

                // kick for flooding
                if (ws.burst > Settings.burst * 3)
                    ws.close()

                // discard
                // ws timed out
                if (new Date() < Sockets._timeouts[ws.ip]) {
                    ws.feedback(`Trzeba było nie spamić (timeout do ${ws.timeout.toTimeString().slice(0, 8)})`)
                    return
                }

                // discard and warn
                // too fast messages
                if (delta < release && ws.burst > burst) {
                    Sockets.warn(ws)
                    return
                }

                // discard
                // content too long or too short
                if ((data.content.length > Settings.messageMax) || (data.content.length < 1)) {
                    ws.feedback('Wiadomość musi zawierać od 1 do 120 znaków')
                    return
                }

                // discard and warn 
                // repetitive spam
                if (ws.latest.indexOf(data.content) != -1) {
                    Sockets.warn(ws, `Może coś nowego napisz`)
                    return
                }
                ws.latest.push(data.content)
                if (ws.latest.length > 2) ws.latest.shift()

                // discard and warn
                // blacklisted words
                if (new RegExp([
                    'http',
                    '://',
                    '.com',
                    '.gg',
                    '.pl'
                ].join("|")).test(data.content)) {
                    Sockets.warn(ws, `Nie`)
                    return
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
            }

            // command parsing
            if (data.content.startsWith('/')) {

                var arg = data.content.split(' ')

                arg[0] = arg[0].slice(1)

                switch (arg[0]) {
                    case 'nick':
                        if(typeof arg[1] == "string")
                        if(arg[1].length > 0)
                        if (arg[1].length > Settings.nickLimit) {
                            // invalid nick length
                            ws.feedback(`Nick musi mieć między 1 a ${Settings.nickLimit} znaków`)

                        } else if (new RegExp([
                            'mathias',
                            'malina',
                            'admin',
                            'serwer',
                            'root',
                            'local'
                        ].join("|"), 'i').test(arg[1])) {
                            // reserved nick
                            ws.feedback('Nie możesz użyć tego nicku')

                        } else if (/[^\x00-\x7Fążśźęćń€łóĄŻŚŹĘĆŃÓŁ]/.test(data.content)) {
                            // invalid character
                            ws.feedback(`Nick nie może zawierać znaków specjalnych`)
                            return

                        } else {
                            if (Sockets.nick(ws, arg[1])) {
                                ws.feedback(`Zmieniono nick na '${arg[1]}'`)
                            } else {
                                ws.feedback('Ten nick jest zajęty')
                            }
                        }

                        break;
                    case 'login':
                        if (process.env[`pwd_${arg[1]}`])
                            if (arg[2] === process.env[`pwd_${arg[1]}`]) {
                                Sockets.nick(ws, arg[1])
                                ws.role = 'owner'
                                ws.feedback(`Zalogowano jako ${arg[1]}`)
                            }
                        break;
                }
            } else {
                message(data.content)
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