/**
 * POST /request — クライアントからの Google API リクエストをキューに投入する。
 * 単発エンベロープまたは { requests: [...] } のバッチ形式を受け付け、
 * セッション Cookie でユーザを特定して 1 ジョブとして積む
 * （実際の転送はワーカーが非同期に行う。結果は GET /request/:id で取得）
 *
 * GET /request/:id — キュー結果の取得。requestId は投入者のセッションに
 * 紐付くため他ユーザは参照できない（IDOR 防止）
 */
import {
  API_REQUEST_MAX_BATCH,
  API_REQUEST_PENDING_TTL_MS,
  PROXY_BLOCKED_HEADERS,
  PROXY_METHODS,
  PROXY_SERVICES,
} from '@/assets/constants.js';
import { realm, getGrant } from '@/services/realm.js';
import { getSessionFromCookie } from '@/services/session.js';
import { scheduleApiRequestDrain } from '@/services/api-request-queue.js';

/**
 * @param {AppHono} app
 */
export const registerRequestRoutes = (app) => {
  app.post('/request', async (c) => {
    const session = await getSessionFromCookie(c);
    if (!session) {
      return c.json({ error: 'UNAUTHORIZED' }, 401);
    }

    const body = await c.req.json().catch(() => null);

    /** @type {ApiRequestItem[] | null} */
    let batchItems = null;
    /** @type {ApiRequestItem | null} */
    let singleItem = null;

    if (Array.isArray(body?.requests)) {
      if (!body.requests.length || body.requests.length > API_REQUEST_MAX_BATCH) {
        return apiRequestError(c, {
          status: 400,
          code: 'INVALID_REQUEST',
          message: `requests must be a non-empty array of at most ${API_REQUEST_MAX_BATCH} elements`,
        });
      }
      batchItems = [];
      // 1 件でも検証に落ちればジョブ全体を拒否する（部分投入しない）
      for (const el of body.requests) {
        const normalized = normalizeRequestElement(el, session.userId);
        if (normalized.error) {
          return apiRequestError(c, normalized.error);
        }
        batchItems.push(normalized.item);
      }
    } else {
      const normalized = normalizeRequestElement(body, session.userId);
      if (normalized.error) {
        return apiRequestError(c, normalized.error);
      }
      singleItem = normalized.item;
    }

    const requestId = crypto.randomUUID();
    const now = new Date();
    realm.write(() => {
      realm.create('ApiRequest', {
        id: requestId,
        sessionId: session.id,
        userId: session.userId,
        state: 'pending',
        isBatch: !!batchItems,
        service: batchItems ? 'batch' : (singleItem?.service ?? ''),
        method: batchItems ? '-' : (singleItem?.method ?? ''),
        url: batchItems ? `batch:${batchItems.length}` : (singleItem?.url ?? ''),
        headersJson: batchItems ? null : JSON.stringify(singleItem?.headers),
        requestBodyBase64: batchItems ? null : (singleItem?.requestBodyBase64 ?? null),
        fallbackToken: batchItems ? null : (singleItem?.fallbackToken ?? null),
        requestsJson: batchItems ? JSON.stringify(batchItems) : null,
        responsesJson: null,
        attempts: 0,
        status: null,
        responseHeadersJson: null,
        responseBodyBase64: null,
        errorStatus: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + API_REQUEST_PENDING_TTL_MS),
      });
    });
    scheduleApiRequestDrain(0);

    return c.json({ requestId }, 202);
  });

  app.get('/request/:id', async (c) => {
    const session = await getSessionFromCookie(c);
    if (!session) {
      return c.json({ error: 'UNAUTHORIZED' }, 401);
    }

    const req = /** @type {RealmApiRequest | null} */ (
      realm.objectForPrimaryKey('ApiRequest', c.req.param('id'))
    );
    if (!req || req.sessionId !== session.id) {
      return c.json({ error: 'NOT_FOUND' }, 404);
    }
    if (req.expiresAt && req.expiresAt.getTime() <= Date.now()) {
      realm.write(() => realm.delete(req));
      return c.json({ error: 'GONE' }, 410);
    }
    if (req.state === 'done') {
      if (req.isBatch) {
        // バッチは requests と同じ順序・要素数で responses を返す
        return c.json({
          state: 'done',
          responses: JSON.parse(req.responsesJson ?? '[]'),
        });
      }
      return c.json({
        state: 'done',
        response: {
          status: req.status ?? 0,
          headers: JSON.parse(req.responseHeadersJson ?? '{}'),
          bodyBase64: req.responseBodyBase64 ?? '',
        },
      });
    }
    if (req.state === 'failed') {
      return c.json({
        state: 'failed',
        error: {
          status: req.errorStatus ?? 502,
          message: req.errorMessage ?? 'Upstream request failed',
        },
      });
    }
    return c.json({ state: 'pending' });
  });
};

