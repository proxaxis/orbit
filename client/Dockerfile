FROM node:26.13.1

ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN apt-get update && apt-get install -y \
    default-jdk \
    wget \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p $ANDROID_HOME/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d $ANDROID_HOME/cmdline-tools && \
    mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && \
    rm /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses && \
    sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

RUN npm install -g @quasar/cli

WORKDIR /app
RUN mkdir -p /app/node_modules /app/src-capacitor/node_modules && \
    chown -R node:node /app $ANDROID_HOME

USER node

COPY --chown=node:node ./app/package*.json ./
RUN npm install

COPY --chown=node:node ./app/ ./

EXPOSE 9000
EXPOSE 9222
