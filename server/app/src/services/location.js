/**
 * GET /api/location の裏側: Google Maps URL の検証・HTML 取得・
 * 場所情報（name/address）の抽出・メモリキャッシュ。
 *
 * SSRF 対策:
 * - リダイレクトを含む全ホップで Google Maps ドメインのみ許可
 *   （*.google.<tld> の /maps パス、maps.google.*、maps.app.goo.gl、goo.gl/maps）
 * - DNS 解決した全 IP がプライベート/ループバック/予約済みでないことを確認
 * - リダイレクトは最大 LOCATION_MAX_REDIRECTS 回まで手動で追跡
 * - ボディは先頭 LOCATION_MAX_BODY_BYTES のみ読み、text/html 系のみ受理
 *
 * 注意: DNS チェックと実接続の間に再解決が挟まる TOCTOU には理論上
 * 隙間があるが、許可ドメインが Google 系に限定されているため実害は限定的
 */
import { promises as dns } from 'node:dns';
import {
  LOCATION_CACHE_MAX_ENTRIES,
  LOCATION_CACHE_TTL_MS,
  LOCATION_FETCH_TIMEOUT_MS,
  LOCATION_MAX_BODY_BYTES,
  LOCATION_MAX_REDIRECTS,
  LOCATION_USER_AGENT,
} from '@/assets/constants.js';

/** HTTP ステータスを持つ取得エラー。route 側で応答に変換する */
export class LocationFetchError extends Error {
  /**
   * @param {number} status HTTP ステータス（400/404/502/504）
   * @param {string} code エラーコード
   */
  constructor(status, code) {
    super(code);
    this.name = 'LocationFetchError';
    this.status = status;
    this.code = code;
  }
}

// テストから差し替え可能な外部依存。fetch は globalThis を遅延参照し、
// テストが差し替えたスタブを拾えるようにする
export const locationDeps = {
  /**
   * @param {string} hostname
   * @returns {Promise<import('node:dns').LookupAddress[]>}
   */
  lookup: (hostname) => dns.lookup(hostname, { all: true }),
  /** @type {typeof fetch} */
  fetch: (...args) => fetch(...args),
};

/**
 * Google Maps の URL を（リダイレクト追跡込みで）取得し、場所情報を返す。
 * name が抽出できない場合は 404 の LocationFetchError を投げる
 * @param {URL} initialUrl http/https 検証済みの URL
 * @returns {Promise<LocationInfo>}
 * @throws {LocationFetchError}
 */
export const fetchLocationInfo = async (initialUrl) => {
  const deadline = Date.now() + LOCATION_FETCH_TIMEOUT_MS;
  let url = initialUrl;
  let redirects = 0;

  for (;;) {
    const cached = cacheGet(url.href);
    if (cached) {
      return cached;
    }
    assertMapsUrl(url);
    await assertPublicHost(url);

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new LocationFetchError(504, 'TIMEOUT');
    }

    /** @type {Response} */
    let res;
    try {
      res = await locationDeps.fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(remaining),
        headers: {
          'user-agent': LOCATION_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
        },
      });
    } catch (err) {
      throw toLocationError(err);
    }

    const location = res.headers.get('location');
    if (REDIRECT_STATUSES.has(res.status) && location) {
      drain(res);
      if (redirects >= LOCATION_MAX_REDIRECTS) {
        throw new LocationFetchError(502, 'TOO_MANY_REDIRECTS');
      }
      redirects += 1;
      try {
        url = new URL(location, url);
      } catch {
        throw new LocationFetchError(502, 'FETCH_FAILED');
      }
      continue;
    }

    if (!res.ok) {
      drain(res);
      throw new LocationFetchError(502, 'UPSTREAM_ERROR');
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      drain(res);
      throw new LocationFetchError(404, 'NOT_FOUND');
    }

    /** @type {string} */
    let html;
    try {
      html = await readBodyPrefix(res);
    } catch (err) {
      throw toLocationError(err);
    }

    const info = extractLocationInfo(html, url);
    if (!info.name) {
      throw new LocationFetchError(404, 'NOT_FOUND');
    }
    cacheSet([initialUrl.href, url.href], info);
    return info;
  }
};

