FROM node:24.12.0

WORKDIR /app

COPY ./app/package*.json ./

RUN npm install

COPY ./app .

RUN chown -R node:node /app

EXPOSE 5173
EXPOSE 15173

USER node

RUN npm run build

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "15173"]
