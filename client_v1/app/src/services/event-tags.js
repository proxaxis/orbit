/**
 * イベントタグの付与・解析・description への埋め込みを行うユーティリティ。
 * タグは Google カレンダー検索（events.list の q パラメータ）でヒットするよう
 * description の末尾に `#tag` 形式で埋め込み、同じ値を
 * `extendedProperties.shared.orbitTags` に JSON 配列として保持する。
 * 表示用の description からは末尾のタグ文字列を取り除いて使う。
 */

/** @type {string} タグ配列を保持する shared 拡張プロパティのキー */
export const TAGS_SHARED_PROPERTY = 'orbitTags';

/**
 * 1つのタグ文字列を正規化する。
 * 先頭の '#' と前後の空白を除去し、空白を含む場合は '_' に置き換える。
 * @param {unknown} value タグ候補
 * @returns {string} 正規化されたタグ（無効な場合は空文字）
 */
export function normalizeTag(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^#+/, '').trim().replace(/\s+/g, '_');
}

/**
 * ユーザー入力（空白・カンマ・読点区切り）または配列からタグ一覧を生成する。
 * 重複は除去される。
 * @param {string|string[]|unknown} input タグ入力
 * @returns {string[]} 正規化されたタグの配列
 */
export function normalizeTags(input) {
  const rawTags = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,、　]+/) : [];
  /** @type {string[]} */
  const tags = [];
  for (const raw of rawTags) {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/**
 * extendedProperties.shared に格納するタグ値を生成する。
 * @param {string[]} tags タグ配列
 * @returns {string|undefined} JSON 文字列（タグが無い場合は undefined）
 */
export function buildTagsSharedValue(tags) {
  return tags.length > 0 ? JSON.stringify(tags) : undefined;
}

/**
 * Google イベントオブジェクトの shared 拡張プロパティからタグ配列を読み取る。
 * @param {GoogleCalendarEvent|{extendedProperties?: {shared?: Record<string, string>}}|null|undefined} evt イベント
 * @returns {string[]} タグ配列
 */
export function parseEventTags(evt) {
  const raw = evt?.extendedProperties?.shared?.[TAGS_SHARED_PROPERTY];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeTags(parsed);
  } catch {
    // JSON でない場合は区切り文字列として解釈する
  }
  return normalizeTags(raw.split(/[\s,]+/));
}

/**
 * description の末尾に検索用の `#tag` 文字列を付与する。
 * @param {string} description 本文
 * @param {string[]} tags タグ配列
 * @returns {string} タグを末尾に付与した description
 */
export function appendTagsToDescription(description, tags) {
  const base = (description ?? '').replace(/\s+$/, '');
  const suffix = tags.map((tag) => `#${tag}`).join(' ');
  if (!suffix) return base;
  return base ? `${base} ${suffix}` : suffix;
}

/**
 * description の末尾に付与されたタグ文字列を取り除く。
 * 末尾から順に `#tag` トークンを確認し、登録済みタグに一致するものだけを除去する。
 * （本文中に偶然含まれるハッシュタグは保持する）
 * @param {string} description description
 * @param {string[]} tags 登録済みタグ
 * @returns {string} 表示用 description
 */
export function stripTagsFromDescription(description, tags) {
  if (typeof description !== 'string' || tags.length === 0) return description ?? '';
  const tagSet = new Set(tags);
  const tokens = description.replace(/\s+$/, '').split(' ');
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (!last.startsWith('#') || !tagSet.has(normalizeTag(last))) break;
    tokens.pop();
  }
  return tokens.join(' ').replace(/\s+$/, '');
}
