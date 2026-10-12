FROM node:24.12.0

WORKDIR /app

COPY app/package*.json ./

RUN npm install

COPY ./app/ .

RUN npm run build

RUN chown -R node:node /app

USER node

EXPOSE 4321
EXPOSE 14321

CMD ["node", "./dist/server/entry.mjs"]
