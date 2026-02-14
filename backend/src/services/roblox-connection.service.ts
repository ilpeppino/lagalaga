import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import { RobloxOAuthService, RobloxTokenResponse, RobloxUserInfo } from './robloxOAuth.js';

interface ConnectionDeps {
  supabase?: SupabaseClient;
  oauthService?: RobloxOAuthService;
}

interface RobloxConnectionRow {
  user_id: string;
  platform_id: string;
  platform_user_id: string;
  platform_username: string | null;
  platform_display_name: string | null;
  roblox_access_token_enc: string | null;
  roblox_refresh_token_enc: string | null;
  roblox_token_expires_at: string | null;
  roblox_scope: string | null;
  verified_at: string | null;
}

function buildCipherKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptValue(plaintext: string, secret: string): string {
  const key = buildCipherKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

function decryptValue(payload: string, secret: string): string {
  const [ivEncoded, ciphertextEncoded, tagEncoded] = payload.split('.');
  if (!ivEncoded || !ciphertextEncoded || !tagEncoded) {
    throw new Error('Malformed encrypted token payload');
  }

  const key = buildCipherKey(secret);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivEncoded, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

export class RobloxConnectionService {
  private readonly supabase: SupabaseClient;
  private readonly oauthService: RobloxOAuthService;

  constructor(private readonly fastify: FastifyInstance, deps: ConnectionDeps = {}) {
    this.supabase = deps.supabase ?? getSupabase();
    this.oauthService = deps.oauthService ?? new RobloxOAuthService(fastify);
  }

  async saveConnection(params: {
    userId: string;
    userInfo: RobloxUserInfo;
    tokenResponse: RobloxTokenResponse;
  }): Promise<void> {
    const { userId, userInfo, tokenResponse } = params;
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();

    const { error } = await this.supabase
      .from('user_platforms')
      .upsert(
        {
          user_id: userId,
          platform_id: 'roblox',
          platform_user_id: userInfo.sub,
          platform_username: userInfo.preferred_username || userInfo.name || null,
          platform_display_name: userInfo.nickname || null,
          roblox_access_token_enc: encryptValue(tokenResponse.access_token, this.fastify.config.JWT_SECRET),
          roblox_refresh_token_enc: tokenResponse.refresh_token
            ? encryptValue(tokenResponse.refresh_token, this.fastify.config.JWT_SECRET)
            : null,
          roblox_token_expires_at: expiresAt,
          roblox_scope: tokenResponse.scope || null,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform_id' }
      );

    if (error) {
      throw new AppError('ROBLOX_CONNECTION_SAVE_FAILED', `Failed to persist Roblox connection: ${error.message}`);
    }
  }

  async getConnection(userId: string): Promise<RobloxConnectionRow | null> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select(
        'user_id, platform_id, platform_user_id, platform_username, platform_display_name, roblox_access_token_enc, roblox_refresh_token_enc, roblox_token_expires_at, roblox_scope, verified_at'
      )
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<RobloxConnectionRow>();

    if (error) {
      throw new AppError('ROBLOX_CONNECTION_READ_FAILED', `Failed to read Roblox connection: ${error.message}`);
    }

    return data ?? null;
  }

  async getRobloxUserId(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    if (connection?.platform_user_id?.trim()) {
      return connection.platform_user_id.trim();
    }

    const { data, error } = await this.supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userId)
      .maybeSingle<{ roblox_user_id: string | null }>();

    if (error) {
      throw new AppError('ROBLOX_CONNECTION_READ_FAILED', `Failed to load Roblox user id: ${error.message}`);
    }

    const robloxUserId = data?.roblox_user_id?.trim();
    return robloxUserId || null;
  }

  async getAccessToken(userId: string): Promise<{ token: string } | { unavailable: true; reason: string }> {
    const connection = await this.getConnection(userId);

    if (!connection || !connection.roblox_access_token_enc) {
      return { unavailable: true, reason: 'ROBLOX_NOT_CONNECTED' };
    }

    const expiresAtMs = connection.roblox_token_expires_at
      ? new Date(connection.roblox_token_expires_at).getTime()
      : 0;
    const isExpired = !expiresAtMs || expiresAtMs <= Date.now() + 15_000;

    if (!isExpired) {
      try {
        return { token: decryptValue(connection.roblox_access_token_enc, this.fastify.config.JWT_SECRET) };
      } catch {
        return { unavailable: true, reason: 'ROBLOX_TOKEN_INVALID' };
      }
    }

    if (!connection.roblox_refresh_token_enc) {
      return { unavailable: true, reason: 'ROBLOX_NOT_CONNECTED' };
    }

    const refreshToken = decryptValue(connection.roblox_refresh_token_enc, this.fastify.config.JWT_SECRET);
    const refreshed = await this.oauthService.refreshAccessToken(refreshToken);

    const newAccessTokenEnc = encryptValue(refreshed.access_token, this.fastify.config.JWT_SECRET);
    const newRefreshTokenEnc = refreshed.refresh_token
      ? encryptValue(refreshed.refresh_token, this.fastify.config.JWT_SECRET)
      : connection.roblox_refresh_token_enc;

    const { error } = await this.supabase
      .from('user_platforms')
      .update({
        roblox_access_token_enc: newAccessTokenEnc,
        roblox_refresh_token_enc: newRefreshTokenEnc,
        roblox_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        roblox_scope: refreshed.scope || connection.roblox_scope,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform_id', 'roblox');

    if (error) {
      throw new AppError('ROBLOX_CONNECTION_SAVE_FAILED', `Failed to update refreshed Roblox token: ${error.message}`);
    }

    return { token: refreshed.access_token };
  }
}