/**
 * Google Maps の HTML から場所名・住所を抽出する。
 * 名前: og:title → title → itemprop=name → JSON-LD → /maps/place/ パス
 * 住所: JSON-LD address → itemprop=address → description 系メタ（best effort）
 * @param {string} html
 * @param {URL} finalUrl リダイレクト解決後の最終 URL（/place/ 名の fallback に使用）
 * @returns {LocationInfo}
 */
export const extractLocationInfo = (html, finalUrl) => {
  const jsonLd = findJsonLdPlace(html);
  const name = pickCleaned(
    [
      metaContent(html, 'property', 'og:title'),
      titleContent(html),
      metaContent(html, 'itemprop', 'name'),
      jsonLd?.name ?? null,
      placeNameFromUrl(finalUrl),
    ],
    cleanText
  );
  const address = pickCleaned(
    [
      jsonLd?.addressText ?? null,
      metaContent(html, 'itemprop', 'address'),
      metaContent(html, 'name', 'description'),
      metaContent(html, 'property', 'og:description'),
      metaContent(html, 'itemprop', 'description'),
    ],
    cleanAddressText
  );
  return { name, address };
};

/**
 * Google Maps のドメインかどうかを判定する。
 * 許可: maps.app.goo.gl（任意パス）、goo.gl/maps、maps.google.*、
 *       *.google.<tld> の /maps パス（google.co.jp 型の2ラベルTLDも許可）
 * @param {URL} url
 * @returns {boolean}
 */
export const isAllowedMapsUrl = (url) => {
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'maps.app.goo.gl') {
    return true;
  }
  if (host === 'goo.gl') {
    return isMapsPath(url);
  }
  const subs = googleSubdomainLabels(host);
  if (!subs) {
    return false;
  }
  if (subs[subs.length - 1] === 'maps') {
    return true;
  }
  return isMapsPath(url);
};

/**
 * プライベート/ループバック/リンクローカル/予約済み IP なら true
 * @param {string} ip
 * @returns {boolean}
 */
export const isPrivateIp = (ip) =>
  ip.includes(':') ? isPrivateIpv6(ip) : isPrivateIpv4(ip);

/** キャッシュを空にする（テスト用） */
export const clearLocationCache = () => {
  locationCache.clear();
};

// --- 内部 ---

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** @type {Map<string, { at: number, info: LocationInfo }>} */
const locationCache = new Map();

const isMapsPath = (/** @type {URL} */ url) =>
  url.pathname === '/maps' || url.pathname.startsWith('/maps/');

// google.co.jp / google.com.au のような2ラベル ccTLD の前置ラベル
const SECOND_LEVEL_TLD_LABELS = new Set([
  'ac', 'co', 'com', 'edu', 'gov', 'net', 'org',
  'ne', 'or', 'go', 'gob', 'gen', 'firm', 'web',
  'arts', 'rec', 'info', 'nom', 'mil', 'res',
]);

const isTldLabel = (/** @type {string} */ s) =>
  /^[a-z]{2,63}$/.test(s) || /^xn--[a-z0-9-]{2,59}$/.test(s);

/**
 * host が `*.google.<tld>` なら google より前のサブドメインラベル列を返す。
 * google.* でない（google.com.evil.com 等を含む）場合は null
 * @param {string} host 小文字化済み・末尾ドット除去済み
 * @returns {string[] | null}
 */
const googleSubdomainLabels = (host) => {
  const parts = host.split('.');
  const n = parts.length;
  /** google ラベルの位置（tld の直前であること） */
  let gi = -1;
  if (n >= 2 && parts[n - 2] === 'google' && isTldLabel(parts[n - 1])) {
    gi = n - 2; // google.com 型
  } else if (
    n >= 3 &&
    parts[n - 3] === 'google' &&
    SECOND_LEVEL_TLD_LABELS.has(parts[n - 2]) &&
    /^[a-z]{2}$/.test(parts[n - 1])
  ) {
    gi = n - 3; // google.co.jp 型
  }
  if (gi < 0) {
    return null;
  }
  return parts.slice(0, gi);
};

