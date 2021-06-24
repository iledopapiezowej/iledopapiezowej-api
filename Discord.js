import axios from 'axios'

class Discord {
    constructor(data, accessToken) {
        this.accessToken = accessToken ?? data?.accessToken
    }

    async me() {
        axios.get('https://discord.com/api/oauth2/@me', {
            headers: { Authorization: `Bearer ${this.accessToken}` }
        }).then(res => {
            this.self = res.data
            return res.data
        })
    }

}

export default Discord