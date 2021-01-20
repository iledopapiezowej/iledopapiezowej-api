const express = require("express"),
    bodyParser = require("body-parser"),
    websocket = require('ws');

const app = express(),
    wss = new websocket.Server({ port: 5502 }),
    Sockets = {
        _count: 0,
        _last: 0,
        _list: {},
        open(ws) {
            this._count++
            let id = (new Date()).getTime().toString(36)
            ws.id = id
            this._list[id] = ws
            this.broadcast()
        },
        close(ws) {
            this._count--
            delete this._list[ws.id]
            this.broadcast()
        },
        count() {
            return this._count
        },
        broadcast() {
            if (Math.abs(this._count - this._last) > 0)
                for (let id in this._list) {
                    this._list[id].send(this.count())
                }
        }
    }

wss.on('connection', function connection(ws, req) {
    Sockets.open(ws)

    console.log('+', Sockets.count(), ws.id, req.headers['x-real-ip'])

    // ws.on('message', function incoming(message) {
    //     console.log('received: ', message);
    // });

    ws.on('close', function () {
        Sockets.close(ws)
        console.log('-', Sockets.count(), ws.id, req.headers['x-real-ip'])
    })

    ws.send(Sockets.count());
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