/**
 * GET /login — Google の OAuth 認証画面へリダイレクトする。
 * ?prompt= を指定すると検証のうえ認可 URL へ転送する（アカウント切り替え用）
 */
import { MAIN_SCOPES } from '@/assets/constants.js';
import { getOAuth2Client } from '@/services/google.js';
import { parsePromptParam } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerLoginRoutes = (app) => {
  app.get('/login', (c) => {
    const { prompt, error } = parsePromptParam(c.req.query('prompt'));
    if (error) {
      return c.text(error, 400);
    }

    const client = getOAuth2Client();

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: prompt ?? 'consent',
      scope: MAIN_SCOPES,
    });

    return c.redirect(authUrl);
  });
};
