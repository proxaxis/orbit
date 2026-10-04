FROM node:24.12.0

WORKDIR /app

RUN chown -R node:node /app

USER node

EXPOSE 8787

#CMD ["npm", "run", "dev"]
CMD ["sleep", "infinity"]
