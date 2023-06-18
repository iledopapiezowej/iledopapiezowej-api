FROM node:18 as production

WORKDIR /app

RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY . .

RUN pnpm build

EXPOSE 2137

HEALTHCHECK --interval=5m --timeout=1s \
  CMD curl --include --no-buffer \
    -H "Connection: close" \
    -H "Upgrade: websocket" \
    http://localhost:2137

ENTRYPOINT [ "node", "." ]


FROM production as testing

RUN pnpm install --frozen-lockfile

