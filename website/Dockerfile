FROM node:24.12.0

WORKDIR /app

RUN mkdir -p /app/node_mudules && mkdir -p /app/dist/server && chown -R node:node /app

USER node

COPY --chown=node:node ./app/ ./

RUN npm install && npm run build

EXPOSE 4321
EXPOSE 14321

CMD ["npm", "start"]
