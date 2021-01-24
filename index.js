const express = require("express"),
    bodyParser = require("body-parser"),
    websocket = require('ws'),
    package = require('./package')

const app = express(),
    wss = new websocket.Server({ port: 5502 }),
    Sockets = {
        _count: 0,
        _last: 0,
        _list: {},
        _ips: {},
        open(ws, ip) {

            let id = (new Date()).getTime().toString(36)

            ws.id = id
            ws.visibility = true
            ws.ip = ip

            if(typeof this._ips[ip] == 'undefined') this._ips[ip] = []

            if(this._ips[ip].length >= 2) {
                ws.close()
                log(ip, `too many concurrent connections`)
            }

            this._list[id] = ws
            this._ips[ip].push(id)
            this.count(1)
        },
        close(ws) {
            if (ws.visibility) this.count(-1)
            delete this._list[ws.id]

            let index = this._ips[ws.ip].indexOf(ws.id)
            if(index != -1) this._ips[ws.ip].splice(index, 1)
        },
        count(n) {
            this._count += n
            this.broadcast()
        },
        counter() {
            return this._count
        },
        visibility(ws, visible) {
            if (ws.visibility && !visible) {
                this.count(-1)
                console.log(new Date().toLocaleTimeString('pl-PL'), '-', Sockets.counter(), ws.id)
            } else if (!ws.visibility && visible) {
                this.count(1)
                console.log(new Date().toLocaleTimeString('pl-PL'), '+', Sockets.counter(), ws.id)
            }
            ws.visibility = visible
        },
        broadcast() {
            if (Math.abs(this._count - this._last) > 0)
                for (let id in this._list) {
                    sendObject(this._list[id], {
                        type: 'count',
                        count: this._count
                    })
                }
        }
    }

function sendObject(ws, object) {
    return ws.send(JSON.stringify(object))
}

function log(...message){
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}

wss.on('connection', function connection(ws, req) {
    Sockets.open(ws, req.headers['x-real-ip'])

    log(new Date().toLocaleTimeString('pl-PL'), '+', Sockets.counter(), ws.id, req.headers['x-real-ip'])

    sendObject(ws, {
        type: 'sync.begin'
    })

    ws.on('close', function () {
        Sockets.close(ws)
        log(new Date().toLocaleTimeString('pl-PL'), '-', Sockets.counter(), ws.id, req.headers['x-real-ip'])
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

const PORT = process.env.PORT || 5501;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});