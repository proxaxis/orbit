import { ref } from 'vue';
import dayjs from '@/services/dayjs.js';
import emojiData from '@/assets/emoji-data.json';

/**
 * カレンダー入力テキストの網羅的正規化・置換前処理
 * 文脈依存の多義語（お昼、ランチ、夕食など）を保護し、LLMに自然に解釈させます
 * @param {string} text 入力自然言語
 * @param {dayjs.Dayjs} [baseDate=dayjs()] 基準日時
 * @returns {string} 置換・正規化後のテキスト
 */
export function normalizeCalendarInput(text, baseDate = dayjs()) {
  if (!text) return '';

  let s = text.normalize('NFKC');

  const fmtDate = (d) => d.format('YYYY-MM-DD');

  // 1. 和暦・漢数字
  s = s.replace(/令和([0-9]+|元)年/g, (_, p1) => `${2018 + (p1 === '元' ? 1 : parseInt(p1, 10))}年`);
  const kanjiDigits = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  s = s.replace(/([一二三四五六七八九十〇]+)\s*(年|月|日|時|分)/g, (match, kanji, unit) => {
    let num = 0;
    if (kanji === '十') num = 10;
    else if (kanji.startsWith('十')) num = 10 + (kanjiDigits[kanji[1]] || 0);
    else if (kanji.includes('十')) {
      const parts = kanji.split('十');
      num = (kanjiDigits[parts[0]] || 1) * 10 + (kanjiDigits[parts[1]] || 0);
    } else {
      num = kanji.split('').reduce((acc, c) => acc * 10 + (kanjiDigits[c] || 0), 0);
    }
    return `${num}${unit}`;
  });

  // 2. 繰り返しの退避
  const repeatTokens = [];
  const holdToken = (val) => {
    const key = `__REPEAT_TOKEN_${repeatTokens.length}__`;
    repeatTokens.push({ key, val });
    return key;
  };
  s = s.replace(/平日毎日/g, () => holdToken('[繰り返し: 毎週月〜金]'));
  s = s.replace(/毎週末/g, () => holdToken('[繰り返し: 毎週土日]'));
  s = s.replace(/毎日/g, () => holdToken('[繰り返し: 毎日]'));
  s = s.replace(/第([1-5])\s*・?\s*第?([1-5])?\s*([日月火水木金土])曜日?/g, (_, p1, p2, w) => holdToken(`[繰り返し: 第${p1}${p2 || ''}${w}曜]`));
  s = s.replace(/毎週\s*([日月火水木金土])曜日?/g, (_, w) => holdToken(`[繰り返し: 毎週${w}曜]`));
  s = s.replace(/隔週\s*([日月火水木金土])曜日?/g, (_, w) => holdToken(`[繰り返し: 隔週${w}曜]`));
  s = s.replace(/毎月\s*([0-9]{1,2})日/g, (_, d) => holdToken(`[繰り返し: 毎月${d}日]`));

  // 3. 祝日・イベント
  s = s.replace(/元日/g, '1月1日');
  s = s.replace(/成人の日/g, '1月の第2月曜日');
  s = s.replace(/ゴールデンウィーク|GW/gi, '5月3日〜5月5日');
  s = s.replace(/お盆/g, '8月13日〜8月16日');
  s = s.replace(/ハロウィン/g, '10月31日');
  s = s.replace(/クリスマスイブ/g, '12月24日');
  s = s.replace(/クリスマス/g, '12月25日');
  s = s.replace(/大晦日/g, '12月31日');

  // 4. 日付相対表現
  s = s.replace(/明々後日|しあさって/g, fmtDate(baseDate.add(3, 'day')));
  s = s.replace(/明後日|あさって/g, fmtDate(baseDate.add(2, 'day')));
  s = s.replace(/明日|あした|みょうにち/g, fmtDate(baseDate.add(1, 'day')));
  s = s.replace(/一昨日|おととい/g, fmtDate(baseDate.subtract(2, 'day')));
  s = s.replace(/今日|きょう|本日/g, fmtDate(baseDate));
  s = s.replace(/昨日|きのう/g, fmtDate(baseDate.subtract(1, 'day')));

  s = s.replace(/([0-9]+)\s*日後/g, (_, n) => fmtDate(baseDate.add(parseInt(n, 10), 'day')));
  s = s.replace(/([0-9]+)\s*週(?:間)?後/g, (_, n) => fmtDate(baseDate.add(parseInt(n, 10), 'week')));
  s = s.replace(/([0-9]+)\s*ヶ?月後/g, (_, n) => fmtDate(baseDate.add(parseInt(n, 10), 'month')));
  s = s.replace(/半年後/g, () => fmtDate(baseDate.add(6, 'month')));

  const weekdayMap = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
  s = s.replace(/明けの月曜(?:日)?/g, () => {
    const currentDay = baseDate.day();
    const offset = (8 - currentDay) % 7 || 7;
    return fmtDate(baseDate.add(offset, 'day'));
  });
  s = s.replace(/(今週|来週|再来週|次の|今度の)?\s*(の)?\s*([日月火水木金土])曜日?/g, (match, prefix, no, w) => {
    const targetDay = weekdayMap[w];
    const currentDay = baseDate.day();
    let offset = (targetDay - currentDay + 7) % 7;
    if (prefix === '来週') {
      const daysUntilNextSunday = (7 - currentDay) % 7 || 7;
      const targetOffset = targetDay === 0 ? 0 : targetDay;
      return fmtDate(baseDate.add(daysUntilNextSunday + targetOffset, 'day'));
    } else if (prefix === '再来週') {
      const daysUntilNextSunday = (7 - currentDay) % 7 || 7;
      const targetOffset = targetDay === 0 ? 0 : targetDay;
      return fmtDate(baseDate.add(daysUntilNextSunday + 7 + targetOffset, 'day'));
    } else if (prefix === '今週') {
      return fmtDate(baseDate.add(offset, 'day'));
    } else if (prefix === '今度の' || prefix === '次の') {
      return fmtDate(baseDate.add(offset === 0 ? 7 : offset, 'day'));
    } else {
      return fmtDate(baseDate.add(offset === 0 ? 7 : offset, 'day'));
    }
  });

  s = s.replace(/今週末/g, () => fmtDate(baseDate.add((6 - baseDate.day() + 7) % 7, 'day')));
  s = s.replace(/月末/g, () => fmtDate(baseDate.endOf('month')));
  s = s.replace(/月初/g, () => fmtDate(baseDate.startOf('month')));
  s = s.replace(/年度末/g, () => {
    const y = baseDate.month() >= 3 ? baseDate.year() + 1 : baseDate.year();
    return `${y}-03-31`;
  });

  s = s.replace(/([0-9]{4})[年\/-]([0-9]{1,2})[月\/-]([0-9]{1,2})日?/g, (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
  s = s.replace(/(?<![0-9\-])([0-9]{1,2})[月\/]([0-9]{1,2})日?(?![0-9\-])/g, (match, m, d) => {
    if (text.includes('元日') || text.includes('クリスマス') || text.includes('ハロウィン')) return match;
    return `${baseDate.year()}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  });

  // 単独の「N日」→ 今月のその日。既に過ぎていれば来月。存在しない日（2月30日など）は原表記を維持する
  s = s.replace(/(?<![0-9\-\/年月日])([1-9]|[12][0-9]|3[01])日(?!間|後|目|曜|分)/g, (match, d) => {
    const day = parseInt(d, 10);
    /** @param {dayjs.Dayjs} base その月にその日が存在すれば返す */
    const apply = (base) => {
      const t = base.date(day);
      return t.date() === day ? t : null;
    };
    const thisMonth = apply(baseDate);
    const target = thisMonth && !thisMonth.isBefore(baseDate, 'day') ? thisMonth : apply(baseDate.add(1, 'month'));
    // 直後の時刻表記（19日15時 → ISO15時）と数字が連結して時刻ルールの後読みに失敗しないよう空白を挿入する
    return target ? `${fmtDate(target)} ` : match;
  });

  // 5. 時刻（修飾語が確実に時刻を指している場合のみ処理）
  s = s.replace(/深夜\s*([0-9]{1,2})時/g, (_, h) => `${String(parseInt(h, 10) % 24).padStart(2, '0')}:00`);
  s = s.replace(/(?:午前|am)\s*([0-9]{1,2})時(?:([0-9]{1,2})分)?/gi, (_, h, m) => `${String(h).padStart(2, '0')}:${m ? String(m).padStart(2, '0') : '00'}`);
  s = s.replace(/(?:午後|pm)\s*([0-9]{1,2})時(?:([0-9]{1,2})分)?/gi, (_, h, m) => {
    const hour = parseInt(h, 10) < 12 ? parseInt(h, 10) + 12 : parseInt(h, 10);
    return `${String(hour).padStart(2, '0')}:${m ? String(m).padStart(2, '0') : '00'}`;
  });
  s = s.replace(/(?:午前|am)\s*([0-9]{1,2}):([0-9]{2})/gi, (_, h, m) => `${String(h).padStart(2, '0')}:${m}`);
  s = s.replace(/(?:午後|pm)\s*([0-9]{1,2}):([0-9]{2})/gi, (_, h, m) => {
    const hour = parseInt(h, 10) < 12 ? parseInt(h, 10) + 12 : parseInt(h, 10);
    return `${String(hour).padStart(2, '0')}:${m}`;
  });

  // 朝・夜・夕方は「X時」が後続する場合のみ安全に置換
  s = s.replace(/朝\s*([0-9]{1,2})時(?:([0-9]{1,2})分)?/g, (_, h, m) => `${String(h).padStart(2, '0')}:${m ? String(m).padStart(2, '0') : '00'}`);
  s = s.replace(/(?:夜|夕方)\s*([0-9]{1,2})時(?:([0-9]{1,2})分)?/g, (_, h, m) => {
    const hour = parseInt(h, 10) < 12 ? parseInt(h, 10) + 12 : parseInt(h, 10);
    return `${String(hour).padStart(2, '0')}:${m ? String(m).padStart(2, '0') : '00'}`;
  });

  s = s.replace(/正午|昼12時/g, '12:00');
  s = s.replace(/([0-9]{1,2})時半/g, (_, h) => `${String(h).padStart(2, '0')}:30`);
  s = s.replace(/([0-9]{1,2})時([0-9]{1,2})分/g, (_, h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

  // 所要時間
  s = s.replace(/([0-9]{1,2}:[0-9]{2})\s*から\s*([0-9]+)時間(?:間)?/g, (_, startTime, hours) => {
    const [h, m] = startTime.split(':').map(Number);
    return `${startTime}〜${String(h + parseInt(hours, 10)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });

  // 単独の「X時」
  s = s.replace(/(?<![:0-9])([1-9]|1[0-2])時(?!間|[:0-9分])/g, (_, h) => {
    let hour = parseInt(h, 10);
    if (hour <= 7) hour += 12;
    return `${String(hour).padStart(2, '0')}:00`;
  });
  s = s.replace(/(?<![:0-9])(1[3-9]|2[0-3])時(?!間|[:0-9分])/g, (_, h) => `${h}:00`);
  s = s.replace(/(?<![:0-9])0?0時(?!間|[:0-9分])/g, '00:00');

  s = s.replace(/([0-9]{1,2}:[0-9]{2})\s*[-~〜]\s*([0-9]{1,2}:[0-9]{2})/g, '$1〜$2');
  s = s.replace(/([0-9]{1,2}:[0-9]{2})\s*から\s*([0-9]{1,2}:[0-9]{2})(?:まで)?/g, '$1〜$2');

  // 多義語保護（定時後・寝る前などの確定語のみ）
  const strictTimes = [
    { pattern: /始業前/g, replace: '08:45' },
    { pattern: /定時後|退勤後|終業後/g, replace: '18:00' },
    { pattern: /寝る前/g, replace: '22:00' },
  ];
  strictTimes.forEach((v) => {
    s = s.replace(v.pattern, v.replace);
  });

  s = s.replace(/丸一日|終日/g, '[終日]');

  // 6. 場所・手段・参加者
  s = s.replace(/(?:オンライン|Zoom|Google Meet|Teams)/gi, (m) => `[場所/手段: ${m}]`);
  s = s.replace(/会議室[A-Z0-9\-]+/gi, (m) => `[場所: ${m}]`);
  s = s.replace(/本社[0-9]+F?にて?/g, (m) => `[場所: ${m.replace(/にて?/, '')}]`);
  s = s.replace(/(?:電話で|リモートで|往訪)/g, (m) => `[手段: ${m}] `);
  s = s.replace(/(?<=[、\sで]|^)([^、\sで]+(?:さん|様|部長|みんな|クライアント))\s*(?:と(?:一緒?に?)?|同席)/g, '[同席: $1] ');

  // 7. アクション・意図・語尾
  s = s.replace(/することになった|しなきゃ|の約束/g, '');
  s = s.replace(/\s*しよ(?:う)?\s*$/g, '');
  s = s.replace(/\s*(?:カレンダーに|予定に)?(?:入れといて|いれといて|入れておいて)\s*$/g, '');
  s = s.replace(/\s*(?:を)?(?:追加|登録|入れて|セットして|予定に入れて|いれて|カレンダーに入れて)(?:してください|して)?\s*$/g, '');
  s = s.replace(/\s*(?:が)?(?:ある|の予定|ミーティング|打ち合わせ)\s*$/g, (m) => (s.trim() === m.trim() ? m : ''));

  s = s.replace(/([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[のに]?\s*/g, '$1 ');
  s = s.replace(/([0-9]{1,2}:[0-9]{2})\s*から\s*/g, '$1 ');

  // 8. 繰り返し復元
  repeatTokens.forEach((t) => {
    s = s.replace(new RegExp(`${t.key}\\s*の?\\s*`), `${t.val} `);
  });

  return s.trim().replace(/\s+/g, ' ');
}

// =========================================================
// WebLLM によるスケジュール抽出
// =========================================================

/** 自然言語解析に使う軽量モデル（初回はダウンロードに時間がかかる） */
const QUICK_ADD_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

/** @type {string[]} 絵文字ピッカー（emoji-data.json）に収録された絵文字。LLM はこの中から1つだけ選ぶ */
const QUICK_ADD_EMOJI_CHOICES = [...new Set(Object.values(emojiData).flatMap((items) => items.map((item) => item.char)))];

/** @type {Set<string>} 絵文字候補の検証用セット（結合文字列も1要素として保持） */
const QUICK_ADD_EMOJI_SET = new Set(QUICK_ADD_EMOJI_CHOICES);

/**
 * @type {string[]} プロンプトに提示する厳選絵文字。
 * 全 276 種を列挙すると軽量モデルのコンテキストを圧迫するため、予定で使われやすい代表的なものに絞る。
 * 出力の検証は全候補（QUICK_ADD_EMOJI_SET）に対して行う。
 */
const QUICK_ADD_ICON_CANDIDATES = '📅 🗓️ ⏰ 🔔 💼 📝 📋 📞 💻 🤝 👥 🏢 🏫 📈 🍽️ ☕️ 🍱 🍜 🍺 🎂 🏥 💉 ✂️ 💇 🚗 🚃 🚅 🛫 🏨 🏡 🛒 👜 💳 📦 🎉 🎄 ⚽ 🏃 🏊 🎮 🎬 🎨 📖 🧹 💤 👶 🌸 ✅ 📌'.split(' ').filter((emoji) => QUICK_ADD_EMOJI_SET.has(emoji));

/** スケジュール抽出用のシステムプロンプト（日時は正規表現で抽出済み。LLM は意味解析のみ担当） */
const QUICK_ADD_SYSTEM_PROMPT = `あなたは予定文の意味解析AIです.
正規化テキストから予定の内容を解析し、以下のJSON形式のみを出力してください.
日付・時刻は別の処理で抽出するため、解析・出力に含めないでください.

JSONフォーマット:
{
  "summary": "予定名・用件",
  "location": "場所またはオンライン手段（なければ空欄）",
  "description": "参加者・同席者・その他スケジュールの詳細（なければ空欄）",
  "repeat": "繰り返しルール（なければ空欄）",
  "icon": "予定に合う絵文字"
}

文脈判定ルール:
- テキスト中の YYYY-MM-DD・HH:MM・[終日] は日時情報です. summary・description に含めないでください.
- [場所: X]/[場所/手段: X]/[手段: X] は場所、[同席: X] は同席者、[繰り返し: X] は繰り返しのヒントです.
- summary には日時・場所・同席者・繰り返しを除いた予定名・用件だけを書いてください.
- 「お昼を食べる」「ランチミーティング」のように食事や行事そのものは summary として扱ってください.
- icon には summary の内容に最も合う絵文字を次の候補から1つだけ選んでください. 適切なものがなければ 📌 にしてください.
絵文字候補: ${QUICK_ADD_ICON_CANDIDATES.join(' ')}
`;

/** @type {string} WebLLM の JSON mode に渡すスキーマ。文法制約で出力構造を強制し、形式崩れを防ぐ */
const QUICK_ADD_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    summary: { type: 'string', description: '予定名・用件' },
    location: { type: 'string', description: '場所またはオンライン手段' },
    description: { type: 'string', description: '参加者・同席者・その他詳細' },
    repeat: { type: 'string', description: '繰り返しルール。なければ空文字' },
    icon: { type: 'string', description: '候補から選んだ絵文字1つ' },
  },
  required: ['summary', 'location', 'description', 'repeat', 'icon'],
  additionalProperties: false,
});

/** @type {RegExp} 時刻フォーマットの検証用 */
const QUICK_ADD_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @param {string} normalized 正規化済みテキスト @param {RegExp} re マーカー抽出用正規表現 @returns {string} キャプチャした値 */
function pickNormalizedTag(normalized, re) {
  return normalized.match(re)?.[1]?.trim() ?? '';
}

/**
 * 正規化済みテキストから日時を正規表現で抽出する。
 * 日時は LLM に任せず決定論的に処理する（ハルシネーションを防ぐため）。
 * @param {string} normalized 正規化済みテキスト
 * @param {dayjs.Dayjs} [baseDate] 日付が取れなかった場合の基準日
 * @returns {{startDate: string, endDate: string, startTime: string, endTime: string, isAllDay: boolean}} 日時部分
 */
export function extractSchedule(normalized, baseDate = dayjs()) {
  const dates = [...new Set(normalized.match(/\d{4}-\d{2}-\d{2}/g) ?? [])];
  const times = [...new Set((normalized.match(/\d{1,2}:[0-5]\d/g) ?? []).map((t) => t.padStart(5, '0')).filter((t) => QUICK_ADD_TIME_RE.test(t)))];
  const isAllDay = normalized.includes('[終日]') || times.length === 0;
  const startDate = dates[0] ?? baseDate.format('YYYY-MM-DD');
  // 「N日間」「N泊」「N週間」は日またぎを意味するため、第2日付がなければ終了日を計算する
  let endDate = dates[1] ?? startDate;
  if (!dates[1]) {
    const span = normalized.match(/([0-9]+)(日間|泊|週間)/);
    if (span) {
      const n = parseInt(span[1], 10);
      const addDays = span[2] === '日間' ? n - 1 : span[2] === '泊' ? n : n * 7 - 1;
      if (addDays > 0) endDate = dayjs(startDate).add(addDays, 'day').format('YYYY-MM-DD');
    }
  }
  return {
    startDate,
    endDate,
    startTime: isAllDay ? '' : (times[0] ?? ''),
    endTime: isAllDay ? '' : (times[1] ?? ''),
    isAllDay,
  };
}

/**
 * LLM の意味解析出力（summary/location/description/repeat/icon）を検証する
 * @param {unknown} data パース済み JSON
 * @returns {string|null} 問題点の説明。妥当なら null
 */
export function validateQuickAddOutput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'JSON オブジェクトではありません';
  const d = /** @type {Record<string, unknown>} */ (data);
  if (typeof d.summary !== 'string' || !d.summary.trim()) return 'summary が空です';
  if (d.location !== undefined && typeof d.location !== 'string') return 'location が文字列ではありません';
  if (d.description !== undefined && typeof d.description !== 'string') return 'description が文字列ではありません';
  if (d.repeat !== undefined && typeof d.repeat !== 'string') return 'repeat が文字列ではありません';
  return null;
}

/** @type {RegExp} 「繰り返しなし」を意味するはずの値。これらが repeat に来ても退避・変換しない */
const QUICK_ADD_EMPTY_REPEAT_RE = /^(true|false|null|none|なし|無し|no)$/i;

/**
 * 検証済みの LLM 意味解析出力と、正規表現で抽出した日時をマージして QuickAddDraft を作る。
 * [場所:]/[同席:]/[繰り返し:] など正規化で付与された決定論的マーカーは LLM 出力より優先する。
 * @param {Record<string, any>} d 検証済みの LLM 出力
 * @param {string} normalized 正規化済みテキスト
 * @param {{startDate: string, endDate: string, startTime: string, endTime: string, isAllDay: boolean}} schedule extractSchedule の結果
 * @returns {QuickAddDraft} フォーム流し込み用ドラフト
 */
export function toQuickAddDraft(d, normalized, schedule) {
  // icon は前後に余計な文字が付くことがあるため、完全一致 → 部分一致（VS16 無し表記も許容）の順で候補から採用する
  const rawIcon = typeof d.icon === 'string' ? d.icon.trim() : '';
  const icon = QUICK_ADD_EMOJI_SET.has(rawIcon) ? rawIcon : (QUICK_ADD_EMOJI_CHOICES.find((emoji) => rawIcon.includes(emoji) || rawIcon.includes(emoji.replace(/️/g, ''))) ?? '');
  const rawRepeat = typeof d.repeat === 'string' ? d.repeat.trim() : '';
  const tagLocation = pickNormalizedTag(normalized, /\[場所(?:\/手段)?:\s*([^\]]+)\]/) || pickNormalizedTag(normalized, /\[手段:\s*([^\]]+)\]/);
  const tagAttendees = pickNormalizedTag(normalized, /\[同席:\s*([^\]]+)\]/);
  const tagRepeat = pickNormalizedTag(normalized, /\[繰り返し:\s*([^\]]+)\]/);
  const description = [tagAttendees ? `${tagAttendees}と同席` : '', typeof d.description === 'string' ? d.description.trim() : ''].filter(Boolean).join(' ');
  return {
    ...schedule,
    summary: String(d.summary).trim(),
    location: tagLocation || (typeof d.location === 'string' ? d.location : ''),
    description,
    repeat: tagRepeat || (QUICK_ADD_EMPTY_REPEAT_RE.test(rawRepeat) ? '' : rawRepeat),
    icon,
  };
}

