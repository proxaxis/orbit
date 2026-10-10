/**
 * イベント保存操作を専用 Web Worker で実行するマネージャ。
 * Vue / Pinia に依存しない純粋モジュール。Worker が使えない環境
 * （テスト・非対応ブラウザ）ではメインスレッドで直接実行するフォールバック付き。
 */
import * as gCalAPI from '@/services/google-calendar-api.js';

/**
 * 操作名に対応するサービス関数を返す（呼び出し時に解決する。
 * モジュール読み込み時に参照するとテストの部分モックで失敗するため遅延解決する）
 * @param {'insert'|'update'|'remove'} op 実行する操作
 * @returns {Function|null} サービス関数
 */
function operationFor(op) {
  if (op === 'insert') return gCalAPI.insertEvent;
  if (op === 'update') return gCalAPI.updateEvent;
  if (op === 'remove') return gCalAPI.deleteEvent;
  return null;
}

/** @type {Worker|null} 遅延生成する共有ワーカー */
let worker = null;
/** @type {number} ジョブ ID のシーケンス */
let jobSeq = 0;
/** @type {Map<number, {resolve: (value: any) => void, reject: (error: Error) => void}>} 実行中ジョブ */
const pendingJobs = new Map();

/**
 * 共有ワーカーを取得する（なければ生成）
 * @returns {Worker} ワーカーインスタンス
 */
function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/event-sync-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { jobId, ok, result, error } = event.data ?? {};
      const job = pendingJobs.get(jobId);
      if (!job) return;
      pendingJobs.delete(jobId);
      if (ok) job.resolve(result);
      else job.reject(Object.assign(new Error(error?.message ?? 'Background sync failed'), { status: error?.status ?? 0 }));
    };
    // ワーカー自体のエラーでは残っているジョブをすべて失敗扱いにする
    worker.onerror = () => {
      pendingJobs.forEach((job) => job.reject(new Error('Event sync worker crashed')));
      pendingJobs.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/**
 * イベント操作をワーカーで実行する。
 * Worker が使えない環境では同じサービス関数をその場で実行する。
 * @param {'insert'|'update'|'remove'} op 実行する操作
 * @param {...any} args サービス関数へ渡す引数（先頭はアクセストークン）
 * @returns {Promise<any>} サービス関数の戻り値
 */
export function runEventOperation(op, ...args) {
  const fn = operationFor(op);
  if (!fn) return Promise.reject(new Error(`Unknown operation: ${op}`));
  if (typeof Worker !== 'function') return fn(...args);
  return new Promise((resolve, reject) => {
    const jobId = ++jobSeq;
    pendingJobs.set(jobId, { resolve, reject });
    try {
      ensureWorker().postMessage({ jobId, op, args });
    } catch (error) {
      pendingJobs.delete(jobId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