/** @param {URL} url */
const assertMapsUrl = (url) => {
  if (!isAllowedMapsUrl(url)) {
    throw new LocationFetchError(400, 'NOT_GOOGLE_MAPS_URL');
  }
};

/**
 * DNS 解決して全 IP がグローバルであることを確認する。
 * 解決失敗は 502、プライベート IP は 400 で拒否
 * @param {URL} url
 */
const assertPublicHost = async (url) => {
  /** @type {import('node:dns').LookupAddress[]} */
  let addresses;
  try {
    addresses = await locationDeps.lookup(url.hostname);
  } catch {
    throw new LocationFetchError(502, 'FETCH_FAILED');
  }
  if (!addresses.length) {
    throw new LocationFetchError(502, 'FETCH_FAILED');
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new LocationFetchError(400, 'BLOCKED_HOST');
  }
};

const toLocationError = (/** @type {any} */ err) =>
  err?.name === 'TimeoutError' || err?.name === 'AbortError'
    ? new LocationFetchError(504, 'TIMEOUT')
    : new LocationFetchError(502, 'FETCH_FAILED');

/** ボディを読まずに接続を解放する（リダイレクト/エラー応答用） */
const drain = (/** @type {Response} */ res) => {
  res.body?.cancel().catch(() => {});
};

/**
 * レスポンスボディを先頭 LOCATION_MAX_BODY_BYTES まで読む。
 * 途中で打ち切って残りは破棄する
 * @param {Response} res
 * @returns {Promise<string>}
 */
const readBodyPrefix = async (res) => {
  if (!res.body) {
    return '';
  }
  const reader = res.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  try {
    while (total < LOCATION_MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(Math.min(total, LOCATION_MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, merged.length - offset);
    merged.set(slice, offset);
    offset += slice.length;
  }
  return new TextDecoder().decode(merged);
};

const cacheGet = (/** @type {string} */ key) => {
  const entry = locationCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.at >= LOCATION_CACHE_TTL_MS) {
    locationCache.delete(key);
    return null;
  }
  return entry.info;
};

/**
 * @param {string[]} keys 初回 URL と最終 URL の両方を登録する
 * @param {LocationInfo} info
 */
const cacheSet = (keys, info) => {
  const entry = { at: Date.now(), info };
  for (const key of keys) {
    if (locationCache.size >= LOCATION_CACHE_MAX_ENTRIES && !locationCache.has(key)) {
      // Map は挿入順なので先頭が最古
      const oldest = locationCache.keys().next().value;
      if (oldest !== undefined) {
        locationCache.delete(oldest);
      }
    }
    locationCache.set(key, entry);
  }
};

// --- IPv4/IPv6 のプライベート判定 ---

const isPrivateIpv4 = (/** @type {string} */ ip) => {
  const parts = ip.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true; // 不正形式は安全側で拒否
  }
  const [a, b, c] = parts;
  return (
    a === 0 || // this network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local（クラウドメタデータ含む）
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) || // 192.0.0/24・テスト網 + 192.168/16
    (a === 198 && (b === 18 || b === 19)) || // ベンチマーク
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // マルチキャスト・予約・ブロードキャスト
  );
};

