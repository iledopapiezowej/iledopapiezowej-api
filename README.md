# iledopapiezowej.pl-API

API for iledopapiezowej.pl

node -v `v16.13.0`
yarn -v `1.22.17`

client ip `in x-real-ip` or `cf-connecting-ip`

`yarn run dev | pino-pretty` for log formatting

## env

```ini
PORT_API=
PORT_WS=

MAX_CONCURRENT=5

CHAT_MAX_WARNS=5
CHAT_TIMEOUT_DURATION=30e3
CHAT_MAX_NICK=12
CHAT_MAX_MESSAGE=120
CHAT_BURST=3
CHAT_RELEASE=3
CHAT_RESERVED=local root serwer admin

COUNT_HYSTERIA=2

RECAPTCHA_SECRET=
```
