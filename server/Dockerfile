FROM node:24.12.0

WORKDIR /app

RUN mkdir -p /app/node_modules && mkdir -p /app/.realm && chown -R node:node /app

USER node

COPY --chown=node:node ./app/ ./

RUN npm install

EXPOSE 8787
EXPOSE 18787

CMD ["npm", "run", "dev"]
