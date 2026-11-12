/**
 * People 機能の UI 表示用型定義（stores/people.js / composables/usePeople.js で使用）。
 */
declare global {
  interface UiContact {
    resourceName: string;
    displayName: string;
    email?: string;
    phoneNumber?: string;
    photoUrl?: string;
    organization?: string;
    title?: string;
    isOtherContact: boolean;
    raw: GooglePeoplePerson;
  }
}
export {};
