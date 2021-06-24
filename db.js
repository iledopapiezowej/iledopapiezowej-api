const mongoose = require('mongoose'),
    credentials = require('./creds-mongo.json'),
    crypto = require('crypto')

mongoose.connect("mongodb://10.0.0.2:27017/iledopapiezowej", {
    auth: credentials.auth,
    user: credentials.user,
    pass: credentials.pass,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
});
var database = mongoose.connection

database.on('error', err => {
    throw err
});
database.once('open', () => {
    console.log(`DB connected`)
});

var User = mongoose.model('User', new mongoose.Schema({
    id: String,
    username: String,
    nickname: String,
    roles: Array,
    socials: {
        discord: {
            user: {
                id: Number,
                username: String,
                avatar: String,
                discriminator: Number,
                public_flags: Number
            },
            grant: {
                scopes: Array,
                expires: Date,
                access: String,
                refresh: String
            }
        }
    }
}, { collection: 'users', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }))

module.exports = {
    users: {
        get() { },
        add(data) {
            User.create({
                id: crypto.randomBytes(16).toString("hex"),
                username: data.username,
                nickname: null,
                roles: [],
                socials: {
                    discord: {
                        user: data.discord.user,
                        grant: {
                            scopes: data.discord.scopes,
                            expires: data.discord.expires,
                            access: data.access,
                            refresh: data.refresh
                        }
                    }
                }
            }).then(user => {
                console.log(user.name)
            })
        }
    }
}