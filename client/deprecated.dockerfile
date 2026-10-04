FROM node:24.12.0

WORKDIR /app

RUN chown -R node:node /app

USER node

EXPOSE 5173

RUN npm install

#CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
CMD ["sleep", "infinity"]
