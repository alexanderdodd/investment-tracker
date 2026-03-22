import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";

const adapter = () => DrizzleAdapter(getDb());

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: adapter(),
  providers: [GitHub],
}));
