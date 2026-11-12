import { describe, expect, it } from 'vitest';
import { parseGoogleMapsLink } from '@/services/google-maps.js';

describe('parseGoogleMapsLink', () => {
  it('/maps/place/ の URL から場所名を取り出す', () => {
    const result = parseGoogleMapsLink('https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E9%A7%85/@35.6812362,139.7649361,17z');
    expect(result?.name).toBe('東京駅');
    expect(result?.address).toBe('35.6812362, 139.7649361');
  });

  it('google.co.jp の /maps/place/ も解析できる', () => {
    const result = parseGoogleMapsLink('https://www.google.co.jp/maps/place/Tokyo+Tower/data=!3d35.6585805!4d139.7454329');
    expect(result?.name).toBe('Tokyo Tower');
    expect(result?.address).toBe('35.6585805, 139.7454329');
  });

  it('query パラメータのカンマ区切りを名前と住所に分ける', () => {
    const result = parseGoogleMapsLink('https://www.google.com/maps/search/?api=1&query=Tokyo+Station%2C+Chiyoda+City%2C+Tokyo');
    expect(result?.name).toBe('Tokyo Station');
    expect(result?.address).toBe('Chiyoda City, Tokyo');
  });

  it('q パラメータの単一値は名前として扱う', () => {
    const result = parseGoogleMapsLink('https://maps.google.com/?q=Osaka+Castle');
    expect(result?.name).toBe('Osaka Castle');
    expect(result?.address).toBe('');
  });

  it('短縮 URL は名前なしのカード情報を返す', () => {
    const result = parseGoogleMapsLink('https://maps.app.goo.gl/AbCdEfGh');
    expect(result?.name).toBe('Google Maps');
    expect(result?.address).toBe('');
  });

  it('Google Maps 以外の URL は null を返す', () => {
    expect(parseGoogleMapsLink('https://example.com/maps/place/foo')).toBeNull();
    expect(parseGoogleMapsLink('https://zoom.us/j/12345')).toBeNull();
  });

  it('URL でない文字列や空値は null を返す', () => {
    expect(parseGoogleMapsLink('会議室A')).toBeNull();
    expect(parseGoogleMapsLink('')).toBeNull();
    expect(parseGoogleMapsLink(null)).toBeNull();
  });

  it('テキスト中に含まれる Google Maps URL を拾う', () => {
    const result = parseGoogleMapsLink('会場はこちら https://www.google.com/maps/place/Shibuya/@35.6580,139.7016,15z です');
    expect(result?.name).toBe('Shibuya');
  });
});
