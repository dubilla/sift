import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function getValidAccessToken(userId: string): Promise<string> {
  // Get the user's account record
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (!userAccounts.length) {
    throw new Error("No account found for user");
  }

  const account = userAccounts[0];

  if (!account.access_token) {
    throw new Error("No access token found");
  }

  // Check if token is expired (or will expire in next 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at || 0;
  const needsRefresh = expiresAt < now + 300; // Refresh if expiring in 5 min

  console.log(`Token check for user ${userId}: now=${now}, expiresAt=${expiresAt}, needsRefresh=${needsRefresh}`);

  if (!needsRefresh) {
    console.log("Token still valid, returning existing token");
    return account.access_token;
  }

  // Token is expired or expiring soon, refresh it
  if (!account.refresh_token) {
    throw new Error("No refresh token available");
  }

  console.log(`Attempting to refresh token for user ${userId}...`);

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Token refresh failed with status ${response.status}: ${error}`);
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const tokens: TokenRefreshResponse = await response.json();
    console.log("Token refreshed successfully");

    // Update the account with new tokens
    const newExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    await db
      .update(accounts)
      .set({
        access_token: tokens.access_token,
        expires_at: newExpiresAt,
      })
      .where(eq(accounts.userId, userId));

    return tokens.access_token;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    console.error("Falling back to existing token (may be expired)");
    // If refresh fails, return the existing token anyway
    // The Gmail API will return a proper error if it's truly invalid
    return account.access_token;
  }
}
