import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

export const sectorEmergingLeaders = pgTable("sector_emerging_leader", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  rationale: text("rationale").notNull(),
  metricLabel: text("metric_label").notNull(),
  metricValue: text("metric_value").notNull(),
  rank: integer("rank").notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const sectorReports = pgTable("sector_report", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  summary: text("summary").notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const sectorAnalyses = pgTable("sector_analysis", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  performanceSummary: text("performance_summary").notNull(),
  sectorStructure: text("sector_structure").notNull(),
  fundamentalDrivers: text("fundamental_drivers").notNull(),
  opportunities: text("opportunities").notNull(),
  risks: text("risks").notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});
