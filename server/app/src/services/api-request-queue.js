/**
 * POST /request の非同期キューワーカー。
 * pending → processing のクレームは write トランザクション内で行うため
 * 複数インスタンスがいても重複取得しない
 */
import {
  API_REQUEST_DRAIN_BATCH,
  API_REQUEST_MAX_ATTEMPTS,
  API_REQUEST_PENDING_TTL_MS,
  API_REQUEST_POLL_MS,
  API_REQUEST_RESULT_TTL_MS,
  API_REQUEST_STALE_MS,
  PROXY_RELAY_HEADERS,
  PROXY_SERVICES,
  UPSTREAM_FETCH_TIMEOUT_MS,
} from '@/assets/constants.js';
import { realm, getGrant, deleteGrant } from '@/services/realm.js';
import { getValidAccessToken, isInvalidGrantError } from '@/services/google.js';
import { errMessage } from '@/services/utils.js';

export const drainApiRequests = async () => {
  const now = Date.now();
  realm.write(() => {
    // 滞留した processing を pending に戻す（回数超過なら failed）
    const stale = /** @type {RealmApiRequest[]} */ (/** @type {unknown} */ ([
      ...realm
        .objects('ApiRequest')
        .filtered('state == "processing" AND updatedAt < $0', new Date(now - API_REQUEST_STALE_MS)),
    ]));
    for (const req of stale) {
      if (req.attempts >= API_REQUEST_MAX_ATTEMPTS) {
        req.state = 'failed';
        req.errorStatus = 502;
        req.errorMessage = 'Request processing timed out';
        req.expiresAt = new Date(now + API_REQUEST_RESULT_TTL_MS);
      } else {
        req.state = 'pending';
        req.expiresAt = new Date(now + API_REQUEST_PENDING_TTL_MS);
      }
      req.updatedAt = new Date(now);
    }
    // 期限切れ（孤児 pending と保持切れの結果）を掃除する
    const expired = realm
      .objects('ApiRequest')
      .filtered('expiresAt != null AND expiresAt < $0', new Date(now));
    if (expired.length) {
      realm.delete(expired);
    }
  });

  for (let i = 0; i < API_REQUEST_DRAIN_BATCH; i++) {
    const req = claimNextApiRequest();
    if (!req) {
      break;
    }
    await processApiRequest(req);
  }
};

// POST されたら即時キックし、通常は定周期で pending を拾う（他インスタンス積み残し対策）
/** @type {ReturnType<typeof setTimeout> | null} */
let apiRequestTimer = null;
/**
 * @param {number} delayMs
 */
export const scheduleApiRequestDrain = (delayMs) => {
  if (apiRequestTimer) {
    clearTimeout(apiRequestTimer);
  }
  apiRequestTimer = setTimeout(async () => {
    try {
      await drainApiRequests();
    } catch (err) {
      console.error('ApiRequest scheduler error:', err);
    }
    scheduleApiRequestDrain(API_REQUEST_POLL_MS);
  }, delayMs);
  apiRequestTimer.unref?.();
};

// --- 以下、ワーカー内部ヘルパー ---

/**
 * @param {RealmApiRequest} req
 * @param {Partial<RealmApiRequestProps>} patch
 */
const finishApiRequest = (req, patch) => {
  try {
    realm.write(() => {
      Object.assign(req, patch);
      req.updatedAt = new Date();
    });
  } catch (err) {
    console.error('Failed to update ApiRequest:', errMessage(err));
  }
};

/**
 * @param {RealmApiRequest} req
 * @param {number} status
 * @param {string} message
 */
const failApiRequest = (req, status, message) =>
  finishApiRequest(req, {
    state: 'failed',
    errorStatus: status,
    errorMessage: message,
    expiresAt: new Date(Date.now() + API_REQUEST_RESULT_TTL_MS),
  });

/**
 * 要素の service に対応するグラントを解決してアクセストークンを返す。
 * 解決不能なら { error: { status, code } } を返す
 * @param {string} userId
 * @param {GrantType} grantType
 * @param {string | null} fallbackToken
 * @returns {Promise<ResolvedToken>}
 */
