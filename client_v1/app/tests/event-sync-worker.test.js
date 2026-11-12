import { describe, expect, it, vi } from 'vitest';
import { isProxy, reactive } from 'vue';

vi.mock('@/services/google-calendar-api.js', () => ({
  insertEvent: vi.fn(async () => ({ id: 'srv-1' })),
  patchEvent: vi.fn(async () => ({ id: 'srv-1' })),
  deleteEvent: vi.fn(async () => null),
}));

describe('runEventOperation の Worker 転送', () => {
  it('reactive(Proxy)を含む引数は JSON 正規化してから postMessage する', async () => {
    const posted = [];
    class FakeWorker {
      postMessage(message) {
        posted.push(message);
        this.onmessage?.({ data: { jobId: message.jobId, ok: true, result: { id: 'srv-1' } } });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    const { runEventOperation } = await import('@/services/event-sync-worker.js');

    // フォームの ref/reactive 経由で Proxy が渡されるケースを再現する
    const body = reactive({ attendees: reactive([{ email: 'a@example.com' }]), extendedProperties: { shared: { icon: '🎉' } } });
    await runEventOperation('update', 'token', 'cal-1', 'evt-1', body);

    expect(posted).toHaveLength(1);
    const sentBody = posted[0].args[3];
    // Proxy は structuredClone できず postMessage が失敗するため、送った値が
    // プレーンな JSON 相当であることを確認する
    expect(isProxy(sentBody)).toBe(false);
    expect(isProxy(sentBody.attendees)).toBe(false);
    expect(sentBody).toEqual({ attendees: [{ email: 'a@example.com' }], extendedProperties: { shared: { icon: '🎉' } } });
    vi.unstubAllGlobals();
  });
});
