import mongoose from 'mongoose'

mongoose.connect("mongodb://10.0.0.2:27017/iledopapiezowej", {
    auth: { "authSource": "admin" },
    user: 'iledopapiezowej',
    pass: 'iledopapiezowej',
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

var Database = {

}

export default Database