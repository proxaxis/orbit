import { vi } from 'vitest';

// アプリのロケールに合わせてタイムゾーンを固定する
process.env.TZ = 'Asia/Tokyo';

// jsdom には実装されていないブラウザ API のスタブ
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
