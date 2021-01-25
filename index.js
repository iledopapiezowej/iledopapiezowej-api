const express = require("express"),
    bodyParser = require("body-parser"),
    websocket = require('ws'),
    package = require('./package')

const app = express(),
    wss = new websocket.Server({ port: process.env.PORT_WS || 5502 }),
    PORT_API = process.env.PORT_API || 5501,
    Sockets = {
        _count: 0,
        _invisible: 0,
        _last: 0,
        _list: {},
        _ips: {},
        open(ws, ip) {

            let id = (new Date()).getTime().toString(36)

            ws.id = id
            ws.visibility = true
            ws.ip = ip

            if (typeof this._ips[ip] == 'undefined') this._ips[ip] = []

            if (this._ips[ip].length >= (process.env.MAX_CONCURRENT || 15)) {
                ws.close()
                log(ip, `too many concurrent connections`)
            }

            this._list[id] = ws
            this._ips[ip].push(id)
            this._count++
            this.broadcast()
        },
        close(ws) {
            if (!ws.visibility) this._invisible--
            this._count--
            this.broadcast()
            delete this._list[ws.id]

            let index = this._ips[ws.ip].indexOf(ws.id)
            if (index != -1) this._ips[ws.ip].splice(index, 1)
        },
        counter() {
            return this._count
        },
        invisible() {
            return this._invisible
        },
        visibility(ws, visible) {
            if (ws.visibility && !visible) {
                this._invisible++
                log(' ', this.counter(), '\t', `(${this.invisible()}) -`, ws.id)
            } else if (!ws.visibility && visible) {
                this._invisible--
                log(' ', this.counter(), '\t', `(${this.invisible()}) +`, ws.id)
            }
            ws.visibility = visible
            this.broadcast()
        },
        broadcast() {
            let change = Math.abs(this._count - this._last)
            if (
                change >= (process.env.HYSTERIA || 5) ||    // allow hysteria
                this._count <= 5 && // precision at low counts
                change > 0  // dont send on no change
            ) {
                this._last = this._count
                for (let id in this._list) {
                    sendObject(this._list[id], {
                        type: 'count',
                        count: this._count
                    })
                }
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

    log('+', Sockets.counter(), '\t', ws.id, req.headers['x-real-ip'])

    sendObject(ws, {
        type: 'sync.begin'
    })

    ws.on('close', function () {
        Sockets.close(ws)
        log('-', Sockets.counter(), '\t', ws.id, req.headers['x-real-ip'])
    })

    ws.on('message', function (e) {
        let data = JSON.parse(e)

        if (data.type == 'sync.received') {
            sendObject(ws, {
                type: 'sync.end',
                time: Date.now()
            })
        } else if (data.type == 'visibility') {
            Sockets.visibility(ws, data.visible)
        }
    })

    sendObject(ws, {
        type: 'count',
        count: Sockets.counter()
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