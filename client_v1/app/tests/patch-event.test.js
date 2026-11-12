import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postBffRequest: vi.fn(),
}));

vi.mock('@/services/bff-request.js', () => ({
  postBffRequest: mocks.postBffRequest,
  postBffRequestBatch: vi.fn(async () => []),
}));

const { patchEvent } = await import('@/services/google-calendar-api.js');

/** @param {number} status HTTP ステータス @param {any} data レスポンスボディ */
const jsonResponse = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('patchEvent の拡張プロパティ null 削除リトライ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('400 かつ null 削除指定がある場合、null を取り除いて1回だけ再試行する', async () => {
    mocks.postBffRequest.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'Required' } })).mockResolvedValueOnce(jsonResponse(200, { id: 'evt-1' }));
    const result = await patchEvent('token', 'cal-1', 'evt-1', {
      summary: 'x',
      extendedProperties: { shared: { icon: null, orbitTags: '[]' }, private: { note: 'n' } },
    });
    expect(result.id).toBe('evt-1');
    expect(mocks.postBffRequest).toHaveBeenCalledTimes(2);
    const retryRequest = mocks.postBffRequest.mock.calls[1][0];
    expect(retryRequest.body.extendedProperties).toEqual({ shared: { orbitTags: '[]' }, private: { note: 'n' } });
    expect(retryRequest.body.summary).toBe('x');
  });

  it('null のみのセクションは extendedProperties 自体を取り除く', async () => {
    mocks.postBffRequest.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'Required' } })).mockResolvedValueOnce(jsonResponse(200, { id: 'evt-1' }));
    await patchEvent('token', 'cal-1', 'evt-1', { summary: 'x', extendedProperties: { shared: { icon: null } } });
    const retryRequest = mocks.postBffRequest.mock.calls[1][0];
    expect('extendedProperties' in retryRequest.body).toBe(false);
  });

  it('null 削除指定がない 400 は再試行せずエラーを投げる', async () => {
    mocks.postBffRequest.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'bad request' } }));
    await expect(patchEvent('token', 'cal-1', 'evt-1', { summary: 'x' })).rejects.toMatchObject({ status: 400 });
    expect(mocks.postBffRequest).toHaveBeenCalledTimes(1);
  });

  it('再試行も失敗した場合はそのエラーを投げる', async () => {
    mocks.postBffRequest.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'Required' } })).mockResolvedValueOnce(jsonResponse(403, { error: { message: 'forbidden' } }));
    await expect(patchEvent('token', 'cal-1', 'evt-1', { extendedProperties: { shared: { icon: null } } })).rejects.toMatchObject({ status: 403 });
    expect(mocks.postBffRequest).toHaveBeenCalledTimes(2);
  });

  it('成功レスポンスは再試行せずそのまま返す', async () => {
    mocks.postBffRequest.mockResolvedValueOnce(jsonResponse(200, { id: 'evt-1' }));
    const result = await patchEvent('token', 'cal-1', 'evt-1', { summary: 'x' });
    expect(result.id).toBe('evt-1');
    expect(mocks.postBffRequest).toHaveBeenCalledTimes(1);
  });
});