/**
 * @typedef {Object} QuickAddDraft 自然言語解析の結果。イベントフォームへの流し込みに使う
 * @property {string} startDate YYYY-MM-DD
 * @property {string} startTime HH:mm（空なら終日）
 * @property {string} endDate YYYY-MM-DD
 * @property {string} endTime HH:mm
 * @property {string} summary 予定名
 * @property {string} location 場所・手段
 * @property {string} description 詳細
 * @property {string} repeat 繰り返しルールのテキスト
 * @property {string} icon イベントアイコンの絵文字（候補外・未選択なら空文字）
 * @property {boolean} isAllDay 終日予定かどうか（LLM の判定。true の場合時刻は空）
 */

/** @type {import('vue').Ref<{status: 'idle'|'loading'|'ready'|'error'|'unsupported', message: string}>} WebLLM エンジンの状態 */
export const quickAddEngineState = ref({ status: 'idle', message: '' });

/** @type {Promise<any>|null} 初期化中・初期化済みのエンジン Promise（多重起動防止） */
let enginePromise = null;

/** @type {number} 出力チェックに失敗した場合の最大再試行回数（初回を含む） */
const MAX_QUICK_ADD_ATTEMPTS = 3;

/**
 * WebLLM エンジンを取得する。未取得ならモデルの読み込み（初回はダウンロード）を開始する
 * @returns {Promise<any>} MLCEngine インスタンス
 */
