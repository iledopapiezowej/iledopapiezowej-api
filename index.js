import express from "express"
import bodyParser from "body-parser"
import websocket from 'ws'
import axios from 'axios'
import fs from 'fs'

import dotenv from 'dotenv'
dotenv.config()

// import Database from './Database.js'
import Settings from './Settings.js'
import Connections from './Connections.js'
import Client from './Client.js'
import Discord from './Discord.js'

const app = express(),
    wss = new websocket.Server({ port: Settings.wsPort }),
    PORT_API = Settings.apiPort,
    pkg = JSON.parse(fs.readFileSync('package.json')),
    Creds = {}

fs.readdirSync('./auth').forEach(c => {
    c = c.split('.')[0]
    Creds[c] = JSON.parse(fs.readFileSync(`./auth/${c}.json`))
});

function log(...message) {
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}

async function getCaptcha(client, token) {
    let res = await axios.post('https://www.google.com/recaptcha/api/siteverify', undefined, {
        params: {
            secret: Creds.recaptcha.secret,
            response: token,
            remoteip: client.ip
        }
    })

    client.captchaStatus = {
        ...client.captchaStatus,
        ...res.data
    }

    return res
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
            version: pkg.version,
            supports: pkg.supports
        },
        {
            type: 'id',
            id: client.id
        },
        {
            type: 'cachedMessages',
            messages: Connections.cachedMessages
        }
    ])

    ws.on('close', function (code, reason) { client.close(code, reason) })

    ws.on('message', async function (payload) {

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
        if (delta < Settings.release) client.burstCount++
        else client.burstCount = 0

        client.lastMessage = process.hrtime()
        client.messageDelta = delta

        // kick for flooding
        if (client.burstCount > Settings.burstCount * 3)
            client.end(4002, "Flooding")

        // Payload parsing

        // time synchronisation
        if (data.type == 'sync.received') {
            client.transmit({
                type: 'sync.end',
                time: Date.now(),
                heartbeat: data.heartbeat
            })
        }

        // page visibility status
        if (data.type == 'visibility') {
            Connections.visibility(client, data.visible)
        }

        if (data.type == 'captcha') {
            if (client.awaitCaptcha) {
                client.awaitCaptcha.resolve(data.token)
            }
        }

        // chat message
        if (data.type == 'chat') {

            if (typeof data.content != 'string') return

            if (!client.captchaStatus.verified) {
                let res = await client.requestCaptcha('chat')
                    .catch(err => log(`${client.id} @ ${client.ip} failed to provide captcha:`, err))
                    .then(token => getCaptcha(client, token))

                if (res.data.success) {
                    if (res.data.score > .75) {
                        client.captchaStatus.verified = true
                        client.burstCount = 0
                        console.log(res.data.score)

                    } else {
                        log(`Insufficient captcha`, client.id, client.ip, res.data.score)
                        return client.feedback(`Nie osiągnięto wymagań captcha`)
                    }

                } else return client.feedback(`Błąd weryfikacji captcha`)

            }

            if (data.content.startsWith('/')) { // command parsing
                let arg = data.content.split(' ')   // split with spaces
                arg[0] = arg[0].slice(1)    // remove slash

                client.command(arg)

            } else {    // chat parsing
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

app.get("/discord/oauth", (req, res) => {
    // res.json({ status: 'ok', comment: "code granted" });

    axios.request({
        method: 'POST',
        url: 'https://discord.com/api/oauth2/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({
            client_id: Creds.discord.app_id,
            client_secret: Creds.discord.client_secret,
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: Creds.discord.redirect_uris[0],
            scope: "identify"
        })
    }).then(function (response) {
        let dc = new Discord({}, response.data.access_token)
        dc.me().then(self => {
            res.cookie('dc-id', self.id)
            res.cookie('dc-token', 'aijnlmnsdioqwnlk')
            res.redirect(302, '/ustawienia#discord')
        })

    }).catch(function (error) {
        console.error(error);
    });

});

app.listen(PORT_API, () => {
    console.log(`Server is running on port ${PORT_API}.`);
});