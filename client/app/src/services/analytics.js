/**
 * Google タグマネージャー / Google Analytics 4 (gtag.js) の薄いラッパー。
 * `VITE_GTM_ID` がビルド時に設定されていれば GTM (gtm.js) を読み込み、
 * 未設定で `VITE_GA_MEASUREMENT_ID` があれば従来どおり gtag.js を直接読み込む。
 * どちらも未設定の環境（開発・ステージング）では全関数が no-op になる。
 */

/** @type {string} GTM コンテナ ID（例: GTM-XXXXXXX）。未設定なら空文字 */
const GTM_ID = import.meta.env.VITE_GTM_ID ?? '';
/** @type {string} GA4 測定 ID（例: G-XXXXXXXXXX）。未設定なら空文字 */
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';

/** @type {boolean} スクリプトの読み込みを開始済みか */
let initialized = false;

/** gtag のグローバル窓口（dataLayer キューに積む公式パターン） */
function gtag() {
  /** @type {any} */ (window).dataLayer.push(arguments);
}

/**
 * 計測を初期化する。GTM ID も測定 ID も未設定なら何もしない。
 * SPA のため自動 page_view を抑制し、ルーターから手動送信する。
 */
export function initAnalytics() {
  if ((!GTM_ID && !MEASUREMENT_ID) || initialized || typeof window === 'undefined') return;
  initialized = true;

  const w = /** @type {any} */ (window);
  w.dataLayer = w.dataLayer || [];
  w.gtag = gtag;

  const script = document.createElement('script');
  script.async = true;
  script.src = GTM_ID ? `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}` : `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  // send_page_view: false で初期表示の自動送信を止め、ルーターで一元管理する
  // GTM の場合はコンテナ側のタグ設定で処理されるため config は送らない
  if (!GTM_ID) gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

/**
 * ページビューを送信する（SPA のルート遷移ごとに呼ぶ）。
 * @param {string} path 遷移先パス
 * @param {string} [title] ページタイトル
 */
export function trackPageView(path, title = document.title) {
  if (!initialized) return;
  gtag('event', 'page_view', { page_path: path, page_title: title });
}

/**
 * 任意のカスタムイベントを送信する。
 * @param {string} name イベント名（GA4 の推奨イベント名または任意名）
 * @param {Record<string, string|number|boolean>} [params] イベントパラメータ
 */
export function trackEvent(name, params = {}) {
  if (!initialized) return;
  gtag('event', name, params);
}
