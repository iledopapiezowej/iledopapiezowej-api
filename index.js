const express = require("express"),
    bodyParser = require("body-parser");

const app = express(),
    mongoose = require("mongoose")

mongoose.connect("mongodb://odin.home.mathew.pl:27017/iledopapiezowej", {
    auth: { "authSource": "admin" },
    user: "admin",
    pass: "admin",
    useNewUrlParser: true,
    useUnifiedTopology: true
});
db = mongoose.connection

db.on('error', err => {
    throw err
});
db.once('open', () => {
    console.log(`DB connected`)
});

var gameSchema = new mongoose.Schema({
    nick: String,
    time: Number,
    points: Number,
    score: Number,
    uuid: String,
    address: String,
    useragent: String,
    timestamp: Date
}, { collection: 'papiezgame' })

var Game = mongoose.model('Game', gameSchema)

function count(str) {
    const re = /[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-]/g
    return ((str || '').match(re) || []).length
}

var live = {
        _list: [],
        add(uuid) {
            if (this._list.indexOf(uuid) == -1) this._list.push(uuid)
            return this.count()
        },
        remove(uuid) {
            index = this._list.indexOf(uuid)
            if (index != -1) this._list.splice(index, 1)
            return this.count()
        },
        count() {
            return this._list.length
        }
    },
    uuids = {}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/live/update", (req, res) => {
    var uuid = req.body.uuid,
        url = req.body.url

    const offline = () => {
            user.online = false
            live.remove(uuid)
            console.log(live.count(), user.uuid)
        },
        timeout = 5e3

    if (uuid.length != 12 ||
        count(uuid) != 12
    ) {
        res.status(400).end()
        return
    }

    user = uuids[uuid]

    if (typeof user == 'undefined') {
        var user = {
            uuid: uuid,
            ip: req.headers['x-real-ip'],
            online: false,
            url: '',
            timeout: setTimeout(offline, timeout)
        }
        uuids[uuid] = user
    }

    user.online = true
    user.url = url

    live.add(uuid)
    clearTimeout(user.timeout)
    user.timeout = setTimeout(offline, timeout)

    console.log(live.count(), user.uuid, user.url)

    res.json({
        uuid: req.params.uuid,
        online: true,
        counter: live.count(),
        comment: `ok`
    });


});

app.get("/live/counter", (req, res) => {
    res.json({
        counter: live,
        comment: `ok`
    });
});

app.post("/scoreboard/save", (req, res) => {
    var nick = req.body.nick.toUpperCase(),
        time = req.body.time,
        points = req.body.points,
        score = req.body.score,
        uuid = req.body.uuid

    if (uuid.length != 12 ||
        count(uuid) != 12 ||
        nick.length > 10 ||
        count(nick) != nick.length ||
        typeof time != 'number' ||
        typeof points != 'number' ||
        typeof score != 'number'
    ) {
        res.status(400).end()
        return
    }

    db.collection('papiezgame').insertOne(new Game({
        nick: nick,
        time: time,
        points: points,
        score: score,
        uuid: uuid,
        address: req.headers['x-real-ip'],
        useragent: req.headers['user-agent'],
        timestamp: new Date()
    }))

    res.json({
        nick: nick,
        comment: `ok`
    });
});

app.get("/scoreboard/top", (req, res) => {
    Game.find({}).select('nick score -_id').sort({ score: -1 }).limit(10).exec(function(err, top) {
        res.json({
            list: top,
            comment: `top 10 wyników`
        });
    })
});

app.get("/scoreboard/nick/:nick", (req, res) => {
    Game.find({ name: req.params.name }, function(err, wynik) {
        res.json({
            score: wynik.score,
            comment: `ok`
        });
    })
});

app.get("/scoreboard/whereami", (req, res) => {
    var score = req.query.score || 0
    Game.estimatedDocumentCount({}, function(err, total) {
        Game.countDocuments({ score: { $lt: score } }, function(err, lt) {
            res.json({
                percentage: lt / total * 100,
                comment: `top %`
            });
        })
    })
});

app.get("/dump", (req, res) => {
    var subnet = '10.0'
    if (!req.headers['x-real-ip'].startsWith(subnet)) {
        res.status(403).end()
        return
    }

    out = {
        live: live,
        uuids: uuids,
        comment: `ip ${req.headers['x-real-ip']} matches ${subnet}`
    }
    console.log(out)
    res.json(out);
});

app.get("/", (req, res) => {
    res.json({ comment: "Welcome to iledopapiezowej.pl API" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});