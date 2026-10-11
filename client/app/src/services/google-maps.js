/**
 * Google Maps の URL を解析し、リンクカード表示用の情報を返すヘルパー。
 * URL に埋め込まれた地名（/place/<名前>）や検索クエリ（query/q/destination）、
 * 座標（@lat,lng / !3d<lat>!4d<lng>）をオフラインで取り出す。
 * URL から取れない名前や住所は BFF `/api/location` のスクレイピングで補完する。
 */
import { BFF_BASE_URL } from '@/services/bff-request.js';

/**
 * URL スラッグを表示用の名前へ復元する
 * @param {string} segment URL エンコードされたパスセグメント
 * @returns {string} 復元した名前（失敗時は空文字）
 */
function decodeNameSegment(segment) {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
}

/**
 * 単一の URL 文字列が Google Maps かを判定し、表示情報を返す
 * @param {string} candidate URL 候補の文字列
 * @returns {{url: string, name: string, address: string}|null} 解析結果（Google Maps でなければ null）
 */
function parseUrl(candidate) {
  // 文末や括弧に紛れ込んだ記号を除去する
  const sanitized = candidate.replace(/[).,;。、）\]」]+$/u, '');
  /** @type {URL} */
  let url;
  try {
    url = new URL(sanitized);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const isGoogleHost = /(^|\.)google\.[a-z]{2,}(\.[a-z]{2})?$/.test(host);
  const isShortLink = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'));
  const isMapsUrl = (isGoogleHost && (url.pathname === '/maps' || url.pathname.startsWith('/maps/'))) || host === 'maps.google.com' || isShortLink;
  if (!isMapsUrl) return null;

  // /maps/place/<名前>/ から場所名を取得する
  let name = '';
  const placeMatch = url.pathname.match(/\/place\/([^/]+)/);
  if (placeMatch) name = decodeNameSegment(placeMatch[1]);

  // query / q / destination 系パラメータから名前と住所を取得する
  let address = '';
  const queryValue = (url.searchParams.get('query') ?? url.searchParams.get('q') ?? url.searchParams.get('destination') ?? url.searchParams.get('daddr') ?? '').trim();
  if (queryValue) {
    if (queryValue.includes(',')) {
      const [first, ...rest] = queryValue.split(',');
      if (!name) name = first.trim();
      address = rest.join(',').trim();
    } else if (!name) {
      name = queryValue;
    }
  }

  // @lat,lng または data=!3d<lat>!4d<lng> の座標を住所の代替として使う
  const coordMatch = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ?? url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (coordMatch && !address) address = `${coordMatch[1]}, ${coordMatch[2]}`;

  if (!name) name = 'Google Maps';
  return { url: url.href, name, address };
}

/**
 * 場所文字列に含まれる最初の Google Maps URL を解析する
 * @param {string} text 場所フィールドの文字列
 * @returns {{url: string, name: string, address: string}|null} 解析結果（見つからなければ null）
 */
export function parseGoogleMapsLink(text) {
  if (typeof text !== 'string' || !text) return null;
  const candidates = text.match(/https?:\/\/[^\s<>()"']+/g) ?? [];
  for (const candidate of candidates) {
    const parsed = parseUrl(candidate);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * BFF `/api/location` で URL をスクレイピングし、場所名と住所を解決する。
 * 短縮 URL など URL 単体では名前を取り出せない場合の補完用。
 * @param {string} url Google Maps の URL
 * @returns {Promise<{name: string, address: string}|null>} 解決結果（取得できなければ null）
 */
export async function fetchPlaceInfo(url) {
  try {
    const res = await fetch(`${BFF_BASE_URL}/api/location?url=${encodeURIComponent(url)}`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const address = typeof data?.address === 'string' ? data.address.trim() : '';
    if (!name && !address) return null;
    return { name, address };
  } catch {
    return null;
  }
}