export function ensureQuickAddEngine() {
  if (enginePromise) return enginePromise;
  if (!navigator.gpu) {
    quickAddEngineState.value = { status: 'unsupported', message: 'このブラウザは WebGPU に対応していません' };
    return Promise.reject(new Error('WebGPU is not supported in this browser'));
  }
  const task = (async () => {
    quickAddEngineState.value = { status: 'loading', message: 'モデルを読み込んでいます...' };
    // 初回実行まで本体をバンドルしないよう動的 import する
    const webllm = await import('@mlc-ai/web-llm');
    const engine = new webllm.MLCEngine();
    engine.setInitProgressCallback((/** @type {{text: string}} */ report) => {
      quickAddEngineState.value = { status: 'loading', message: report.text };
    });
    await engine.reload(QUICK_ADD_MODEL);
    quickAddEngineState.value = { status: 'ready', message: '解析の準備ができました' };
    return engine;
  })();
  enginePromise = task;
  task.catch((err) => {
    // 失敗時は次回呼び出しで再試行できるよう Promise を破棄する
    if (enginePromise === task) enginePromise = null;
    quickAddEngineState.value = { status: 'error', message: String(err?.message ?? err) };
  });
  return task;
}

/** @type {boolean} ウォームアップのスケジュール済みフラグ */
let warmupScheduled = false;

