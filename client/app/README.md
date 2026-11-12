# Orbit Calendar client (Quasar)

Google カレンダーと同期する PWA/ネイティブカレンダーアプリのクライアント.
Quasar(@quasar/app-vite)+ Vue 3 + Pinia + Vue Router. `client_v1`(Vite 製)からの移行版.

## Install the dependencies

```bash
npm install
```

## Start the app in development mode (HMR, error reporting, etc.)

```bash
npm run dev   # quasar dev → http://localhost:9000
```

## Run tests

```bash
npm test      # vitest run(jsdom, tests/setup.js で TZ=Asia/Tokyo 固定)
```

## Build the app for production

```bash
npm run build            # quasar build → dist/spa + dist/spa/sw.js(Service Worker)
npm run build:capacitor  # quasar build -m capacitor -T android → src-capacitor/www
```

## Format & Lint

```bash
npm run format       # oxfmt(src/, tests/)
npm run lint:check   # oxfmt --check && oxlint
```
