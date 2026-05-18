/**
 * Greenroom database schema.
 *
 * The data model is deliberately simple but realistic enough to support
 * the settlement workflows. Mariana (the booker at The Crescent) is the
 * primary user. Other personas (tour managers, agents, the GM) appear
 * in the data but don't have UI here.
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// -------- Users (operator accounts at the venue) --------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", {
    enum: ["booker", "gm", "production", "box_office"],
  }).notNull(),
  venueId: text("venue_id").notNull(),
});

// -------- Venues --------

export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
});

// -------- Agencies & Agents --------

export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  agencyId: text("agency_id").references(() => agencies.id),
  email: text("email").notNull(),
  phone: text("phone"),
  preferencesNotes: text("preferences_notes"),
});

// -------- Artists --------

export const artists = sqliteTable("artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  agentId: text("agent_id").references(() => agents.id),
  managerEmail: text("manager_email"),
  genre: text("genre"),
  priorShowCount: integer("prior_show_count").notNull().default(0),
});

// -------- Shows --------

export const shows = sqliteTable("shows", {
  id: text("id").primaryKey(),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  date: text("date").notNull(),
  status: text("status", {
    enum: ["booked", "advanced", "day_of", "settled", "closed"],
  })
    .notNull()
    .default("booked"),
  doorsTime: text("doors_time"),
  setTime: text("set_time"),
  openerArtistId: text("opener_artist_id").references(() => artists.id),
  roomConfig: text("room_config", { enum: ["standing", "seated", "mixed"] })
    .notNull()
    .default("standing"),
  internalNotes: text("internal_notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// -------- Deals --------

/**
 * One deal per show. The structure here is deliberately split:
 *
 *  - `dealType` and the structured fields (guarantee, percentage, etc.)
 *    are what the in-app settlement tool reads.
 *  - `dealNotesFreetext` is what Mariana actually trusts.
 *  - `bonusesJson` exists in the schema but the in-app tool doesn't read it.
 *    It's been there since 2023, originally added by a now-departed PM. About
 *    half the deals that have bonus structures fill it in; the other half
 *    leave it empty and put the bonuses in the prose only. That mismatch
 *    is one of the case-study seams.
 *
 * bonusesJson schema (when present):
 *   [
 *     { type: "gross_threshold", label: string, threshold: number, amount: number, stacks?: boolean },
 *     { type: "sellout", label: string, amount: number },
 *     { type: "attendance_threshold", label: string, threshold: number, amount: number },
 *     { type: "tier_ratchet", label: string, tiers: [{ from, to|null, percentage }] }
 *   ]
 */
export const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .unique()
    .references(() => shows.id),

  dealType: text("deal_type", {
    enum: ["flat", "percentage_of_gross", "percentage_of_net", "vs", "door"],
  }).notNull(),
  guaranteeAmount: real("guarantee_amount"),
  percentage: real("percentage"),
  percentageBasis: text("percentage_basis", { enum: ["gross", "net"] }),
  expenseCap: real("expense_cap"),
  hospitalityCap: real("hospitality_cap"),

  bonusesJson: text("bonuses_json"),
  dealNotesFreetext: text("deal_notes_freetext"),

  // Ada — current structured extraction and flags (overwritten on each run)
  extractionJson: text("extraction_json"),
  ambiguityFlagsJson: text("ambiguity_flags_json"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// -------- Ada: deal notes history (append-only) --------

export const dealNotesHistory = sqliteTable("deal_notes_history", {
  id: text("id").primaryKey(),
  dealId: text("deal_id")
    .notNull()
    .references(() => deals.id),
  pastedText: text("pasted_text").notNull(),
  modeUsed: text("mode_used", { enum: ["initial", "update", "replace"] }).notNull(),
  pastedAt: integer("pasted_at", { mode: "timestamp" }).notNull(),
  extractionSnapshotJson: text("extraction_snapshot_json"),
});

// -------- Ticket sales --------

export const ticketSales = sqliteTable("ticket_sales", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id),
  qty: integer("qty").notNull(),
  gross: real("gross").notNull(),
  fees: real("fees").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(),
});

// -------- Comps --------

/**
 * Comp tickets given away. A real source of dispute — agents sometimes argue
 * that certain comps "should have counted toward the gross" the artist's % is
 * calculated against. Most comps don't count, but the rules vary by category
 * and sometimes by deal.
 *
 * Stored as one row per category per show (aggregated count, not per-ticket).
 */
