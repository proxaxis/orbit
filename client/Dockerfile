FROM node:24.12.0

WORKDIR /app

COPY ./app/package*.json ./

RUN npm install

COPY ./app .

RUN npm run build

RUN chown -R node:node /app

USER node

EXPOSE 5173
EXPOSE 15173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "15173"]
