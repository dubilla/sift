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
    }),
    Asana,
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
