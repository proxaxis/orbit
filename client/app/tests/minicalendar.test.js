import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import dayjs from '@/services/dayjs.js';
import MiniCalendar from '@/components/MiniCalendar.vue';
import { useUserStore } from '@/stores/user.js';

describe('MiniCalendar（ミニカレンダーとメインカレンダーの連動解除）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ミニカレンダーの月送りはメインカレンダーの表示月を変更しない', async () => {
    const wrapper = mount(MiniCalendar);
    const userStore = useUserStore();

    const mainMonthBefore = userStore.nowUsingDate.format('YYYY-MM');
    const headerBefore = wrapper.find('h3').text();

    // 翌月ボタン（nav の3番目: [今月, 前月, 翌月]）
    const buttons = wrapper.findAll('nav button');
    expect(buttons).toHaveLength(3);
    await buttons[2].trigger('click');

    // ミニカレンダーの表示は翌月へ
    const nextMonth = dayjs().add(1, 'month');
    expect(wrapper.find('h3').text()).toBe(`${nextMonth.year()}年 ${nextMonth.month() + 1}月`);
    expect(wrapper.find('h3').text()).not.toBe(headerBefore);

    // メインカレンダーの表示月は不変
    expect(userStore.nowUsingDate.format('YYYY-MM')).toBe(mainMonthBefore);
  });

  it('前月ボタンもメインカレンダーを変更しない', async () => {
    const wrapper = mount(MiniCalendar);
    const userStore = useUserStore();
    const mainMonthBefore = userStore.nowUsingDate.format('YYYY-MM');

    const buttons = wrapper.findAll('nav button');
    await buttons[1].trigger('click');

    const prevMonth = dayjs().subtract(1, 'month');
    expect(wrapper.find('h3').text()).toBe(`${prevMonth.year()}年 ${prevMonth.month() + 1}月`);
    expect(userStore.nowUsingDate.format('YYYY-MM')).toBe(mainMonthBefore);
  });

  it('セルクリックは選択日を更新する', async () => {
    const wrapper = mount(MiniCalendar);
    const userStore = useUserStore();
    userStore.setNowSelectedDate(null);

    const cell = wrapper.find('tbody td[data-current-month="true"]');
    await cell.trigger('click');

    expect(userStore.nowSelectedDate).toBeTruthy();
    expect(userStore.isCellClicked).toBe(true);
  });
});
