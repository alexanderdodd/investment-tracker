import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";

const adapter = () => DrizzleAdapter(getDb());

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: adapter(),
  // GitHub rolled out RFC 9207 and now returns an `iss` param on the OAuth
  // callback. @auth/core defaults OAuth2 providers to the placeholder issuer
  // `https://authjs.dev`, so oauth4webapi rejects the mismatch and the callback
  // fails with a generic `Configuration` error. Pin the real issuer to match.
  providers: [GitHub({ issuer: "https://github.com" })],
}));
