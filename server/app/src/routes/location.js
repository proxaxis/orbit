/**
 * GET /api/location?url=<encoded Google Maps URL> — Maps URL を辿って
 * 場所名・住所を抽出して返す。セッション Cookie 認証必須。
 *
 * 200: { name, address? }（name は必須。両方取れなければ 404）
 * 400: url パラメータなし・不正 URL・http/https 以外・Maps ドメイン以外・内部 IP
 * 404: 場所情報を抽出できない・text/html 以外の応答
 * 502: DNS/接続エラー・非 2xx・リダイレクト超過
 * 504: タイムアウト（LOCATION_FETCH_TIMEOUT_MS）
 */
import { getSessionFromCookie } from '@/services/session.js';
import { fetchLocationInfo, LocationFetchError } from '@/services/location.js';
import { errMessage } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerLocationRoutes = (app) => {
  app.get('/api/location', async (c) => {
    const session = await getSessionFromCookie(c);
    if (!session) {
      return c.json({ error: 'UNAUTHORIZED' }, 401);
    }

    const urlParam = c.req.query('url');
    /** @type {URL | null} */
    let url = null;
    if (urlParam) {
      try {
        url = new URL(urlParam);
      } catch {
        url = null;
      }
    }
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      return c.json({ error: 'INVALID_URL' }, 400);
    }

    try {
      const info = await fetchLocationInfo(url);
      return c.json({
        name: info.name,
        ...(info.address ? { address: info.address } : {}),
      });
    } catch (err) {
      if (err instanceof LocationFetchError) {
        return c.json({ error: err.code }, /** @type {any} */ (err.status));
      }
      console.error('Failed to fetch location info:', errMessage(err));
      return c.json({ error: 'FETCH_FAILED' }, 502);
    }
  });
};
