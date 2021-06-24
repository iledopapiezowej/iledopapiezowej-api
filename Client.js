import levenstein from 'js-levenshtein'

import Connections from './Connections.js'
import Settings from './Settings.js'
function log(...message) {
    console.log(new Date().toLocaleTimeString('pl-PL'), ...message)
}
class Client {
    constructor(ws, req) {

        ws.client = this

        this.ws = ws
        this.req = req

        let id = Math.random().toString(36).slice(2, 9)    // 7 character id

        this.id = id
        this.ip = req.headers['x-real-ip']

        if(req.headers['cf-connecting-ip']){
            this.ip = req.headers['cf-connecting-ip']
        }

        this.nick = 'anon_' + id  // anon + 7 chars of id
        this.nickPad = function () { return ' '.repeat(Settings.nickLimit - this.nick.length) + this.nick }
        this.visibility = true
        this.role = null
        // this.role = this.ip.startsWith('10.0') ? 'owner' : undefined
        this.ready = false

        this.burstCount = 0
        this.warns = Connections.warns[this.ip] ? Connections.warns[this.ip] : 0
        this.timedOut = Connections.timeouts[this.ip] ? Connections.timeouts[this.ip] : new Date()
        this.lastMessageTime = [1, 1]
        this.latestMessages = ['', '', '']
        this.messageDelta = Infinity

        this.captchaStatus = {
            verified: false,
        }

        Connections.open(this)

        this.resetHeartbeat()

        this.ready = true
    }

    resetHeartbeat(){
        clearInterval(this.heartbeat)
        this.heartbeat = setInterval(() => {
            this.transmit({
                type: 'sync.begin',
                heartbeat: true
            })
        }, 30e3)
    }

    end(code, reason) {
        this.ws.close(code, reason)
        clearInterval(this.heartbeat)
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
        // ip banned
        if (Connections.bans[this.ip]) {
            this.feedback(`Trzeba było nie spamić (timeout do ${this.timedOut.toTimeString().slice(0, 8)})`)
        }

        // ws timed out
        if (new Date() < this.timedOut) {
            this.feedback(`Trzeba było nie spamić (timeout do ${this.timedOut.toTimeString().slice(0, 8)})`)
            return false
        }

        // discard and warn
        // too fast messages
        if (this.burstCount == Settings.burst) {
            this.warn("Zwolnij")
        }

        if (this.burstCount > Settings.burst) {
            this.warn("Za dużo wiadomości")
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
        // if (this.latestMessages.indexOf(message) != -1) {
        //     this.warn("Może coś nowego napisz")
        //     return false
        // }


        // keep latest sent messages
        this.latestMessages.push(message)
        if (this.latestMessages.length > 3) this.latestMessages.shift()

        let
            l = {
                ab: levenstein(this.latestMessages[0], this.latestMessages[1]),
                ac: levenstein(this.latestMessages[0], this.latestMessages[2]),
                bc: levenstein(this.latestMessages[1], this.latestMessages[2]),
            },
            avg = {
                ab: ((this.latestMessages[0].length + this.latestMessages[1].length) / 2),
                ac: ((this.latestMessages[0].length + this.latestMessages[2].length) / 2),
                bc: ((this.latestMessages[1].length + this.latestMessages[2].length) / 2),
            },
            calc = {
                ab: l.ab / avg.ab,
                ac: l.ac / avg.ac,
                bc: l.bc / avg.bc,
            }

        this.messageOffsetAvg = ((calc.ab + calc.ac + calc.bc) / 3).toFixed(2)
        this.messageOffsetMin = (Math.min(calc.ab, calc.ac, calc.bc)).toFixed(2)

        // discard and warn
        // spam
        if (this.messageOffsetAvg <= .66) {
            this.warn("we we nie spam")
            return true
        }

        // discard and warn
        // blacklisted words
        if (new RegExp([
            'http',
            ':\/\/',
            '\\.com',
            '\\.gg',
            '\\.pl'
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

        let payload = {
            type: 'chat',
            nick: this.nick,
            role: this.role,
            id_user: this.id,
            id_message: Math.random().toString(36).slice(2, 9),
            content: message,
            time: new Date()
        }

        Connections.cacheMessage(payload)
        Connections.broadcast(payload)

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
            this.timeout(`No i masz timeout`, 30e3)
        }
    }

    timeout(message, time) {
        Connections.timeout(this, time)
        this.feedback(message)
    }

    requestCaptcha(action = 'general') {
        return new Promise((resolve, reject) => {
            this.transmit({
                type: 'captcha',
                action
            })
            this.awaitCaptcha = { resolve, reject }

            setTimeout(() => {
                reject(`Request for captcha timed out`)
            }, 3e3)
        })
    }
}

export default Client