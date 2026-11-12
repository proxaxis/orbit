/**
 * 共有カレンダー受け入れリンクの保留を管理する純粋モジュール。
 * 未ログインで受け入れリンク（/share/accept?cid=...）を開いた場合、
 * ログイン処理（外部サイトへのリダイレクト往復）で URL が失われるため、
 * 対象カレンダー ID と登録先をセッションストレージへ一時保存して復帰に使う。
 */

/** セッションストレージのキー名 */
const PENDING_KEY = 'orbitShareAcceptPending';
/** 保留の有効期間（30 分。ログイン往復が終われば十分な時間） */
const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * 受け入れ待ちの共有カレンダー ID と登録先をセッションストレージへ保存する
 * @param {string} calendarId 共有対象のカレンダー ID
 * @param {'session'|'list'} [mode] 登録先（'session'=セッションカレンダー、'list'=カレンダーリスト）
 * @returns {void}
 */
export function rememberPendingShareAccept(calendarId, mode = 'session') {
  if (typeof sessionStorage === 'undefined' || !calendarId) return;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ cid: calendarId, mode, at: Date.now() }));
}

/**
 * 受け入れ待ちの共有情報を取り出してクリアする（一度きりの消費）
 * @returns {{cid: string, mode: 'session'|'list'}|null} 有効期間内の情報、無ければ null
 */
export function takePendingShareAccept() {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    if (typeof pending?.cid === 'string' && pending.cid && Date.now() - pending.at < PENDING_TTL_MS) {
      return { cid: pending.cid, mode: pending.mode === 'list' ? 'list' : 'session' };
    }
  } catch {
    // 破損データは無視する
  }
  return null;
}

/** 受け入れ待ち情報を消去する */
export function clearPendingShareAccept() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_KEY);
}
