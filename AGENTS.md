# Orbit Calendar リポジトリルート

Google カレンダーがバックエンドの PWA. `client/`(Vue3+Vite+Pinia), `server/`(BFF, Hono), `website/`(Astro LP)の3構成. 各 `app/AGENTS.md` に詳細あり. Git 管理されていないため差分はファイルで確認する.

## マークダウン記述ルール

- `。` は使わず `. ` を使う(後ろに空白)
- `「」` は使わず `""` を使う(前後に空白)
- `・` は使わず `や` や `または` などで表現
- 全角の `（）` は使わず半角の `()` を使う
- `**` 太字は基本使用しない

## docker compose をこの環境から実行するときの注意

この作業環境は `orbit_orchestrator` コンテナ内で, ホストのリポジトリ(`/home/me/devserver/orbit`)が `/ws` にマウントされている. `docker` CLI はホストのデーモンを操作するが, compose の相対パスは実行側(このコンテナ)のパスで解決される.

`docker compose -f docker-compose.development.yml up -d` を `/ws` からそのまま実行すると, `volumes: ./client/app:/app` が `/ws/client/app`(ホストに存在しないパス)として bind され, コンテナの `/app` が空になって起動失敗する. 必ず `--project-directory` でホスト側パスを指定すること:

```bash
docker compose -f docker-compose.development.yml \
  --project-directory /home/me/devserver/orbit up -d
```

(`/home/me/devserver/orbit` → `/ws` のシンボリックリンクをコンテナ内に作成済み. env_file もこの経路で読み取れる)

## dev スタックのポートと NODE_ENV

- `.env.development` は `NODE_ENV=production` を全サービスに注入する(BFF の必須変数検証や Realm 設定のため意図的).
- `client` の vite.config.js は `NODE_ENV=production` 時に 15173 で listen するため, dev 側は compose の `environment: NODE_ENV=development` で上書きし 5173 で起動させている.
- ポート対応: client `5173`, server `8787`(`BFF_APP_PORT`), website は `npm start` が 14321 固定のため dev compose の `4321:4321` マッピングとは不整合(website の dev 公開は未対応).
