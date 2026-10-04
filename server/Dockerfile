FROM node:24.12.0

WORKDIR /app

COPY ./app/package*.json ./
RUN npm install

COPY ./app .

RUN chown -R node:node /app

USER node

EXPOSE 18787

CMD ["npm", "run", "dev"]
