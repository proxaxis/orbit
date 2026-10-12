FROM node:24.12.0

WORKDIR /app

COPY ./app/package*.json ./

RUN npm install

COPY ./app .

RUN chown -R node:node /app

RUN mkdir -p /app/.realm

RUN chown -R node:node /app/.realm

EXPOSE 8787
EXPOSE 18787

USER node

CMD ["npm", "run", "dev"]