/**
 * PWA としてインストール済み（またはセッション中にインストール）の場合に、
 * モデルをバックグラウンドで先読みしておく。ダウンロードは WebLLM がブラウザキャッシュへ保存するため、
 * 以降の起動・オフライン時はキャッシュから高速に読み込める。
 * @returns {void}
 */
export function scheduleQuickAddWarmup() {
  if (warmupScheduled || typeof window === 'undefined') return;
  warmupScheduled = true;
  const warm = () => {
    // オフライン・WebGPU 非対応では何もしない（次回起動時に再判定される）
    if (!navigator.onLine || !navigator.gpu) return;
    const schedule = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 5000));
    schedule(() => ensureQuickAddEngine().catch(() => {}));
  };
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isStandalone) warm();
  window.addEventListener('appinstalled', warm);
}

/**
 * LLM を使わず、正規化済みテキストから正規表現でドラフトを組み立てる簡易解析。
 * 正規化で ISO 日付・HH:MM 時刻・[場所:]/[同席:]/[繰り返し:] マーカーが既に付与されているため、
 * AI が使えない環境（WebGPU 非対応・モデル読込失敗・出力不良の連続）でも実用的な結果を返せる。
 * @param {string} normalized 正規化済みテキスト
 * @param {string} original 元の入力テキスト
 * @param {dayjs.Dayjs} [baseDate] 日付が取れなかった場合の基準日
 * @returns {QuickAddDraft} 簡易解析ドラフト
 */
