FROM node:24.12.0

WORKDIR /app

COPY app/package*.json ./

RUN npm install

COPY ./app/ .

RUN chown -R node:node /app

RUN npm run build

EXPOSE 4321
EXPOSE 14321

USER node

CMD ["npm", "start"]
