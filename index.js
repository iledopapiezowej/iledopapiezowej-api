const express = require("express"),
    bodyParser = require("body-parser"),
    websocket = require('ws'),
    package = require('./package'),
    dotenv = require('dotenv').config()

const app = express(),
    wss = new websocket.Server({ port: process.env.PORT_WS || 5502 }),
    PORT_API = process.env.PORT_API || 5501,
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

            let id = (new Date()).getTime().toString(36)

            ws.id = id
            ws.visibility = true
            ws.ip = ip
            ws.nick = 'anon'
            ws.burst = 0
            ws.warns = Sockets._warns[ip] ? Sockets._warns[ip] : 0
            ws.timeout = new Date()
            ws.role = undefined

            if (typeof this._ips[ip] == 'undefined') this._ips[ip] = []

            if (this._ips[ip].length >= (process.env.MAX_CONCURRENT || 15)) {
                ws.close()
                log(ip, `too many concurrent connections`)
            }

            this._list[id] = ws
            this._ips[ip].push(id)
            this._count++
            this.update()
        },
        close(ws) {
            if (!ws.visibility) this._invisible--
            this._count--
            this.update()
            delete this._list[ws.id]
            if (ws.nick) {
                this._nicks[ws.nick] = false
            }

            let index = this._ips[ws.ip].indexOf(ws.id)
            if (index != -1) this._ips[ws.ip].splice(index, 1)
        },
        invisible() {
            return this._invisible
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
        warn(ws, n) {
            if (n) ws.warns = n
            else ws.warns++
            this._warns[ws.ip] = ws.warns
        },
        timeout(ws) {
            this._timeouts[ws.ip] = new Date(new Date().getTime() + (30e3))
            this.warn(ws, 0)
        },
        update() {
            let change = Math.abs(this._count - this._last)
            if (
                change >= (process.env.HYSTERIA || 5) ||    // allow hysteria
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
            for (let id in this._list) {
                sendObject(this._list[id], data)
            }
        }
    }

function sendObject(ws, object) {
    return ws.send(JSON.stringify(object))
}

function log(...message) {
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}

wss.on('connection', function connection(ws, req) {
    Sockets.open(ws, req.headers['x-real-ip'])

    log('+', Sockets._count, '\t', ws.id, req.headers['x-real-ip'])

    sendObject(ws, {
        type: 'sync.begin'
    })

    ws.on('close', function () {
        Sockets.close(ws)
        log('-', Sockets._count, '\t', ws.id, req.headers['x-real-ip'])
    })

    ws.on('message', function (e) {
        function message(content) {
            ws.lastMessage = process.hrtime()
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

        var data = JSON.parse(e),
            now = new Date(),
            maxWarns = 5

        if (data.type == 'sync.received') {
            sendObject(ws, {
                type: 'sync.end',
                time: Date.now()
            })
        } else if (data.type == 'visibility') {
            Sockets.visibility(ws, data.visible)
        } else if (data.type == 'chat') {
            log(' \t', ws.id, ws.nick, '>', data.content)
            if (new Date() < Sockets._timeouts[ws.ip]) {
                sendObject(ws, {
                    type: 'chat',
                    nick: 'serwer',
                    role: 'root',
                    content: 'Trzeba było nie spamić',
                    time: now
                })
                return
            }

            let delta = process.hrtime(ws.lastMessage),
                burst = process.env.CHAT_BURST || 3,
                release = process.env.CHAT_RELEASE || 0.8

            delta = (delta[0] + delta[1] / 1e9)

            if (delta < release) {
                ws.burst++
            } else {
                ws.burst = 0
            }

            if (delta < release && ws.burst > burst) {
                Sockets.warn(ws)
                if (ws.warns > maxWarns) {
                    sendObject(ws, {
                        type: 'chat',
                        nick: 'serwer',
                        role: 'root',
                        content: 'No i masz timeout',
                        time: now
                    })
                    Sockets.timeout(ws)
                } else {
                    sendObject(ws, {
                        type: 'chat',
                        nick: 'serwer',
                        role: 'root',
                        content: `Nie spam, bo timeout (${ws.warns}/${maxWarns})`,
                        time: now
                    })
                }

                return
            }

            if ((data.content.length > (process.env.CHAT_MESSAGE || 120)) || (data.content.length < 1)) {
                sendObject(ws, {
                    type: 'chat',
                    nick: 'serwer',
                    role: 'root',
                    content: 'Wiadomość musi zawierać od 1 do 120 znaków',
                    time: now
                })
                return
            }

            if (data.content.startsWith('/')) {
                var arg = data.content.split(' '),
                    nickLimit = 12

                arg[0] = arg[0].slice(1)

                switch (arg[0]) {
                    case 'nick':
                        if (arg[1].length > nickLimit) {
                            sendObject(ws, {
                                type: 'chat',
                                nick: 'serwer',
                                role: 'root',
                                content: `Nick może mieć maksymalnie ${nickLimit} znaków`,
                                time: now
                            })
                        } else if (new RegExp([
                            'mathias',
                            'admin',
                            'serwer',
                            'root',
                            'local'
                        ].join("|")).test(arg[1])) {
                            sendObject(ws, {
                                type: 'chat',
                                nick: 'serwer',
                                role: 'root',
                                content: 'Nie możesz używać tego specjalnego nicku',
                                time: now
                            })
                        } else {
                            if (Sockets.nick(ws, arg[1])) {
                                sendObject(ws, {
                                    type: 'chat',
                                    nick: 'serwer',
                                    role: 'root',
                                    content: `Zmieniono nick na '${arg[1]}'`,
                                    time: now
                                })
                            } else {
                                sendObject(ws, {
                                    type: 'chat',
                                    nick: 'serwer',
                                    role: 'root',
                                    content: 'Ten nick jest zajęty',
                                    time: now
                                })
                            }
                        }
                        break;
                    case 'login':
                        if (arg[2] === process.env[`pwd_${arg[1]}`]) {
                            Sockets.nick(ws, arg[1])
                            ws.role = 'owner'
                        }
                        break;
                    case 'timeout':
                        if ([
                            'owner',
                            'admin',
                            'mod'
                        ].includes(ws.role)) {

                        }
                        break;
                }
            } else {
                message(data.content)
            }
        }
    })

    sendObject(ws, {
        type: 'count',
        count: Sockets._count,
        invisible: Sockets._invisible
    })

    sendObject(ws, {
        type: 'version',
        version: package.version
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