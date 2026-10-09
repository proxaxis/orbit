<script setup>
/**
 * EventDetailView の写真アルバム欄。
 * イベントに紐づく Google フォトアルバムの表示・写真のアップロード・
 * Picker からの選択を担う機能コンポーネント。
 */
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';
import { usePhotos } from '@/composables/usePhotos.js';
import IconImage from '@/components/icons/IconImage.vue';
import IconDownload from '@/components/icons/IconDownload.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';
import IconCloudArrowUp from '@/components/icons/IconCloudArrowUp.vue';
import IconArrowUpRightFromSquare from '@/components/icons/IconArrowUpRightFromSquare.vue';

const props = defineProps({
  /** @type {import('vue').PropType<HandyCalendarEvent|null>} 対象イベント */
  event: { type: Object, default: null },
  /** イベントに本人以外の参加者がいるか */
  hasOtherAttendees: { type: Boolean, default: false },
});

const authStore = useAuthStore();
const userStore = useUserStore();
const photos = usePhotos();
const auth = useAuth();

/** @type {ComputedRef<OrbitEventPhotoAlbum|null>} イベントに紐づくアルバム */
const albumBinding = computed(() => photos.bindingOf(props.event));
/** @type {Ref<GooglePhotosAlbum|null>} 取得したアルバム情報 */
const album = ref(null);
/** @type {Ref<GooglePhotosMediaItem[]>} アルバム内の写真 */
const albumPhotos = ref([]);
/** @type {Ref<HTMLInputElement|null>} ローカルファイル入力 */
const rfFileInput = ref(null);

/** 写真共有機能のセクションを表示するか */
const photoSectionVisible = computed(() => authStore.isAuthenticated && (userStore.usePhotoSharing || !!albumBinding.value));
/** API 経由で写真を操作できるか */
const photoApiReady = computed(() => photos.canUsePhotoSharing());

// 写真トークンの復元が完了した場合にアルバムを読み込み直す
watch(photoApiReady, (ready) => {
  if (ready) loadAlbumPhotos();
});

/** アルバムの写真一覧を読み込む */
async function loadAlbumPhotos() {
  const binding = albumBinding.value;
  if (!binding || !photoApiReady.value) return;
  userStore.setLoading(true, '写真を読み込んでいます...');
  try {
    album.value = await photos.openAlbum(binding);
    albumPhotos.value = await photos.listAlbumPhotos(binding);
  } catch (error) {
    userStore.setError(true, error);
  } finally {
    userStore.setLoading(false);
  }
}

/**
 * ローカルファイルの選択をアルバムへアップロードする
 * @param {Event} inputEvent ファイル入力の変更イベント
 * @returns {Promise<void>}
 */
async function onSelectLocalFiles(inputEvent) {
  const input = /** @type {HTMLInputElement} */ (inputEvent.target);
  const files = Array.from(input.files ?? []).map((file) => ({ blob: file, fileName: file.name, mimeType: file.type || 'application/octet-stream' }));
  input.value = '';
  if (!files.length || !props.event) return;
  try {
    await photos.uploadFiles(props.event, files);
    await loadAlbumPhotos();
  } catch (error) {
    userStore.setError(true, error);
  }
}

/** Google フォトのライブラリから写真を選択してアルバムへコピーする */
async function pickFromGooglePhotos() {
  if (!props.event) return;
  // ポップアップブロックを避けるため、クリック処理内で先にウィンドウを開いておく
  const pickerWindow = window.open('', 'orbit-photos-picker', 'width=960,height=720');
  try {
    const result = await photos.uploadPickedPhotos(props.event, pickerWindow);
    if (result) await loadAlbumPhotos();
  } catch (error) {
    if (pickerWindow && !pickerWindow.closed) pickerWindow.close();
    userStore.setError(true, error);
  }
}

