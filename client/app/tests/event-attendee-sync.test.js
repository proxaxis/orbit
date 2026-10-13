import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertEvent: vi.fn(async () => ({ id: 'srv-1' })),
  updateEvent: vi.fn(async () => ({ id: 'srv-1' })),
  patchEvent: vi.fn(async () => ({ id: 'srv-1' })),
  deleteEvent: vi.fn(async () => null),
}));

vi.mock('@/services/google-calendar-api.js', () => mocks);
vi.mock('@/composables/useCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readCache: vi.fn(async (_key, fallback) => fallback),
    writeCache: vi.fn(async () => {}),
  };
});

const { runEventOperation } = await import('@/services/event-sync-worker.js');
const { processEventOperations } = await import('@/services/event-offline.js');

describe('イベントのバックグラウンド更新は PATCH を使う', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('update 操作は patchEvent に委譲する（PUT の完全置換では部分更新が失敗するため）', async () => {
    await runEventOperation('update', 'token', 'cal-1', 'evt-1', { attendees: [{ email: 'a@example.com', responseStatus: 'accepted' }] });
    expect(mocks.patchEvent).toHaveBeenCalledTimes(1);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('insert / remove 操作は従来どおり insertEvent / deleteEvent に委譲する', async () => {
    await runEventOperation('insert', 'token', 'cal-1', { summary: 'x' });
    await runEventOperation('remove', 'token', 'cal-1', 'evt-1');
    expect(mocks.insertEvent).toHaveBeenCalledTimes(1);
    expect(mocks.deleteEvent).toHaveBeenCalledTimes(1);
  });
});

describe('オフライン操作キューの再生', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('出欠回答などの部分更新は PATCH + sendUpdates で再生される', async () => {
    const { remaining, synced } = await processEventOperations([{ type: 'update', calendarId: 'cal-1', eventId: 'evt-1', body: { attendees: [{ email: 'a@example.com' }] } }], 'token');
    expect(synced).toBe(true);
    expect(remaining).toHaveLength(0);
    expect(mocks.patchEvent).toHaveBeenCalledWith('token', 'cal-1', 'evt-1', { attendees: [{ email: 'a@example.com' }] }, { sendUpdates: 'all' });
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('作成・削除も参加者へ通知する sendUpdates 付きで再生される', async () => {
    await processEventOperations(
      [
        { type: 'create', calendarId: 'cal-1', localId: 'local-1', body: { summary: 'x' } },
        { type: 'remove', calendarId: 'cal-1', eventId: 'evt-1' },
      ],
      'token',
    );
    expect(mocks.insertEvent).toHaveBeenCalledWith('token', 'cal-1', { summary: 'x' }, { sendUpdates: 'all' });
    expect(mocks.deleteEvent).toHaveBeenCalledWith('token', 'cal-1', 'evt-1', { sendUpdates: 'all' });
  });

  it('create 再生で確定したサーバ ID へ後続の update/remove を振り替える', async () => {
    const { remaining, synced } = await processEventOperations(
      [
        { type: 'create', calendarId: 'cal-1', localId: 'offline-abc', body: { summary: 'x' } },
        { type: 'update', calendarId: 'cal-1', eventId: 'offline-abc', body: { summary: 'y' } },
        { type: 'remove', calendarId: 'cal-1', eventId: 'offline-abc' },
      ],
      'token',
    );
    expect(synced).toBe(true);
    expect(remaining).toHaveLength(0);
    // ローカル ID のまま送ると 404 になるため、create で得た srv-1 に差し替わる
    expect(mocks.patchEvent).toHaveBeenCalledWith('token', 'cal-1', 'srv-1', { summary: 'y' }, { sendUpdates: 'all' });
    expect(mocks.deleteEvent).toHaveBeenCalledWith('token', 'cal-1', 'srv-1', { sendUpdates: 'all' });
  });

  it('対象が存在しない update/remove(404) は再試行せずキューから取り除く', async () => {
    mocks.patchEvent.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    mocks.deleteEvent.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 410 }));
    const { remaining, synced } = await processEventOperations(
      [
        { type: 'update', calendarId: 'cal-1', eventId: 'gone-1', body: { summary: 'y' } },
        { type: 'remove', calendarId: 'cal-1', eventId: 'gone-2' },
      ],
      'token',
    );
    expect(synced).toBe(true);
    expect(remaining).toHaveLength(0);
  });

  it('一時的な失敗(500)はキューに残して再試行する', async () => {
    mocks.patchEvent.mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }));
    const { remaining } = await processEventOperations([{ type: 'update', calendarId: 'cal-1', eventId: 'evt-1', body: {} }], 'token');
    expect(remaining).toHaveLength(1);
  });
});
