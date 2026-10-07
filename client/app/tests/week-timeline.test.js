import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import dayjs from '@/services/dayjs.js';
import CalendarWeekTimelineView from '@/views/CalendarWeekTimelineView.vue';
import { useUserStore } from '@/stores/user.js';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'Home', component: { template: '<div />' } }],
});

async function mountView() {
  router.push('/');
  await router.isReady();
  return mount(CalendarWeekTimelineView, { global: { plugins: [router] } });
}

function wheel(el, init) {
  el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }));
}

describe('CalendarWeekTimelineView（Ctrl+スクロールでの週移動）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('Ctrl+下スクロールで翌週へ移動する', async () => {
    const wrapper = await mountView();
    const userStore = useUserStore();
    const before = userStore.nowUsingDate.format('YYYY-MM-DD');

    wheel(wrapper.element, { ctrlKey: true, deltaY: 120 });
    expect(userStore.nowUsingDate.format('YYYY-MM-DD')).toBe(dayjs(before).add(7, 'day').format('YYYY-MM-DD'));
  });

  it('Ctrl+上スクロールで前週へ移動する', async () => {
    const wrapper = await mountView();
    const userStore = useUserStore();
    const before = userStore.nowUsingDate.format('YYYY-MM-DD');

    wheel(wrapper.element, { ctrlKey: true, deltaY: -120 });
    expect(userStore.nowUsingDate.format('YYYY-MM-DD')).toBe(dayjs(before).subtract(7, 'day').format('YYYY-MM-DD'));
  });

  it('Ctrl なしのスクロールでは週を移動しない', async () => {
    const wrapper = await mountView();
    const userStore = useUserStore();
    const before = userStore.nowUsingDate.format('YYYY-MM-DD');

    wheel(wrapper.element, { deltaY: 120 });
    expect(userStore.nowUsingDate.format('YYYY-MM-DD')).toBe(before);
  });

  it('連続した Ctrl+スクロールはスロットルされる', async () => {
    const wrapper = await mountView();
    const userStore = useUserStore();
    const before = userStore.nowUsingDate.format('YYYY-MM-DD');

    wheel(wrapper.element, { ctrlKey: true, deltaY: 120 });
    wheel(wrapper.element, { ctrlKey: true, deltaY: 120 });
    // 400ms 以内の2回目は無視される
    expect(userStore.nowUsingDate.format('YYYY-MM-DD')).toBe(dayjs(before).add(7, 'day').format('YYYY-MM-DD'));
  });
});
