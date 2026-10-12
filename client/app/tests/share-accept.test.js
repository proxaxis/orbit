import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

const mocks = vi.hoisted(() => ({
  query: { cid: 'copy-cal@group.calendar.google.com' },
  fetchCalendarResource: vi.fn(async () => ({ id: 'copy-cal@group.calendar.google.com', summary: '共有カレンダー', description: '説明文' })),
  addCalendarListEntry: vi.fn(async () => ({})),
  replace: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ token: 'token', isAuthenticated: true }),
}));
vi.mock('@/composables/useCalendars.js', () => ({
  useCalendars: () => mocks,
}));
vi.mock('@/composables/useCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readCache: vi.fn(async (_key, fallback) => fallback),
    writeCache: vi.fn(async () => {}),
  };
});

const { buildShareAcceptUrl } = await import('@/services/share-sync.js');
const { rememberPendingShareAccept, takePendingShareAccept, clearPendingShareAccept } = await import('@/services/share-accept.js');
const { default: ShareAcceptView } = await import('@/views/ShareAcceptView.vue');
const { useCalendarStore } = await import('@/stores/calendar.js');

describe('buildShareAcceptUrl', () => {
  it('カレンダー ID 入りの受け入れリンクを生成する', () => {
    const url = buildShareAcceptUrl('abc@group.calendar.google.com', { baseUrl: 'https://orbit.example.com' });
    expect(url).toBe('https://orbit.example.com/share/accept?cid=abc%40group.calendar.google.com');
    expect(buildShareAcceptUrl(null, { baseUrl: 'https://orbit.example.com' })).toBeNull();
  });

  it('mode=list のリンクには登録先が含まれる', () => {
    const url = buildShareAcceptUrl('abc@group.calendar.google.com', { baseUrl: 'https://orbit.example.com', mode: 'list' });
    expect(url).toBe('https://orbit.example.com/share/accept?cid=abc%40group.calendar.google.com&mode=list');
  });
});

describe('受け入れ待ちの保留（未ログイン時の復帰）', () => {
  it('保存した ID と登録先を一度だけ取り出せる', () => {
    sessionStorage.clear();
    rememberPendingShareAccept('cal-123@group.calendar.google.com');
    expect(takePendingShareAccept()).toEqual({ cid: 'cal-123@group.calendar.google.com', mode: 'session' });
    // 一度取り出したら消費される
    expect(takePendingShareAccept()).toBeNull();
  });

  it('list モードの保留を復元できる', () => {
    sessionStorage.clear();
    rememberPendingShareAccept('cal-abc@group.calendar.google.com', 'list');
    expect(takePendingShareAccept()).toEqual({ cid: 'cal-abc@group.calendar.google.com', mode: 'list' });
  });

  it('有効期限切れ・空・破損データは取り出さない', () => {
    sessionStorage.clear();
    expect(takePendingShareAccept()).toBeNull();
    sessionStorage.setItem('orbitShareAcceptPending', '{broken');
    expect(takePendingShareAccept()).toBeNull();
    sessionStorage.setItem('orbitShareAcceptPending', JSON.stringify({ cid: 'cal@x', at: Date.now() - 60 * 60 * 1000 }));
    expect(takePendingShareAccept()).toBeNull();
  });

  it('明示的にクリアできる', () => {
    sessionStorage.clear();
    rememberPendingShareAccept('cal-456@group.calendar.google.com');
    clearPendingShareAccept();
    expect(takePendingShareAccept()).toBeNull();
  });
});

describe('ShareAcceptView（共有カレンダーの受け入れ）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.query = { cid: 'copy-cal@group.calendar.google.com' };
    mocks.fetchCalendarResource.mockImplementation(async () => ({ id: 'copy-cal@group.calendar.google.com', summary: '共有カレンダー', description: '説明文' }));
    mocks.addCalendarListEntry.mockImplementation(async () => ({}));
  });

  it('共有されたカレンダー名を表示して確認を促す', async () => {
    const wrapper = mount(ShareAcceptView);
    await nextTick();
    await nextTick();
    expect(mocks.fetchCalendarResource).toHaveBeenCalledWith('copy-cal@group.calendar.google.com');
    expect(wrapper.text()).toContain('共有カレンダー');
    expect(wrapper.text()).toContain('セッションカレンダーに登録しますか');
  });

  it('登録ボタンでセッションカレンダーへ登録しホームへ戻る', async () => {
    const calendarStore = useCalendarStore();
    const wrapper = mount(ShareAcceptView);
    await nextTick();
    await nextTick();

    const acceptButton = wrapper.findAll('button').find((button) => button.text().includes('セッションカレンダーに登録'));
    await acceptButton.trigger('click');

    expect(calendarStore.sessionCalendars.some((calendar) => calendar.id === 'copy-cal@group.calendar.google.com')).toBe(true);
    expect(calendarStore.getCalendarName('copy-cal@group.calendar.google.com')).toBe('共有カレンダー');
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'Home' });
  });

  it('mode=list の場合はカレンダーリストへの登録を行う', async () => {
    mocks.query = { cid: 'copy-cal@group.calendar.google.com', mode: 'list' };
    const wrapper = mount(ShareAcceptView);
    await nextTick();
    await nextTick();

    expect(wrapper.text()).toContain('カレンダーリストに登録しますか');
    const acceptButton = wrapper.findAll('button').find((button) => button.text().includes('カレンダーリストに登録'));
    await acceptButton.trigger('click');
    await nextTick();

    expect(mocks.addCalendarListEntry).toHaveBeenCalledWith({ id: 'copy-cal@group.calendar.google.com', colorRgbFormat: true, selected: true });
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'Home' });
  });

  it('mode=list の登録に失敗した場合はエラーを表示して画面に留まる', async () => {
    mocks.query = { cid: 'copy-cal@group.calendar.google.com', mode: 'list' };
    mocks.addCalendarListEntry.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const wrapper = mount(ShareAcceptView);
    await nextTick();
    await nextTick();

    const acceptButton = wrapper.findAll('button').find((button) => button.text().includes('カレンダーリストに登録'));
    await acceptButton.trigger('click');
    await nextTick();
    await nextTick();

    expect(wrapper.text()).toContain('カレンダーリストへの登録に失敗しました');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('カレンダー情報の取得に失敗した場合は案内メッセージを表示する', async () => {
    const notFound = Object.assign(new Error('Not Found'), { status: 404 });
    mocks.fetchCalendarResource.mockRejectedValue(notFound);
    const wrapper = mount(ShareAcceptView);
    await nextTick();
    await nextTick();
    expect(wrapper.text()).toContain('共有されていないか、すでに削除されています');
    expect(wrapper.findAll('button').find((button) => button.text().includes('セッションカレンダーに登録'))).toBeUndefined();
  });
});
