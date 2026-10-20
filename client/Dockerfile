FROM node:24.12.0

WORKDIR /app

RUN mkdir -p /app/node_modules && chown -R node:node /app

USER node

COPY --chown=node:node ./app/ ./

RUN npm install

EXPOSE 5173

EXPOSE 15173

CMD ["npm", "run", "dev"]
