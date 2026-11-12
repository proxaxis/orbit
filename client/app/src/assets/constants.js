/**
 * アプリケーション共通の定数モジュール。
 * Vue / Pinia に依存しないため、ページ側・Service Worker の双方から参照できる。
 * Google 各 API のベース URL をここで一元管理する。
 */

/** @type {string} Google Calendar API のベース URL */
export const GOOGLE_API_BASE_URL_CALENDAR = 'https://www.googleapis.com/calendar/v3';

/** @type {string} Google People API のベース URL */
export const GOOGLE_API_BASE_URL_PEOPLE = 'https://people.googleapis.com/v1';

/** @type {string} Google Photos Library API のベース URL */
export const GOOGLE_API_BASE_URL_PHOTOSLIBRARY = 'https://photoslibrary.googleapis.com/v1';

/** @type {string} Google Photos Picker API のベース URL */
export const GOOGLE_API_BASE_URL_PHOTOSPICKER = 'https://photospicker.googleapis.com/v1';

/** @type {string} Google Drive API のベース URL */
export const GOOGLE_API_BASE_URL_DRIVE = 'https://www.googleapis.com';
