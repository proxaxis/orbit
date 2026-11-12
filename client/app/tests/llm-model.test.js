import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import dayjs from '@/services/dayjs.js';
import { CACHE_KEYS } from '@/composables/useCache.js';

const mocks = vi.hoisted(() => ({
  storage: new Map(),
  hasModelInCache: vi.fn(async () => false),
  deleteModelAllInfoInCache: vi.fn(async () => {}),
  reload: vi.fn(async () => {}),
  unload: vi.fn(async () => {}),
  progressCallback: null,
}));

vi.mock('@/composables/useCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readCache: vi.fn(async (key, fallback) => (mocks.storage.has(key) ? mocks.storage.get(key) : fallback)),
    writeCache: vi.fn(async (key, value) => {
      mocks.storage.set(key, JSON.parse(JSON.stringify(value)));
    }),
    deleteCache: vi.fn(async (key) => {
      mocks.storage.delete(key);
    }),
  };
});

vi.mock('@mlc-ai/web-llm', () => ({
  hasModelInCache: mocks.hasModelInCache,
  deleteModelAllInfoInCache: mocks.deleteModelAllInfoInCache,
  MLCEngine: class {
    setInitProgressCallback = (callback) => {
      mocks.progressCallback = callback;
    };
    reload = mocks.reload;
    unload = mocks.unload;
  },
}));

/** モジュール状態をリセットして依存モジュールを再読み込みする */
async function freshSetup() {
  vi.resetModules();
  setActivePinia(createPinia());
  const quickAdd = await import('@/composables/useQuickAdd.js');
  const { useUserStore } = await import('@/stores/user.js');
  return { quickAdd, userStore: useUserStore() };
}

beforeEach(() => {
  mocks.storage.clear();
  vi.clearAllMocks();
  mocks.hasModelInCache.mockImplementation(async () => false);
  mocks.deleteModelAllInfoInCache.mockImplementation(async () => {});
  mocks.reload.mockImplementation(async () => {});
  mocks.unload.mockImplementation(async () => {});
  mocks.progressCallback = null;
  Object.defineProperty(globalThis.navigator, 'gpu', { value: {}, configurable: true, writable: true });
});

describe('isLlmPromptSuppressed（確認プロンプトの抑制判定）', () => {
  it('未拒否・不正な日付は抑制しない', async () => {
    const { quickAdd } = await freshSetup();
    expect(quickAdd.isLlmPromptSuppressed('')).toBe(false);
    expect(quickAdd.isLlmPromptSuppressed('not-a-date')).toBe(false);
  });

  it('拒否から1ヶ月以内は抑制する', async () => {
    const { quickAdd } = await freshSetup();
    const now = dayjs('2025-12-01T00:00:00');
    expect(quickAdd.isLlmPromptSuppressed('2025-11-19T12:00:00', now)).toBe(true);
    expect(quickAdd.isLlmPromptSuppressed('2025-11-30T23:59:59', now)).toBe(true);
  });

  it('拒否から1ヶ月を過ぎると抑制しない', async () => {
    const { quickAdd } = await freshSetup();
    const now = dayjs('2025-12-20T00:00:00');
    expect(quickAdd.isLlmPromptSuppressed('2025-11-19T12:00:00', now)).toBe(false);
  });
});

