import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/db/schema";

// Custom Todoist OAuth provider
const Todoist = {
  id: "todoist",
  name: "Todoist",
  type: "oauth" as const,
  authorization: {
    url: "https://todoist.com/oauth/authorize",
    params: { scope: "data:read_write" },
  },
  token: "https://todoist.com/oauth/access_token",
  client: {
    token_endpoint_auth_method: "client_secret_post",
  },
  userinfo: {
    url: "https://api.todoist.com/api/v1/user",
    async request({ tokens }: { tokens: { access_token?: string } }) {
      const res = await fetch("https://api.todoist.com/api/v1/user", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      return res.json();
    },
  },
  clientId: process.env.TODOIST_CLIENT_ID,
  clientSecret: process.env.TODOIST_CLIENT_SECRET,
  profile(profile: { id?: number; user_id?: number; full_name: string; email?: string; user_email?: string; avatar_big?: string }) {
    return {
      id: String(profile.id ?? profile.user_id),
      name: profile.full_name,
      email: profile.email ?? profile.user_email ?? "",
      image: profile.avatar_big ?? null,
    };
  },
};

// Custom Asana OAuth provider
const Asana = {
  id: "asana",
  name: "Asana",
  type: "oauth" as const,
  authorization: {
    url: "https://app.asana.com/-/oauth_authorize",
    params: {
      scope: "default",
    },
  },
  token: "https://app.asana.com/-/oauth_token",
  userinfo: "https://app.asana.com/api/1.0/users/me",
  clientId: process.env.ASANA_CLIENT_ID,
  clientSecret: process.env.ASANA_CLIENT_SECRET,
  profile(profile: { data: { gid: string; name: string; email: string; photo?: { image_128x128?: string } } }) {
    return {
      id: profile.data.gid,
      name: profile.data.name,
      email: profile.data.email,
      image: profile.data.photo?.image_128x128,
    };
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic",
          access_type: "offline",
          prompt: "consent",
        },
      },
      allowDangerousEmailAccountLinking: true,
    }),
    Asana,
    Todoist,
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      // Add user ID to token on sign in
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Add user ID from token to session
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  events: {
    // The Drizzle adapter only writes OAuth tokens via linkAccount on the FIRST
    // sign-in for an account. On every subsequent sign-in it leaves the stored
    // tokens untouched — so a revoked/expired refresh token would never get
    // replaced, and "sign out and sign back in" wouldn't actually fix it.
    // Persist the fresh tokens on every sign-in to close that gap.
    async signIn({ account }) {
      if (!account) return;

      const updates: {
        access_token?: string | null;
        expires_at?: number | null;
        token_type?: string | null;
        scope?: string | null;
        id_token?: string | null;
        refresh_token?: string | null;
      } = {
        access_token: account.access_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
      };

      // Only overwrite the refresh token when the provider issued a new one —
      // Google omits it on some sign-ins, and we must not null out a good token.
      if (account.refresh_token) {
        updates.refresh_token = account.refresh_token;
      }

      await db
        .update(accounts)
        .set(updates)
        .where(
          and(
            eq(accounts.provider, account.provider),
            eq(accounts.providerAccountId, account.providerAccountId)
          )
        );
    },
  },
});