export function fallbackScheduleDraft(normalized, original, baseDate = dayjs()) {
  const location = pickNormalizedTag(normalized, /\[場所(?:\/手段)?:\s*([^\]]+)\]/) || pickNormalizedTag(normalized, /\[手段:\s*([^\]]+)\]/);
  const attendees = pickNormalizedTag(normalized, /\[同席:\s*([^\]]+)\]/);
  const repeat = pickNormalizedTag(normalized, /\[繰り返し:\s*([^\]]+)\]/);
  // マーカーと日時トークンを取り除いた残りを件名にする。空なら元入力を掃除して使う
  const clean = (/** @type {string} */ s) =>
    s
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\d{4}-\d{2}-\d{2}/g, ' ')
      .replace(/(?:[01]\d|2[0-3]):[0-5]\d/g, ' ')
      .replace(/[〜~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const summary = clean(normalized) || clean(original) || original.trim();
  return {
    ...extractSchedule(normalized, baseDate),
    summary,
    location,
    description: attendees ? `${attendees}と同席` : '',
    repeat,
    icon: '',
  };
}

/**
 * 正規化 → 日時は正規表現で抽出（extractSchedule）→ 意味部分は WebLLM（JSON Schema 制約出力）→ 出力チェック、
 * というパイプラインで自然言語をフォームデータへ変換する。
 * 出力が不正な場合は理由をフィードバックしてやり直させる（最大 MAX_QUICK_ADD_ATTEMPTS 回）。
 * エンジンが使えない・全試行失敗の場合は fallbackScheduleDraft の簡易解析結果を返す。
 * @param {string} text 入力された自然言語テキスト
 * @returns {Promise<{normalized: string, draft: QuickAddDraft, usedFallback: boolean}>} 正規化済みテキスト・解析結果・簡易解析フラグ
 */
export async function parseScheduleText(text) {
  const normalized = normalizeCalendarInput(text, dayjs());
  if (!normalized) throw new Error('予定の内容を入力してください');
  // 日時は正規表現で決定論的に抽出する（LLM は意味解析のみ担当し、日付を間違えない構造にする）
  const schedule = extractSchedule(normalized, dayjs());
  /** 簡易解析へフォールバックして結果を返す */
  const fallback = () => ({ normalized, draft: fallbackScheduleDraft(normalized, text, dayjs()), usedFallback: true });
  /** @type {any} */
  let engine;
  try {
    engine = await ensureQuickAddEngine();
  } catch {
    // WebGPU 非対応・モデル読込失敗でも簡易解析で続行する
    return fallback();
  }
  /** @type {{role: string, content: string}[]} 再試行時は会話を継続し、失敗理由をフィードバックしてやり直させる */
  const messages = [
    { role: 'system', content: QUICK_ADD_SYSTEM_PROMPT },
    { role: 'user', content: normalized },
  ];
  for (let attempt = 0; attempt < MAX_QUICK_ADD_ATTEMPTS; attempt++) {
    /** @type {any} 初回はスキーマ制約付き JSON mode、再試行は制約なし JSON mode で多様性を確保する */
    const request = {
      messages,
      temperature: 0.1,
      max_tokens: 384,
      response_format: attempt === 0 ? { type: 'json_object', schema: QUICK_ADD_JSON_SCHEMA } : { type: 'json_object' },
    };
    /** @type {any} */
    let response;
    try {
      response = await engine.chat.completions.create(request);
    } catch {
      // 推論自体の失敗（スキーマ非対応・コンテキスト超過など）は再試行しても同じ結果になりやすいため簡易解析へ
      break;
    }
    const reply = response.choices?.[0]?.message?.content ?? '';
    /** @param {string} reason 検出した問題 */
    const askRetry = (reason) => {
      quickAddEngineState.value = { status: 'loading', message: 'AI の出力をやり直しています...' };
      messages.push({ role: 'assistant', content: reply || '(空の応答)' }, { role: 'user', content: `出力が不正です（${reason}）。JSON フォーマットと文脈判定ルールに従い、JSON のみをもう一度出力してください` });
    };
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      askRetry('JSON 形式の出力がありませんでした');
      continue;
    }
    /** @type {unknown} */
    let data;
    try {
      data = JSON.parse(jsonMatch[0]);
    } catch {
      askRetry('JSON のパースに失敗しました');
      continue;
    }
    const d = /** @type {Record<string, any>} */ (data);
    const invalid = validateQuickAddOutput(d);
    if (invalid) {
      askRetry(invalid);
      continue;
    }
    const draft = toQuickAddDraft(d, normalized, schedule);
    quickAddEngineState.value = { status: 'ready', message: '解析の準備ができました' };
    return { normalized, draft, usedFallback: false };
  }
  return fallback();
}