// --- ヘルパー ---

/**
 * 1 要素分のエンベロープを検証・正規化する。失敗時は { error } を返す
 * @param {any} el
 * @param {string} userId
 * @returns {NormalizedRequestElement}
 */
const normalizeRequestElement = (el, userId) => {
  const service = el?.service;
  const method = typeof el?.method === 'string' ? el.method.toUpperCase() : '';
  const svc = PROXY_SERVICES[/** @type {ProxyServiceName} */ (service)];

  if (!svc || !PROXY_METHODS.has(method) || typeof el?.url !== 'string') {
    return {
      error: { status: 400, code: 'INVALID_REQUEST', message: 'Invalid request envelope' },
    };
  }

  /** @type {URL | null} */
  let parsed;
  try {
    parsed = new URL(el.url);
  } catch {
    parsed = null;
  }
  if (
    !parsed ||
    parsed.protocol !== 'https:' ||
    (parsed.port !== '' && parsed.port !== '443') ||
    !svc.allow(parsed)
  ) {
    return {
      error: { status: 400, code: 'URL_NOT_ALLOWED', message: 'URL is not allowed for this service' },
    };
  }

  // グラントも予備トークンも無ければ拒否（ワーカー側でも再検査される）
  const grant = getGrant(userId, svc.grantType);
  const fallbackToken =
    typeof el?.accessToken === 'string' && el.accessToken ? el.accessToken : null;
  if (!grant && !fallbackToken) {
    return {
      error: {
        status: 403,
        code: 'SCOPE_NOT_AUTHORIZED',
        message: `No '${svc.grantType}' grant for this user`,
      },
    };
  }

  // 転送ヘッダとボディをこの時点で確定させる。
  // Authorization はクライアントから送られても採用せず、ワーカーが REALM の値で付与する
  const headers = /** @type {Record<string, string>} */ ({});
  if (el?.headers && typeof el.headers === 'object' && !Array.isArray(el.headers)) {
    for (const [k, v] of Object.entries(el.headers)) {
      if (typeof v === 'string' && !PROXY_BLOCKED_HEADERS.has(k.toLowerCase())) {
        headers[k.toLowerCase()] = v;
      }
    }
  }

  /** @type {string | null} */
  let requestBodyBase64 = null;
  if (el?.bodyBase64 != null) {
    if (typeof el.bodyBase64 !== 'string') {
      return {
        error: { status: 400, code: 'INVALID_REQUEST', message: 'bodyBase64 must be a base64 string' },
      };
    }
    requestBodyBase64 = el.bodyBase64;
  } else if (el?.body != null) {
    requestBodyBase64 = Buffer.from(JSON.stringify(el.body), 'utf8').toString('base64');
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
  }

  return {
    item: {
      service,
      method,
      url: parsed.href,
      headers,
      requestBodyBase64,
      fallbackToken,
      grantType: svc.grantType,
    },
  };
};

/**
 * @param {AppContext} c
 * @param {RequestValidationError} err
 */
const apiRequestError = (c, err) =>
  c.json(
    { error: { message: err.message, code: err.code } },
    /** @type {any} */ (err.status)
  );
