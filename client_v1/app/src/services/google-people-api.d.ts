/**
 * Google People API (Contacts / Other Contacts) の型定義。
 * @see https://developers.google.com/people/api/rest/v1/people
 * @see https://developers.google.com/people/api/rest/v1/otherContacts
 */
declare global {
  /** Google People API 認証スコープ */
  type GooglePeopleScope = 'https://www.googleapis.com/auth/contacts' | 'https://www.googleapis.com/auth/contacts.readonly' | 'https://www.googleapis.com/auth/contacts.other.readonly';

  /** 読み取りメタデータ情報 */
  interface GooglePeopleFieldSource {
    type: 'ACCOUNT_TYPE_UNSPECIFIED' | 'PROFILE' | 'DOMAIN_PROFILE' | 'CONTACT' | 'OTHER_CONTACT' | 'DOMAIN_CONTACT';
    id?: string;
    etag?: string;
    updateTime?: GoogleApiDateTimeString;
  }

  interface GooglePeopleFieldMetadata {
    primary?: boolean;
    source?: GooglePeopleFieldSource;
    sourcePrimary?: boolean;
    verified?: boolean;
  }

  interface GooglePeoplePersonMetadata {
    sources?: GooglePeopleFieldSource[];
    objectType?: 'OBJECT_TYPE_UNSPECIFIED' | 'PERSON' | 'PAGE';
    deleted?: boolean;
    linkedPeopleResourceNames?: string[];
  }

  /** 名前情報 */
  interface GooglePeopleName {
    metadata?: GooglePeopleFieldMetadata;
    displayName?: string;
    displayNameLastFirst?: string;
    familyName?: string;
    givenName?: string;
    middleName?: string;
    honorificPrefix?: string;
    honorificSuffix?: string;
    phoneticFullName?: string;
    phoneticFamilyName?: string;
    phoneticGivenName?: string;
    phoneticMiddleName?: string;
    phoneticHonorificPrefix?: string;
    phoneticHonorificSuffix?: string;
  }

  /** メールアドレス情報 */
  interface GooglePeopleEmailAddress {
    metadata?: GooglePeopleFieldMetadata;
    value: string;
    type?: 'home' | 'work' | 'other' | string;
    formattedType?: string;
    displayName?: string;
  }

  /** 電話番号情報 */
  interface GooglePeoplePhoneNumber {
    metadata?: GooglePeopleFieldMetadata;
    value: string;
    type?: 'home' | 'work' | 'mobile' | 'homeFax' | 'workFax' | 'otherFax' | 'pager' | 'workMobile' | 'workPager' | 'main' | 'other' | string;
    formattedType?: string;
    canonicalForm?: string;
  }

  /** 写真・アバター画像 */
  interface GooglePeoplePhoto {
    metadata?: GooglePeopleFieldMetadata;
    url: string;
    default?: boolean;
  }

  /** 誕生日情報 */
  interface GooglePeopleBirthday {
    metadata?: GooglePeopleFieldMetadata;
    date?: {
      year?: number;
      month?: number;
      day?: number;
    };
    text?: string;
  }

  /** 組織・所属・肩書き */
  interface GooglePeopleOrganization {
    metadata?: GooglePeopleFieldMetadata;
    name?: string;
    department?: string;
    title?: string;
    jobDescription?: string;
    symbol?: string;
    domain?: string;
    type?: 'work' | 'school' | 'other' | string;
    formattedType?: string;
  }

  /** 住所情報 */
  interface GooglePeopleAddress {
    metadata?: GooglePeopleFieldMetadata;
    formattedValue?: string;
    type?: 'home' | 'work' | 'other' | string;
    formattedType?: string;
    poBox?: string;
    streetAddress?: string;
    extendedAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
  }

  /** ユーザー定義フィールド */
  interface GooglePeopleUserDefined {
    metadata?: GooglePeopleFieldMetadata;
    key: string;
    value: string;
  }

  /**
   * Google People API - Person リソース
   * (`people/c...` 形式の連絡先 または `otherContacts/...` 形式のその他の連絡先)
   */
  interface GooglePeoplePerson {
    /** リソース名（例: 'people/c1234567890' または 'otherContacts/c1234567890'） */
    resourceName: string;
    etag: string;
    metadata?: GooglePeoplePersonMetadata;
    names?: GooglePeopleName[];
    emailAddresses?: GooglePeopleEmailAddress[];
    phoneNumbers?: GooglePeoplePhoneNumber[];
    photos?: GooglePeoplePhoto[];
    birthdays?: GooglePeopleBirthday[];
    organizations?: GooglePeopleOrganization[];
    addresses?: GooglePeopleAddress[];
    userDefined?: GooglePeopleUserDefined[];
  }

  /** people.connections.list クエリパラメータ */
  interface GooglePeopleConnectionsListQueryParams {
    /** 取得対象のフィールド（カンマ区切り。例: 'names,emailAddresses,phoneNumbers,photos'） */
    personFields: string;
    pageToken?: string;
    pageSize?: number;
    orderBy?: 'LAST_MODIFIED_ASCENDING' | 'LAST_MODIFIED_DESCENDING' | 'FIRST_NAME_ASCENDING' | 'LAST_NAME_ASCENDING';
    syncToken?: string;
    requestSyncToken?: boolean;
    sources?: ('READ_SOURCE_TYPE_UNSPECIFIED' | 'READ_SOURCE_TYPE_PROFILE' | 'READ_SOURCE_TYPE_CONTACT' | 'READ_SOURCE_TYPE_DOMAIN_CONTACT')[];
  }

  /** people.connections.list レスポンス (`.../auth/contacts`) */
  interface GooglePeopleConnectionsListResponse {
    connections?: GooglePeoplePerson[];
    nextPageToken?: string;
    nextSyncToken?: string;
    totalPeople?: number;
    totalItems?: number;
  }

  /** otherContacts.list クエリパラメータ */
  interface GooglePeopleOtherContactsListQueryParams {
    /** 取得対象のフィールド（カンマ区切り。例: 'names,emailAddresses,phoneNumbers,photos'） */
    readMask: string;
    pageToken?: string;
    pageSize?: number;
    syncToken?: string;
    requestSyncToken?: boolean;
  }

  /** otherContacts.list レスポンス (`.../auth/contacts.other.readonly`) */
  interface GooglePeopleOtherContactsListResponse {
    otherContacts?: GooglePeoplePerson[];
    nextPageToken?: string;
    nextSyncToken?: string;
    totalSize?: number;
  }
}
export {};
