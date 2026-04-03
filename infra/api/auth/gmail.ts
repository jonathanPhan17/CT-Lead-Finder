import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { storeTokens } from '../../lib/tokens';
import { startGmailWatch } from '../../lib/gmail';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

interface TokenResponse {
  access_token?:  string;
  refresh_token?: string;
  expires_in?:    number;
  error?:         string;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { code } = JSON.parse(event.body ?? '{}') as { code?: string };
    if (!code) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'code required' }) };
    }

    // Exchange authorization code for access + refresh tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  'postmessage',
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenResp.json() as TokenResponse;
    if (tokens.error || !tokens.access_token) {
      console.error('token exchange failed', tokens.error);
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: tokens.error ?? 'token exchange failed' }) };
    }

    // Store tokens in DynamoDB
    await storeTokens({
      accessToken:   tokens.access_token,
      refreshToken:  tokens.refresh_token,
      expiresAt:     Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });

    // Start Gmail push watch so we get notified on replies
    const watch = await startGmailWatch(tokens.access_token);
    if (watch) {
      await storeTokens({
        accessToken:     tokens.access_token,
        watchHistoryId:  watch.historyId,
        watchExpiry:     watch.expiry,
      });
    }

    // Return access_token to the frontend so it can send emails immediately
    return {
      statusCode: 200,
      headers:    CORS,
      body:       JSON.stringify({ accessToken: tokens.access_token }),
    };
  } catch (err) {
    console.error('auth/gmail error', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'internal error' }) };
  }
};
