FROM node:18-alpine as production

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY . .

RUN pnpm build

EXPOSE 2137

HEALTHCHECK --interval=1m --timeout=3s \
  CMD curl --include --no-buffer \
    -H "Connection: close" \
    -H "Upgrade: websocket" \
    http://localhost:2137

ENTRYPOINT [ "node", "." ]


FROM production as testing

RUN pnpm install --frozen-lockfile

