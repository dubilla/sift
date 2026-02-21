import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
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
    params: {
      scope: "data:read_write",
    },
  },
  token: "https://todoist.com/oauth/access_token",
  userinfo: "https://api.todoist.com/sync/v9/sync",
  clientId: process.env.TODOIST_CLIENT_ID,
  clientSecret: process.env.TODOIST_CLIENT_SECRET,
  profile(profile: { user?: { full_name?: string; email?: string; id?: number }; full_name?: string; email?: string; id?: number }) {
    // Todoist sync API wraps user data; handle both shapes
    const user = profile.user || profile;
    return {
      id: String(user.id),
      name: user.full_name,
      email: user.email,
      image: null,
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
});
