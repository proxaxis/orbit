# Orbit: Unify Your Tasks and Time. Execute with Focus.

### 環境変数
以下の 3 つのファイルを用意:

* `./.env`
* `./client/app/.env`
* `./server/app/.env`

コンテナ用環境変数には以下の内容を書き込み:
```.env
CLOUDFLARE_TUNNEL_TOKEN=<Cloudflare Tunnel Token>
RELEASE_VERSION=<Release Version for Production>
```

クライアント用環境変数には以下の内容を書き込み:
```.env
VITE_BFF_BASE_URL=http://localhost:8787
VITE_GOOGLE_CALENDAR_API_BASE_URL=https://www.googleapis.com/calendar/v3
VITE_GOOGLE_PEOPLE_API_BASE_URL=https://people.googleapis.com/v1
```

サーバ用環境変数には以下の内容を書き込み:
```.env
# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=<Google OAuth Client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth Client Secret>
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/callback

# BFF Session and Encryption Key
SESSION_SECRET=<Session and Encryption Key>

CLIENT_URL=http://localhost:5173
SERVER_PORT=8787

# Database Configuration
REDIS_HOST=redis
REDIS_PORT=6379
```

### 本番環境の実行
開発サーバと重複しないようにポート番号とプロジェクト名を分けて起動する:
```bash
docker compose -p orbit-prod -f prod.docker-compose.yml up -d
```