describe('ensureQuickAddEngineWithConsent（ダウンロード確認の抑制）', () => {
  it('拒否から1ヶ月以内は確認ダイアログを出さずに拒否する', async () => {
    mocks.storage.set(CACHE_KEYS.LLM_STATE, { installedAt: '', declinedAt: dayjs().subtract(10, 'day').toISOString() });
    const { quickAdd, userStore } = await freshSetup();
    const confirmSpy = vi.spyOn(userStore, 'confirm');

    await expect(quickAdd.ensureQuickAddEngineWithConsent()).rejects.toThrow('declined');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('拒否から1ヶ月を過ぎると再度確認する', async () => {
    mocks.storage.set(CACHE_KEYS.LLM_STATE, { installedAt: '', declinedAt: dayjs().subtract(2, 'month').toISOString() });
    const { quickAdd, userStore } = await freshSetup();
    const confirmSpy = vi.spyOn(userStore, 'confirm').mockResolvedValue(false);

    await expect(quickAdd.ensureQuickAddEngineWithConsent()).rejects.toThrow('declined');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('確認で「いいえ」を選ぶと拒否日時を永続化し、以降は確認しない', async () => {
    const { quickAdd, userStore } = await freshSetup();
    const confirmSpy = vi.spyOn(userStore, 'confirm').mockResolvedValue(false);

    await expect(quickAdd.ensureQuickAddEngineWithConsent()).rejects.toThrow('declined');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mocks.storage.get(CACHE_KEYS.LLM_STATE).declinedAt).toBeTruthy();

    // 別セッションを模してモジュールを再読み込みしても、1ヶ月以内は確認されない
    const { quickAdd: quickAdd2, userStore: userStore2 } = await freshSetup();
    const confirmSpy2 = vi.spyOn(userStore2, 'confirm');
    await expect(quickAdd2.ensureQuickAddEngineWithConsent()).rejects.toThrow('declined');
    expect(confirmSpy2).not.toHaveBeenCalled();
  });

  it('確認で「はい」を選ぶとモデルを読み込み、インストール日を記録する', async () => {
    const { quickAdd, userStore } = await freshSetup();
    vi.spyOn(userStore, 'confirm').mockResolvedValue(true);

    await quickAdd.ensureQuickAddEngineWithConsent();
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    const state = mocks.storage.get(CACHE_KEYS.LLM_STATE);
    expect(state.installedAt).toBeTruthy();
    expect(quickAdd.llmModelInstalled.value).toBe(true);
  });
});

describe('checkLlmModelInstalled / install / uninstall', () => {
  it('キャッシュにモデルがあればインストール済みと判定する', async () => {
    mocks.hasModelInCache.mockImplementation(async () => true);
    const { quickAdd } = await freshSetup();

    expect(await quickAdd.checkLlmModelInstalled()).toBe(true);
    expect(quickAdd.llmModelInstalled.value).toBe(true);
  });

  it('モデルが残っていて日付記録がなければ検出日をインストール日とする', async () => {
    mocks.hasModelInCache.mockImplementation(async () => true);
    const { quickAdd } = await freshSetup();

    await quickAdd.checkLlmModelInstalled();
    expect(mocks.storage.get(CACHE_KEYS.LLM_STATE).installedAt).toBeTruthy();
    expect(quickAdd.llmModelInstalledAt.value).toBeTruthy();
  });

  it('記録済みのインストール日は検出日で上書きしない', async () => {
    mocks.hasModelInCache.mockImplementation(async () => true);
    mocks.storage.set(CACHE_KEYS.LLM_STATE, { installedAt: '2025-01-15T00:00:00.000Z', declinedAt: '' });
    const { quickAdd } = await freshSetup();

    await quickAdd.checkLlmModelInstalled();
    expect(mocks.storage.get(CACHE_KEYS.LLM_STATE).installedAt).toBe('2025-01-15T00:00:00.000Z');
  });

  it('installLlmModel は確認なしで読み込み、進捗を報告する', async () => {
    const { quickAdd, userStore } = await freshSetup();
    const confirmSpy = vi.spyOn(userStore, 'confirm');

    await quickAdd.installLlmModel();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(quickAdd.quickAddEngineState.value.status).toBe('ready');
    expect(quickAdd.llmModelInstalled.value).toBe(true);
    expect(mocks.storage.get(CACHE_KEYS.LLM_STATE).installedAt).toBeTruthy();
  });

  it('モデル読み込みの進捗コールバックが state の progress に反映される', async () => {
    const { quickAdd } = await freshSetup();
    /** @type {number|undefined} 読み込み中に捕捉した進捗 */
    let midProgress;
    mocks.reload.mockImplementation(async () => {
      mocks.progressCallback?.({ progress: 0.42, text: '読み込み中', timeElapsed: 1 });
      midProgress = quickAdd.quickAddEngineState.value.progress;
      expect(quickAdd.quickAddEngineState.value.status).toBe('loading');
    });

    await quickAdd.installLlmModel();
    expect(midProgress).toBe(0.42);
    expect(quickAdd.quickAddEngineState.value.progress).toBe(1);
  });

  it('uninstallLlmModel はエンジン解放・キャッシュ削除・記録消去を行う', async () => {
    mocks.storage.set(CACHE_KEYS.LLM_STATE, { installedAt: '2025-01-15T00:00:00.000Z', declinedAt: '' });
    mocks.hasModelInCache.mockImplementation(async () => true);
    const { quickAdd } = await freshSetup();
    await quickAdd.checkLlmModelInstalled();
    await quickAdd.installLlmModel();

    await quickAdd.uninstallLlmModel();
    expect(mocks.unload).toHaveBeenCalledTimes(1);
    expect(mocks.deleteModelAllInfoInCache).toHaveBeenCalledTimes(1);
    expect(quickAdd.llmModelInstalled.value).toBe(false);
    expect(quickAdd.llmModelInstalledAt.value).toBe('');
    expect(mocks.storage.get(CACHE_KEYS.LLM_STATE)).toEqual({ installedAt: '', declinedAt: '' });
    expect(quickAdd.quickAddEngineState.value.status).toBe('idle');
  });
});
