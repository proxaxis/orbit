import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AccordionMenu from '@/components/AccordionMenu.vue';

function mountMenu(props = {}, slots = {}) {
  return mount(AccordionMenu, {
    props,
    slots: { summary: '<span>詳細設定</span>', default: '<p>内容</p>', ...slots },
  });
}

describe('AccordionMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初期状態では閉じている', () => {
    const wrapper = mountMenu();
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
    expect(wrapper.find('summary').text()).toContain('詳細設定');
    expect(wrapper.find('summary').attributes('aria-expanded')).toBe('false');
  });

  it('open props で初期表示を開ける', () => {
    const wrapper = mountMenu({ open: true });
    expect(wrapper.find('details').attributes('open')).toBeDefined();
  });

  it('summary クリックで開き、update:open を発行する', async () => {
    const wrapper = mountMenu();
    await wrapper.find('summary').trigger('click');
    await nextTick();
    expect(wrapper.find('details').attributes('open')).toBeDefined();
    expect(wrapper.find('summary').attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('update:open')).toEqual([[true]]);
    expect(wrapper.find('.caret').attributes('data-open')).toBe('true');
  });

  it('開いた後クリックするとアニメーション完了後に閉じる', async () => {
    const wrapper = mountMenu();
    await wrapper.find('summary').trigger('click');
    await nextTick();
    vi.advanceTimersByTime(400); // open アニメーション完了（jsdom ではタイマーフォールバック）

    await wrapper.find('summary').trigger('click');
    // 閉じるアニメーション中は open が残る
    expect(wrapper.find('details').attributes('open')).toBeDefined();
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
    expect(wrapper.emitted('update:open')).toEqual([[true], [false]]);
  });

  it('v-model:open 相当の props 変更で開閉する', async () => {
    const wrapper = mountMenu({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();
    expect(wrapper.find('details').attributes('open')).toBeDefined();

    await wrapper.setProps({ open: false });
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
  });

  it('label props は summary スロットのフォールバックになる', () => {
    const wrapper = mount(AccordionMenu, { props: { label: 'その他' }, slots: { default: '<p>内容</p>' } });
    expect(wrapper.find('summary').text()).toContain('その他');
  });
});
