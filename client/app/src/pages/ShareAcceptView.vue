<script setup>
/**
 * 共有カレンダーの受け入れ画面。
 * 共有リンク（/share/accept?cid=<カレンダーID>）を開いた受信者に
 * 登録確認を表示し、承認時に登録する。
 * mode=list（通常共有）はカレンダーリストへ、それ以外（期間指定共有）は
 * セッションカレンダーへ登録する。
 * カレンダー自体の閲覧権限（ACL）は共有者側で付与済みのため、ここでは
 * 受信者側の一覧への登録のみを行う。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendars } from '@/composables/useCalendars.js';
import { rememberPendingShareAccept, clearPendingShareAccept } from '@/services/share-accept.js';
import MenuBar from '@/components/MenuBar.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconCloudArrowDown from '@/components/icons/IconCloudArrowDown.vue';
import IconRotateLeft from '@/components/icons/IconRotateLeft.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const calendars = useCalendars();

/** @type {ComputedRef<string|null>} 共有されたカレンダーの ID */
const calendarId = computed(() => (typeof route.query.cid === 'string' && route.query.cid ? route.query.cid : null));
/** @type {ComputedRef<'session'|'list'>} 登録先（期間指定共有はセッション、通常共有はカレンダーリスト） */
const registerMode = computed(() => (route.query.mode === 'list' ? 'list' : 'session'));

/** @type {Ref<GoogleCalendarResource|null>} 取得したカレンダー情報 */
const calendar = ref(null);
/** @type {Ref<'idle'|'loading'|'ready'|'error'>} 取得状態 */
const fetchState = ref('idle');
/** @type {Ref<string>} 取得失敗時のエラーメッセージ */
const fetchError = ref('');
/** @type {Ref<boolean>} カレンダーリストへの登録処理中か */
const registering = ref(false);
/** @type {Ref<string>} 登録失敗時のエラーメッセージ */
const registerError = ref('');

/** @type {ComputedRef<boolean>} セッションまたは通常一覧に既に登録済みか */
const alreadyRegistered = computed(() => calendarStore.list.some((item) => item.id === calendarId.value));

/**
 * iOS のブラウザ(Safari やアプリ内ブラウザ)で開かれているか。
 * ホーム画面に追加された Web App は standalone モードになるため除外する。
 * iOS ではブラウザ→インストール済み Web App へのリンクキャプチャはできないが、
 * Safari でスコープ内の URL を開くと OS が「アプリで開く」バナーを出すため案内する。
 */
const isIOSBrowser = (() => {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
  return isIOS && !standalone;
})();

// 対象カレンダーの情報を取得する（受信者は共有者の ACL で閲覧権限を持つ）
watch(
  [calendarId, () => authStore.isAuthenticated, () => userStore.isOffline],
  async () => {
    calendar.value = null;
    fetchError.value = '';
    if (!calendarId.value || !authStore.isAuthenticated || userStore.isOffline) {
      // 未ログインのまま離れた場合に備え、ログイン後にこの画面へ戻れるよう退避する
      if (calendarId.value && !authStore.isAuthenticated) rememberPendingShareAccept(calendarId.value, registerMode.value);
      fetchState.value = 'idle';
      return;
    }
    clearPendingShareAccept();
    fetchState.value = 'loading';
    try {
      calendar.value = await calendars.fetchCalendarResource(calendarId.value);
      fetchState.value = 'ready';
    } catch (error) {
      fetchState.value = 'error';
      fetchError.value = /** @type {any} */ (error)?.status === 404 || /** @type {any} */ (error)?.status === 403 ? 'このカレンダーは共有されていないか、すでに削除されています。共有相手のアカウントでログインしているか確認してください。' : 'カレンダー情報を取得できませんでした。';
    }
  },
  { immediate: true },
);

