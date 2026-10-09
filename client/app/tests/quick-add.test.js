import { describe, expect, it } from 'vitest';
import dayjs from '@/services/dayjs.js';
import { extractSchedule, fallbackScheduleDraft, normalizeCalendarInput, repeatToRecurrence, toQuickAddDraft, validateQuickAddOutput } from '@/composables/useQuickAdd.js';

const base = dayjs('2025-11-19T12:00:00'); // 水曜日

describe('normalizeCalendarInput（日付）', () => {
  it('単独の「N日」は今月のその日になる', () => {
    expect(normalizeCalendarInput('19日に歯医者', base)).toContain('2025-11-19');
  });

  it('過ぎた「N日」は来月になる', () => {
    expect(normalizeCalendarInput('9日に歯医者', base)).toContain('2025-12-09');
  });

  it('「N日M時」は日付と時刻の両方が正規化される', () => {
    const normalized = normalizeCalendarInput('19日15時に会議', base);
    expect(normalized).toContain('2025-11-19');
    expect(normalized).toContain('15:00');
  });

  it('「毎月N日」は繰り返しトークンを保つ', () => {
    expect(normalizeCalendarInput('毎月19日に振込', base)).toContain('[繰り返し: 毎月19日]');
  });

  it('「N日分」は日付に変換しない', () => {
    expect(normalizeCalendarInput('3日分の仕事', base)).toContain('3日分');
  });
});

describe('extractSchedule', () => {
  it('日付・時刻を正規化テキストから抽出する', () => {
    const normalized = normalizeCalendarInput('明日の15時に歯医者', base);
    const schedule = extractSchedule(normalized, base);
    expect(schedule.startDate).toBe('2025-11-20');
    expect(schedule.endDate).toBe('2025-11-20');
    expect(schedule.startTime).toBe('15:00');
    expect(schedule.isAllDay).toBe(false);
  });

  it('時刻がなければ終日と判定する', () => {
    const schedule = extractSchedule('2025-11-20 旅行', base);
    expect(schedule.isAllDay).toBe(true);
    expect(schedule.startTime).toBe('');
  });

  it('2つの日付は日またぎになる', () => {
    const schedule = extractSchedule('2025-11-20 2025-11-22 旅行', base);
    expect(schedule.startDate).toBe('2025-11-20');
    expect(schedule.endDate).toBe('2025-11-22');
  });

  it('日付が取れない場合は基準日を使う', () => {
    const schedule = extractSchedule('買い物', base);
    expect(schedule.startDate).toBe('2025-11-19');
  });

  it('「N日間」「N泊」は終了日を計算する', () => {
    expect(extractSchedule('2025-11-20 から3日間 出張', base).endDate).toBe('2025-11-22');
    expect(extractSchedule('2025-11-20 から2泊 旅行', base).endDate).toBe('2025-11-22');
    expect(extractSchedule('2025-11-20 から1週間 出張', base).endDate).toBe('2025-11-26');
  });
});

describe('fallbackScheduleDraft', () => {
  it('日付・時刻・件名を正規化テキストから抽出する', () => {
    const normalized = normalizeCalendarInput('明日の15時に歯医者', base);
    const draft = fallbackScheduleDraft(normalized, '明日の15時に歯医者', base);
    expect(draft.startDate).toBe('2025-11-20');
    expect(draft.startTime).toBe('15:00');
    expect(draft.isAllDay).toBe(false);
    expect(draft.summary).toContain('歯医者');
  });

  it('場所・同席・繰り返しのマーカーを拾う', () => {
    const normalized = normalizeCalendarInput('毎週月曜の10時に会議室Aで田中さんと打ち合わせ', base);
    const draft = fallbackScheduleDraft(normalized, '毎週月曜の10時に会議室Aで田中さんと打ち合わせ', base);
    expect(draft.repeat).toContain('毎週月曜');
    expect(draft.location).toContain('会議室A');
    expect(draft.description).toContain('田中さん');
    expect(draft.startTime).toBe('10:00');
  });
});

describe('validateQuickAddOutput', () => {
  const valid = { summary: '歯医者', location: '', description: '', repeat: '', icon: '🏥' };

  it('正しい出力は null を返す', () => {
    expect(validateQuickAddOutput(valid)).toBeNull();
  });

  it('summary が空ならエラー', () => {
    expect(validateQuickAddOutput({ ...valid, summary: '  ' })).toBeTruthy();
    expect(validateQuickAddOutput({ ...valid, summary: 42 })).toBeTruthy();
  });

  it('文字列以外のフィールドはエラー', () => {
    expect(validateQuickAddOutput({ ...valid, repeat: true })).toBeTruthy();
    expect(validateQuickAddOutput({ ...valid, location: 1 })).toBeTruthy();
  });
});

describe('toQuickAddDraft', () => {
  const schedule = { startDate: '2025-11-20', endDate: '2025-11-20', startTime: '15:00', endTime: '', isAllDay: false };

  it('意味解析出力と日時をマージする', () => {
    const draft = toQuickAddDraft({ summary: '歯医者', location: '', description: '', repeat: '', icon: '🏥' }, '2025-11-20 15:00 歯医者', schedule);
    expect(draft).toMatchObject({ summary: '歯医者', startDate: '2025-11-20', startTime: '15:00', icon: '🏥', isAllDay: false });
  });

  it('正規化マーカーは LLM 出力より優先する', () => {
    const d = { summary: '打ち合わせ', location: 'オンライン', description: '資料確認', repeat: '', icon: '' };
    const normalized = '2025-11-24 10:00 [場所: 会議室A] [同席: 田中さん] [繰り返し: 毎週月曜] 打ち合わせ';
    const draft = toQuickAddDraft(d, normalized, { ...schedule, startDate: '2025-11-24', startTime: '10:00' });
    expect(draft.location).toBe('会議室A');
    expect(draft.description).toContain('田中さん');
    expect(draft.description).toContain('資料確認');
    expect(draft.repeat).toBe('毎週月曜');
  });

  it('repeat が真偽値相当の文字列なら無視する', () => {
    for (const junk of ['true', 'false', 'none', 'なし', '無し']) {
      expect(toQuickAddDraft({ summary: 'x', repeat: junk, icon: '' }, 'x', schedule).repeat).toBe('');
    }
  });

  it('icon が候補外なら空にする', () => {
    expect(toQuickAddDraft({ summary: 'x', repeat: '', icon: '🧬' }, 'x', schedule).icon).toBe('');
    expect(toQuickAddDraft({ summary: 'x', repeat: '', icon: '🏥' }, 'x', schedule).icon).toBe('🏥');
  });
});

describe('repeatToRecurrence', () => {
  it('毎週X曜を週次ルールに変換する', () => {
    expect(repeatToRecurrence('毎週月曜')).toMatchObject({ frequency: 'WEEKLY', weekdays: ['MO'] });
  });

  it('表現できないルールは null', () => {
    expect(repeatToRecurrence('第2火曜')).toBeNull();
  });
});