/** 親がイベントを読み込み直したときの公開リロード関数 */
function reload() {
  album.value = null;
  albumPhotos.value = [];
  if (userStore.usePhotoSharing) auth.ensurePhotoToken();
  loadAlbumPhotos();
}

defineExpose({ reload });
</script>

<template>
  <section v-if="photoSectionVisible" class="photos-section">
    <h3><IconImage size="1rem" /> 写真アルバム</h3>
    <template v-if="albumBinding">
      <p v-if="hasOtherAttendees" class="hint">参加者と共有するには、作成者が Google フォトでアルバムの共有設定を行う必要があります。</p>
      <p v-if="userStore.isLoading" class="hint">読み込んでいます...</p>
      <div v-if="albumPhotos.length" class="photo-grid">
        <a v-for="photo in albumPhotos" :key="photo.id" :href="`${photo.baseUrl}=d`" :title="`${photo.filename ?? '写真'} をダウンロード`" target="_blank" rel="noopener noreferrer" class="photo-cell">
          <img :src="`${photo.baseUrl}=w240-h240-c`" :alt="photo.filename ?? '写真'" loading="lazy" />
          <span class="download-badge"><IconDownload size="0.7rem" /></span>
        </a>
      </div>
      <p v-else-if="!userStore.isLoading && photoApiReady" class="hint">まだ写真がありません</p>
      <div class="photo-actions">
        <a v-if="albumBinding.productUrl || album?.productUrl" :href="albumBinding.productUrl || album?.productUrl" target="_blank" rel="noopener noreferrer" class="album-link"> <IconArrowUpRightFromSquare size="0.85rem" /> アルバムを開く </a>
        <button v-if="photoApiReady" type="button" :disabled="userStore.isLoading" @click="loadAlbumPhotos"><IconArrowsRotate size="0.85rem" /> 再読み込み</button>
      </div>
    </template>
    <template v-else-if="photoApiReady">
      <p class="hint">写真を選択してアップロードすると、このイベント専用のアルバムが Google フォトに作成されます. {{ hasOtherAttendees ? '参加者と共有するには、作成後に Google フォトで共有設定を行ってください.' : '' }}</p>
    </template>
    <template v-else-if="!userStore.usePhotoSharing">
      <p class="hint">写真共有は無効です. アルバムを利用するには、個人設定で有効化してください.</p>
    </template>
    <p v-else class="hint">Google アカウントの認証が必要です. 個人設定から認証してください.</p>

    <div v-if="photoApiReady" class="photo-actions">
      <input ref="rfFileInput" type="file" accept="image/*,video/*" multiple hidden @change="onSelectLocalFiles" />
      <button type="button" :disabled="userStore.isLoading" @click="rfFileInput?.click()"><IconCloudArrowUp size="0.85rem" /> ファイルをアップロード</button>
      <button type="button" :disabled="userStore.isLoading" @click="pickFromGooglePhotos"><IconImage size="0.85rem" /> Google フォトから選択</button>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.photos-section {
  margin: var(--space-sm) 0;
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  h3 {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--text-size-md);
  }

  .hint {
    color: var(--text-light);
    font-size: var(--text-size-sm);
  }

  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: var(--space-xs);
  }

  .photo-cell {
    position: relative;
    aspect-ratio: 1;
    border-radius: var(--border-radius);
    overflow: hidden;
    background: var(--bg-2);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .download-badge {
      position: absolute;
      right: var(--space-xxs);
      bottom: var(--space-xxs);
      display: flex;
      padding: var(--space-xxs);
      border-radius: 50%;
      background: color-mix(in srgb, var(--bg-0) 70%, transparent);
      color: var(--text);
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    &:hover .download-badge,
    &:focus-visible .download-badge {
      opacity: 1;
    }
  }

  .photo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);

    button,
    .album-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      padding: var(--space-xs) var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      font-size: var(--text-size-xs);

      &:hover {
        background-color: var(--bg-2);
      }
    }
  }
}
</style>