/** @type {import('vue').Ref<QuickAddDraft|null>} 解析結果を EventCreator へ渡すためのドラフト */
const quickAddDraft = ref(null);

/**
 * 解析済みドラフトを保存する（EventForm の初期化で消費される）
 * @param {QuickAddDraft} draft 解析結果
 * @returns {void}
 */
export function setQuickAddDraft(draft) {
  quickAddDraft.value = draft;
}

/**
 * 解析済みドラフトを取り出してクリアする（1回限り）
 * @returns {QuickAddDraft|null} 解析結果
 */
export function takeQuickAddDraft() {
  const draft = quickAddDraft.value;
  quickAddDraft.value = null;
  return draft;
}

/**
 * LLM が出力した繰り返しテキストをフォームの recurrence 項目へ変換する。
 * 表現できないルール（第N曜など序数を含むもの）は null を返し、呼び出し側で詳細へ退避する。
 * @param {string} repeat 繰り返しルールのテキスト
 * @returns {{frequency: string, interval: number, weekdays: string[], monthDay: number|string}|null} recurrence へ流し込める値
 */
export function repeatToRecurrence(repeat) {
  const text = String(repeat ?? '');
  if (!text) return null;
  const weekdayCode = { 日: 'SU', 月: 'MO', 火: 'TU', 水: 'WE', 木: 'TH', 金: 'FR', 土: 'SA' };
  if (/平日|毎週月?[〜~]金/.test(text)) return { frequency: 'WEEKLY', interval: 1, weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'], monthDay: '' };
  if (/毎週末|毎週土日/.test(text)) return { frequency: 'WEEKLY', interval: 1, weekdays: ['SA', 'SU'], monthDay: '' };
  if (/毎日/.test(text)) return { frequency: 'DAILY', interval: 1, weekdays: [], monthDay: '' };
  const biweekly = text.match(/隔週\s*([日月火水木金土])曜/);
  if (biweekly) return { frequency: 'WEEKLY', interval: 2, weekdays: [weekdayCode[biweekly[1]]], monthDay: '' };
  const weekly = text.match(/毎週\s*([日月火水木金土])曜/);
  if (weekly) return { frequency: 'WEEKLY', interval: 1, weekdays: [weekdayCode[weekly[1]]], monthDay: '' };
  const monthly = text.match(/毎月\s*([0-9]{1,2})日/);
  if (monthly) return { frequency: 'MONTHLY', interval: 1, weekdays: [], monthDay: Number(monthly[1]) };
  if (/毎年/.test(text)) return { frequency: 'YEARLY', interval: 1, weekdays: [], monthDay: '' };
  return null;
}