export const comps = sqliteTable("comps", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id),
  category: text("category", {
    enum: [
      "artist_gl", // artist guest list
      "label", // label/management
      "press", // journalists, photographers
      "venue_staff", // venue staff and friends
      "sponsor", // sponsor reps
      "promo", // radio giveaways, 2-for-1s
      "other",
    ],
  }).notNull(),
  count: integer("count").notNull(),
  faceValue: real("face_value").notNull(),
  // Whether these comps count toward gross box office for settlement purposes.
  // Most categories don't, but the rules are inconsistent across deals.
  countsTowardGross: integer("counts_toward_gross", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
});

// -------- Expenses --------

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id),
  category: text("category", {
    enum: [
      "production",
      "sound",
      "lights",
      "hospitality",
      "marketing",
      "backline",
      "security",
      "other",
    ],
  }).notNull(),
  amount: real("amount").notNull(),
  description: text("description"),
  approved: integer("approved", { mode: "boolean" }).notNull().default(true),
  absorbedByVenue: integer("absorbed_by_venue", { mode: "boolean" })
    .notNull()
    .default(false),
  enteredByUserId: text("entered_by_user_id").references(() => users.id),
  enteredAt: integer("entered_at", { mode: "timestamp" }).notNull(),
});

// -------- Settlements --------

/**
 * The post-show financial reconciliation. One per show.
 *
 * Settlement is a multi-party state machine: the venue calculates a number,
 * sends it to the artist's tour manager / agent for review, they sign or
 * dispute, revisions happen, eventually a final number is agreed and money
 * moves.
 *
 * Stage timestamps below capture each transition. `status` is the current
 * stage. Most past shows are `paid`; recent ones are still in-flight.
 *
 * recoupsJson schema (when present):
 *   [
 *     { id, category: "marketing"|"hospitality_overage"|"production_overage"|"prior_advance"|"damages"|"other",
 *       label: string, amount: number, status: "agreed"|"disputed"|"withdrawn" }
 *   ]
 *
 * Recoups are venue costs that come "off the top" before artist payment.
 * They differ from regular expenses in two ways:
 *   1. They're disputed more often — the deal email language about recoups
 *      is frequently ambiguous (see the Coastal Spell dispute).
 *   2. They have their own lifecycle independent of the rest of the
 *      settlement — a recoup can be disputed even after the rest of the
 *      math is signed.
 */
export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .unique()
    .references(() => shows.id),

  status: text("status", {
    enum: [
      "draft", // booker is still doing math
      "submitted", // sent to artist team
      "in_review", // artist team has opened it
      "signed", // both parties agree
      "disputed", // line items contested
      "revised", // venue sent a revision after dispute
      "finalized", // signed after revision
      "paid", // money has moved
      "voided", // show cancelled or settlement scrapped
    ],
  })
    .notNull()
    .default("draft"),

  // Stage timestamps
  draftedAt: integer("drafted_at", { mode: "timestamp" }),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  reviewStartedAt: integer("review_started_at", { mode: "timestamp" }),
  signedAt: integer("signed_at", { mode: "timestamp" }),
  disputedAt: integer("disputed_at", { mode: "timestamp" }),
  revisedAt: integer("revised_at", { mode: "timestamp" }),
  finalizedAt: integer("finalized_at", { mode: "timestamp" }),
  paidAt: integer("paid_at", { mode: "timestamp" }),

  completedAt: integer("completed_at", { mode: "timestamp" }),
  completedByUserId: text("completed_by_user_id").references(() => users.id),

  grossBoxOffice: real("gross_box_office"),
  netBoxOffice: real("net_box_office"),
  totalExpenses: real("total_expenses"),
  totalToArtist: real("total_to_artist"),

  calculationJson: text("calculation_json"),
  recoupsJson: text("recoups_json"),

  signoffText: text("signoff_text"),
  notes: text("notes"),
});

// -------- Type exports for convenience --------

export type User = typeof users.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Agency = typeof agencies.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Artist = typeof artists.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type TicketSale = typeof ticketSales.$inferSelect;
export type Comp = typeof comps.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type DealNotesHistory = typeof dealNotesHistory.$inferSelect;

// -------- Decoded JSON helpers --------

export type Bonus =
  | {
      type: "gross_threshold";
      label: string;
      threshold: number;
      amount: number;
      stacks?: boolean;
    }
  | { type: "sellout"; label: string; amount: number }
  | {
      type: "attendance_threshold";
      label: string;
      threshold: number;
      amount: number;
    }
  | {
      type: "tier_ratchet";
      label: string;
      tiers: { from: number; to: number | null; percentage: number }[];
    };

export type Recoup = {
  id: string;
  category:
    | "marketing"
    | "hospitality_overage"
    | "production_overage"
    | "prior_advance"
    | "damages"
    | "other";
  label: string;
  amount: number;
  status: "agreed" | "disputed" | "withdrawn";
};

export type SettlementStage = Settlement["status"];