const isPrivateIpv6 = (/** @type {string} */ ip) => {
  const g = expandIpv6(ip.toLowerCase());
  if (!g || g.length !== 8 || g.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) {
    return true;
  }
  if (g.every((n) => n === 0)) {
    return true; // :: unspecified
  }
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) {
    return true; // ::1 loopback
  }
  // IPv4-mapped (::ffff:a.b.c.d) は IPv4 として判定する
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    return isPrivateIpv4(
      `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
    );
  }
  return (
    g[0] === 0x2002 || // 6to4
    (g[0] === 0x2001 && g[1] === 0) || // Teredo
    (g[0] === 0x2001 && g[1] === 0x0db8) || // documentation
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local（fec0::/10 も含む）
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 ULA
    (g[0] & 0xff00) === 0xff00 // ff00::/8 multicast
  );
};

/**
 * IPv6 アドレスを 8 つの 16bit 値に展開する。末尾の IPv4 記法
 * （::ffff:a.b.c.d）は 2 グループに変換する。不正形式なら null
 * @param {string} ip 小文字化済み
 * @returns {number[] | null}
 */
const expandIpv6 = (ip) => {
  // 末尾が IPv4 記法（a.b.c.d）なら 2 グループ分として数える
  const effectiveLen = (/** @type {string[]} */ groups) =>
    groups.length + (groups[groups.length - 1]?.includes('.') ? 1 : 0);

  const [head, tail] = ip.split('::');
  if (tail === undefined) {
    const groups = ip.split(':');
    if (effectiveLen(groups) !== 8) {
      return null;
    }
    return parseIpv6Groups(groups);
  }
  if (ip.split('::').length !== 2) {
    return null; // '::' が複数ある不正形式
  }
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - effectiveLen(tailGroups);
  if (missing < 0) {
    return null;
  }
  return parseIpv6Groups([...headGroups, ...Array(missing).fill('0'), ...tailGroups]);
};

/** @param {string[]} groups */
const parseIpv6Groups = (groups) => {
  /** @type {number[]} */
  const nums = [];
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i];
    if (i === groups.length - 1 && g.includes('.')) {
      // ::ffff:a.b.c.d 形式の末尾
      const v4 = g.split('.').map(Number);
      if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return null;
      }
      nums.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/.test(g)) {
      return null;
    }
    nums.push(parseInt(g, 16));
  }
  return nums;
};

// --- HTML からの抽出 ---

const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const JSONLD_RE =
  /<script\b[^>]*?type\s*=\s*["']?application\/ld\+json["']?[^>]*?>([\s\S]*?)<\/script>/gi;

// タイトル末尾の " - Google Maps" / " - Google マップ" 等のサフィックス
const MAPS_TITLE_WORDS = [
  'Maps',
  'マップ',
  '地図',
  '地圖',
  '地图',
  '지도',
  'Mapas',
  'Mapy',
  'Карты',
  'Haritalar',
];
const MAPS_SUFFIX_RE = new RegExp(
  `\\s*[-–—・|]\\s*Google\\s+(${MAPS_TITLE_WORDS.join('|')})\\s*$`,
  'iu'
);
const MAPS_ONLY_RE = new RegExp(`^Google\\s*(${MAPS_TITLE_WORDS.join('|')})$`, 'iu');

/** @type {Record<string, string>} */
const NAMED_ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * HTML エンティティをデコードする。&amp; は最後に処理し、
 * `&amp;lt;` のような二重エスケープを `&lt;`（文字）として復元する
 * @param {string} s
 * @returns {string}
 */
const decodeEntities = (s) =>
  s
    .replace(
      /&(#x[0-9a-f]+|#[0-9]+|lt|gt|quot|apos|nbsp);/gi,
      (full, body) => {
        if (body.startsWith('#')) {
          const code =
            body[1].toLowerCase() === 'x'
              ? parseInt(body.slice(2), 16)
              : parseInt(body.slice(1), 10);
          return Number.isInteger(code) && code > 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : full;
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? full;
      }
    )
    .replace(/&amp;/gi, '&');

/**
 * meta タグから指定属性（property/name/itemprop）が value のものの
 * content を返す。属性の順序には依存しない
 * @param {string} html
 * @param {'property' | 'name' | 'itemprop'} attrKey
 * @param {string} attrValue
 * @returns {string | null}
 */
const metaContent = (html, attrKey, attrValue) => {
  for (const m of html.matchAll(META_TAG_RE)) {
    const attrs = parseAttrs(m[0]);
    if (attrs[attrKey]?.toLowerCase() === attrValue) {
      const content = attrs.content;
      if (typeof content === 'string' && content) {
        return content;
      }
    }
  }
  return null;
};

/**
 * タグ内の属性を name→value のマップにする
 * @param {string} tag `<meta ...>` 等の1タグ分
 * @returns {Record<string, string>}
 */
const parseAttrs = (tag) => {
  /** @type {Record<string, string>} */
  const attrs = {};
  for (const m of tag.matchAll(ATTR_RE)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
};

const titleContent = (/** @type {string} */ html) => TITLE_RE.exec(html)?.[1] ?? null;

/**
 * 候補を順に clean して、最初に有効な値になったものを返す
 * @param {(string | null | undefined)[]} candidates
 * @param {(v: string) => string | null} clean
 * @returns {string | null}
 */
const pickCleaned = (candidates, clean) => {
  for (const v of candidates) {
    if (typeof v !== 'string') {
      continue;
    }
    const cleaned = clean(v);
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
};

/**
 * エンティティデコード＋ " - Google Maps" 系サフィックス除去＋空白正規化。
 * "Google Maps" 自体や空文字は null（場所名として無効）
 * @param {string} value
 * @returns {string | null}
 */
const cleanText = (value) => {
  const cleaned = decodeEntities(value)
    .replace(MAPS_SUFFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || MAPS_ONLY_RE.test(cleaned)) {
    return null;
  }
  return cleaned;
};

// Google サービス自体の汎用説明文（"Find local businesses, view maps..."
// "Google マップで地図を検索。..." 等）を住所と誤認しないためのフィルタ
const GENERIC_MAPS_TEXT_RE = /google\s*(maps|マップ|地図|地圖|地图|지도)/i;

/**
 * 住所候補のクリーニング。汎用説明文は null に落とす
 * @param {string} value
 * @returns {string | null}
 */
const cleanAddressText = (value) => {
  const cleaned = cleanText(value);
  if (!cleaned || GENERIC_MAPS_TEXT_RE.test(cleaned)) {
    return null;
  }
  return cleaned;
};

/**
 * /maps/place/<name>/ の URL パスから場所名を復元する（fallback）
 * @param {URL} url
 * @returns {string | null}
 */
const placeNameFromUrl = (url) => {
  const m = /\/maps\/place\/([^/?#]+)/.exec(url.pathname);
  if (!m) {
    return null;
  }
  try {
    return decodeURIComponent(m[1]).replace(/\+/g, ' ');
  } catch {
    return m[1];
  }
};

/**
 * @param {string} html
 * @returns {{ name: string | null, addressText: string | null } | null}
 */
const findJsonLdPlace = (html) => {
  for (const m of html.matchAll(JSONLD_RE)) {
    /** @type {any} */
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const place = findPlaceNode(data);
    if (place) {
      return place;
    }
  }
  return null;
};

/**
 * JSON-LD のツリーから type が Place 系（LocalBusiness 等も含む）の
 * ノードを探す。配列と graph プロパティは再帰的に辿る
 * @param {any} node
 * @returns {{ name: string | null, addressText: string | null } | null}
 */
const findPlaceNode = (node) => {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const el of node) {
      const found = findPlaceNode(el);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (
    types.some(
      (t) =>
        typeof t === 'string' &&
        (t === 'Place' || t === 'LocalBusiness' || t === 'Restaurant')
    )
  ) {
    return {
      name: typeof node.name === 'string' ? node.name : null,
      addressText: addressTextOf(node.address),
    };
  }
  return findPlaceNode(node['@graph']);
};

/**
 * @param {any} address schema.org の address（文字列または PostalAddress）
 * @returns {string | null}
 */
const addressTextOf = (address) => {
  if (typeof address === 'string') {
    return address.trim() || null;
  }
  if (address && typeof address === 'object' && !Array.isArray(address)) {
    const parts = [
      'streetAddress',
      'addressLocality',
      'addressRegion',
      'postalCode',
      'addressCountry',
    ]
      .map((k) => address[k])
      .filter((v) => typeof v === 'string' && v.trim());
    return parts.length ? parts.join(' ') : null;
  }
  return null;
};
