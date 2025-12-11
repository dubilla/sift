import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

type Provider = "google" | "asana";

interface ProviderConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

function getProviderConfig(provider: Provider): ProviderConfig {
  switch (provider) {
    case "google":
      return {
        tokenUrl: "https://oauth2.googleapis.com/token",
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      };
    case "asana":
      return {
        tokenUrl: "https://app.asana.com/-/oauth_token",
        clientId: process.env.ASANA_CLIENT_ID!,
        clientSecret: process.env.ASANA_CLIENT_SECRET!,
      };
  }
}

export async function getValidAccessToken(userId: string): Promise<string> {
  return getValidAccessTokenForProvider(userId, "google");
}

export async function getValidAccessTokenForProvider(
  userId: string,
  provider: Provider
): Promise<string> {
  // Get the user's account record for the specific provider
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)))
    .limit(1);

  if (!userAccounts.length) {
    throw new Error(`No ${provider} account found for user`);
  }

  const account = userAccounts[0];

  if (!account.access_token) {
    throw new Error(`No ${provider} access token found`);
  }

  // Check if token is expired (or will expire in next 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at || 0;
  const needsRefresh = expiresAt < now + 300; // Refresh if expiring in 5 min

  console.log(`[${provider}] Token check for user ${userId}: now=${now}, expiresAt=${expiresAt}, needsRefresh=${needsRefresh}`);

  if (!needsRefresh) {
    console.log(`[${provider}] Token still valid, returning existing token`);
    return account.access_token;
  }

  // Token is expired or expiring soon, refresh it
  if (!account.refresh_token) {
    throw new Error(`No ${provider} refresh token available`);
  }

  console.log(`[${provider}] Attempting to refresh token for user ${userId}...`);

  const config = getProviderConfig(provider);

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[${provider}] Token refresh failed with status ${response.status}: ${error}`);
      throw new Error(`Failed to refresh ${provider} token: ${error}`);
    }

    const tokens: TokenRefreshResponse = await response.json();
    console.log(`[${provider}] Token refreshed successfully`);

    // Update the account with new tokens
    const newExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    await db
      .update(accounts)
      .set({
        access_token: tokens.access_token,
        expires_at: newExpiresAt,
      })
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));

    return tokens.access_token;
  } catch (error) {
    console.error(`[${provider}] Error refreshing access token:`, error);
    console.error(`[${provider}] Falling back to existing token (may be expired)`);
    // If refresh fails, return the existing token anyway
    // The API will return a proper error if it's truly invalid
    return account.access_token;
  }
}

export async function hasProviderAccount(
  userId: string,
  provider: Provider
): Promise<boolean> {
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)))
    .limit(1);

  return userAccounts.length > 0;
}
