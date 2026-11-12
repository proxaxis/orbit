/**
 * 写真共有機能の型定義（stores/photos.js / composables/usePhotos.js で使用）。
 */
declare global {
  /** イベントに紐づいたアルバムの情報（extendedProperties.shared に保存） */
  interface OrbitEventPhotoAlbum {
    /** アルバム ID（API で読めるのは作成者のみ） */
    albumId: string;
    /** Google フォトでアルバムを開く URL（作成者のみ有効。共有するには Google フォト側で共有設定が必要） */
    productUrl: string;
  }
}
export {};
