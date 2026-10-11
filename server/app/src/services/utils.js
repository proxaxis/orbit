/**
 * ルート・サービス横断の小さなユーティリティ
 */
import { ALLOWED_PROMPT_TOKENS } from '@/assets/constants.js';

/**
 * エラーを message 文字列に正規化する
 * @param {unknown} err
 * @returns {string}
 */
export const errMessage = (err) => (err instanceof Error ? err.message : String(err));

/**
 * ?prompt= クエリを検証する。
 * 未指定・空文字なら prompt=null（デフォルト動作）、全トークンが許可値なら
 * 正規化した文字列を返し、それ以外は error を返す
 * @param {string | undefined} raw
 * @returns {{ prompt: string | null, error: string | null }}
 */
export const parsePromptParam = (raw) => {
  if (!raw || !raw.trim()) {
    return { prompt: null, error: null };
  }
  const tokens = raw.trim().split(/\s+/);
  if (!tokens.every((token) => ALLOWED_PROMPT_TOKENS.has(token))) {
    return { prompt: null, error: 'Invalid prompt parameter' };
  }
  return { prompt: tokens.join(' '), error: null };
};
