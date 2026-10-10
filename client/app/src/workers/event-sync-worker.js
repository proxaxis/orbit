/**
 * イベントの作成・更新・削除をバックグラウンドで実行する専用 Web Worker。
 * 保存操作の API 呼び出し（BFF のキュー投入＋ポーリング）をメインスレッドから
 * 切り離し、UI をブロックせずに結果だけをメインスレッドへ通知する。
 *
 * メッセージ: { jobId, op: 'insert'|'update'|'remove', args: [...] }
 * 返信:      { jobId, ok: true, result } / { jobId, ok: false, error: {message, status} }
 */
import * as gCalAPI from '@/services/google-calendar-api.js';

/** @type {Record<string, Function>} 実行可能な操作とサービス関数の対応 */
const OPERATIONS = {
  insert: gCalAPI.insertEvent,
  update: gCalAPI.updateEvent,
  remove: gCalAPI.deleteEvent,
};

self.onmessage = async (event) => {
  const { jobId, op, args = [] } = event.data ?? {};
  const fn = OPERATIONS[op];
  if (!fn) {
    self.postMessage({ jobId, ok: false, error: { message: `Unknown operation: ${op}`, status: 0 } });
    return;
  }
  try {
    const result = await fn(...args);
    self.postMessage({ jobId, ok: true, result: result ?? null });
  } catch (error) {
    self.postMessage({
      jobId,
      ok: false,
      error: { message: error instanceof Error ? error.message : String(error), status: /** @type {any} */ (error)?.status ?? 0 },
    });
  }
};