/** 確認済みとして登録する（mode=list はカレンダーリストへ、それ以外はセッションカレンダーへ） */
async function accept() {
  if (!calendar.value || !calendarId.value) return;
  if (registerMode.value === 'list') {
    registering.value = true;
    registerError.value = '';
    try {
      await calendars.addCalendarListEntry({ id: calendarId.value, colorRgbFormat: true, selected: true });
      userStore.showToast(`「${calendar.value.summary ?? calendar.value.id}」をカレンダーリストに登録しました`);
      clearPendingShareAccept();
      router.replace({ name: 'Home' });
    } catch (error) {
      registerError.value = /** @type {any} */ (error)?.status === 403 || /** @type {any} */ (error)?.status === 404 ? 'カレンダーリストへの登録に失敗しました。共有先の権限が取り消された可能性があります。' : 'カレンダーリストへの登録に失敗しました。';
    } finally {
      registering.value = false;
    }
    return;
  }
  calendarStore.addSessionCalendar(calendar.value);
  userStore.showToast(`「${calendar.value.summary ?? calendar.value.id}」をセッションカレンダーに登録しました`);
  clearPendingShareAccept();
  router.replace({ name: 'Home' });
}

/** 登録せずにホームへ戻る */
function decline() {
  clearPendingShareAccept();
  router.replace({ name: 'Home' });
}
</script>

<template>
  <div class="share-accept-view">
    <MenuBar>
      <template #main>
        <h1 class="title">共有カレンダーの登録</h1>
      </template>
      <template #sub>
        <button class="icon-x-mark-btn" title="閉じる" @click="decline">
          <IconXMark />
        </button>
      </template>
      {{ registerMode === 'list' ? '共有されたカレンダーをカレンダーリストへ登録します' : '共有されたカレンダーを自分のリストへ登録します' }}
    </MenuBar>

    <section v-if="isIOSBrowser" class="ios-hint">
      <p>iPhone/iPad で Orbit アプリをホーム画面に追加している場合は、このページ上部に表示される「アプリで開く」バナーからアプリで開けます。LINE などのアプリ内ブラウザでは表示されないため、その場合はメニューから「Safari で開く」を選んでください。</p>
      <p>このままブラウザでログインして登録することもできます。</p>
    </section>

    <AskLoginMessage v-if="!authStore.isAuthenticated">共有カレンダーを登録するには Google アカウントでログインする必要があります</AskLoginMessage>

    <section v-else>
      <p v-if="!calendarId" class="message">共有リンクが正しくありません。カレンダー ID が指定されていません。</p>
      <p v-else-if="userStore.isOffline" class="message">オフラインのため確認できません。オンラインに接続してから再度リンクを開いてください。</p>
      <p v-else-if="fetchState === 'loading'" class="message">カレンダー情報を確認しています...</p>
      <p v-else-if="fetchState === 'error'" class="message error">{{ fetchError }}</p>

      <template v-else-if="calendar">
        <div class="calendar-card">
          <h2>{{ calendar.summary ?? calendarId }}</h2>
          <p v-if="calendar.description" class="description">{{ calendar.description }}</p>
          <p v-if="registerMode === 'list'" class="note">このカレンダーをカレンダーリストに登録しますか？登録すると Google カレンダーのあなたの一覧にも追加され、すべてのデバイスに表示されます。</p>
          <p v-else class="note">このカレンダーをセッションカレンダーに登録しますか？セッションカレンダーはあなたのアカウントのカレンダー一覧には追加されず、いつでも削除できます。</p>
          <p v-if="alreadyRegistered" class="note">このカレンダーはすでに一覧にあります。</p>
          <p v-if="registerError" class="note error">{{ registerError }}</p>
        </div>
        <div class="actions">
          <button data-app-button="secondary" type="button" @click="decline"><IconRotateLeft />登録しない</button>
          <button data-app-button="primary" type="button" :disabled="alreadyRegistered || registering || userStore.isLoading" @click="accept"><IconCloudArrowDown />{{ registerMode === 'list' ? 'カレンダーリストに登録' : 'セッションカレンダーに登録' }}</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.share-accept-view {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm);
}

.ios-hint {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background-color: var(--bg-1);
  border-bottom: 1px solid var(--border);

  p {
    font-size: var(--text-size-xs);
    color: var(--text-light);
  }
}

.message {
  font-size: var(--text-size-sm);
  color: var(--text-light);

  &.error {
    color: var(--danger);
  }
}

.calendar-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  h2 {
    font-size: var(--text-size-lg);
  }

  .description {
    font-size: var(--text-size-sm);
    color: var(--text);
  }

  .note {
    font-size: var(--text-size-xs);
    color: var(--text-light);

    &.error {
      color: var(--danger);
    }
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.icon-x-mark-btn {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