const resolveItemToken = async (userId, grantType, fallbackToken) => {
  const grant = getGrant(userId, grantType);
  if (grant) {
    try {
      const token = await getValidAccessToken(grant);
      if (token) {
        return { grant, token };
      }
      return { error: { status: 403, code: 'SCOPE_NOT_AUTHORIZED' } };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        deleteGrant(grant);
        return { error: { status: 403, code: 'SCOPE_NOT_AUTHORIZED' } };
      }
      return { error: { status: 502, code: 'TOKEN_REFRESH_FAILED' } };
    }
  }
  if (fallbackToken) {
    return { grant: null, token: fallbackToken };
  }
  return { error: { status: 403, code: 'SCOPE_NOT_AUTHORIZED' } };
};

/**
 * 上流 API を 1 回呼び、{status, headers, bodyBase64} を返す。
 * 上流が 401 を返したらリフレッシュして 1 回だけ再試行する。
 * リフレッシュが invalid_grant ならグラントを破棄して bffCode='GRANT_REVOKED' を投げる
 * @param {ApiRequestItem} item
 * @param {string} token
 * @param {RealmOAuthGrant | null} grant
 * @returns {Promise<UpstreamResult>}
 */
const fetchUpstream = async (item, token, grant) => {
  const fwdHeaders = new Headers();
  for (const [k, v] of Object.entries(item.headers ?? {})) {
    if (typeof v === 'string') {
      fwdHeaders.set(k, v);
    }
  }
  const upstreamBody = item.requestBodyBase64
    ? Buffer.from(item.requestBodyBase64, 'base64')
    : undefined;

  const doFetch = (/** @type {string} */ bearer) => {
    fwdHeaders.set('authorization', `Bearer ${bearer}`);
    return fetch(item.url, {
      method: item.method,
      headers: fwdHeaders,
      body: /** @type {any} */ (upstreamBody),
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });
  };

  let res = await doFetch(token);
  if (res.status === 401 && grant?.refreshToken) {
    try {
      const newToken = await getValidAccessToken(grant, { forceRefresh: true });
      if (newToken) {
        res = await doFetch(newToken);
      }
    } catch (err) {
      if (isInvalidGrantError(err)) {
        deleteGrant(grant);
        throw Object.assign(new Error('SCOPE_NOT_AUTHORIZED'), { bffCode: 'GRANT_REVOKED' });
      }
      console.error('Failed to refresh access token after upstream 401:', errMessage(err));
      // リフレッシュ失敗時は元の 401 レスポンスをそのまま格納する
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const responseHeaders = /** @type {Record<string, string>} */ ({});
  for (const name of PROXY_RELAY_HEADERS) {
    const value = res.headers.get(name);
    if (value) {
      responseHeaders[name] = value;
    }
  }
  return { status: res.status, headers: responseHeaders, bodyBase64: buffer.toString('base64') };
};

/**
 * 要素単位の失敗を上流レスポンスと同じ形に合成する（バッチでは要素ごとに成否を返す）
 * @param {number} status
 * @param {string} code
 * @returns {UpstreamResult}
 */
const elementErrorResult = (status, code) => ({
  status,
  headers: { 'content-type': 'application/json' },
  bodyBase64: Buffer.from(JSON.stringify({ error: { code } }), 'utf8').toString('base64'),
});

/**
 * API リクエストログを REALM に記録する（失敗しても結果は残す）
 * @param {string} sessionId
 * @param {ApiRequestItem} item
 * @param {number} status
 * @param {number} durationMs
 */
const writeApiRequestLog = (sessionId, item, status, durationMs) => {
  try {
    realm.write(() => {
      realm.create('ApiRequestLog', {
        id: crypto.randomUUID(),
        sessionId,
        service: item.service,
        method: item.method,
        url: item.url,
        status,
        requestedAt: new Date(Date.now() - durationMs),
        durationMs,
      });
    });
  } catch (err) {
    console.warn('Failed to write ApiRequestLog:', errMessage(err));
  }
};

/**
 * 上流へ転送し、結果（または上流 401）を ApiRequest に書き戻す。
 * バッチは要素を順次実行し、個々の失敗は要素の status に格納してジョブは done にする
 * @param {RealmApiRequest} req
 * @returns {Promise<void>}
 */
const processApiRequest = async (req) => {
  const startedAt = Date.now();
  const resultExpiry = () => new Date(Date.now() + API_REQUEST_RESULT_TTL_MS);
  try {
    if (req.isBatch) {
      /** @type {ApiRequestItem[] | null} */
      let items = null;
      try {
        items = JSON.parse(req.requestsJson ?? '');
      } catch {
        // 壊れたペイロードはジョブ自体の失敗
      }
      if (!Array.isArray(items) || !items.length) {
        return failApiRequest(req, 500, 'Corrupt batch payload');
      }

      /** @type {UpstreamResult[]} */
      const responses = [];
      for (const item of items) {
        const elementStartedAt = Date.now();
        const svc = PROXY_SERVICES[item.service];
        const tokenResult = svc
          ? await resolveItemToken(req.userId, svc.grantType, item.fallbackToken)
          : { error: { status: 400, code: 'INVALID_REQUEST' } };

        /** @type {UpstreamResult} */
        let element;
        if (tokenResult.error) {
          element = elementErrorResult(tokenResult.error.status, tokenResult.error.code);
        } else {
          try {
            element = await fetchUpstream(item, tokenResult.token, tokenResult.grant);
          } catch (err) {
            element =
              /** @type {any} */ (err)?.bffCode === 'GRANT_REVOKED'
                ? elementErrorResult(403, 'SCOPE_NOT_AUTHORIZED')
                : elementErrorResult(502, errMessage(err));
          }
        }
        responses.push(element);
        writeApiRequestLog(req.sessionId, item, element.status, Date.now() - elementStartedAt);
      }

      return finishApiRequest(req, {
        state: 'done',
        responsesJson: JSON.stringify(responses),
        errorStatus: null,
        errorMessage: null,
        expiresAt: resultExpiry(),
      });
    }

    const svc = PROXY_SERVICES[/** @type {ProxyServiceName} */ (req.service)];
    if (!svc) {
      return failApiRequest(req, 400, 'INVALID_REQUEST');
    }
    /** @type {Record<string, string>} */
    let headers = {};
    try {
      headers = JSON.parse(req.headersJson ?? '{}');
    } catch {
      // 壊れたヘッダは無視して空から始める
    }
    /** @type {ApiRequestItem} */
    const item = {
      service: /** @type {ProxyServiceName} */ (req.service),
      method: req.method,
      url: req.url,
      headers,
      requestBodyBase64: req.requestBodyBase64,
      fallbackToken: req.fallbackToken,
      grantType: svc.grantType,
    };

    const tokenResult = await resolveItemToken(req.userId, svc.grantType, item.fallbackToken);
    if (tokenResult.error) {
      return failApiRequest(req, tokenResult.error.status, tokenResult.error.code);
    }

    /** @type {UpstreamResult} */
    let element;
    try {
      element = await fetchUpstream(item, tokenResult.token, tokenResult.grant);
    } catch (err) {
      if (/** @type {any} */ (err)?.bffCode === 'GRANT_REVOKED') {
        return failApiRequest(req, 403, 'SCOPE_NOT_AUTHORIZED');
      }
      return failApiRequest(req, 502, errMessage(err));
    }

    finishApiRequest(req, {
      state: 'done',
      status: element.status,
      responseHeadersJson: JSON.stringify(element.headers),
      responseBodyBase64: element.bodyBase64,
      errorStatus: null,
      errorMessage: null,
      expiresAt: resultExpiry(),
    });
    writeApiRequestLog(req.sessionId, item, element.status, Date.now() - startedAt);
  } catch (err) {
    console.error('ApiRequest worker error:', errMessage(err));
    failApiRequest(req, 502, errMessage(err));
  }
};

/**
 * pending を 1 件だけ processing にする。write トランザクション内で行うため
 * 複数インスタンスがいても二重取得しない
 * @returns {RealmApiRequest | null}
 */
const claimNextApiRequest = () => {
  /** @type {RealmApiRequest | null} */
  let claimed = null;
  realm.write(() => {
    const pending = /** @type {Iterable<RealmApiRequest>} */ (
      realm
        .objects('ApiRequest')
        .filtered('state == $0', 'pending')
        .sorted('createdAt')
    );
    for (const req of pending) {
      req.state = 'processing';
      req.attempts += 1;
      req.updatedAt = new Date();
      req.expiresAt = null; // 実行中は期限切れ掃除の対象外にする
      claimed = req;
      break;
    }
  });
  return claimed;
};
