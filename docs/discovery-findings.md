# Ada Pre-Design Data Analysis: `greenroom.db` Deal Patterns

## 1. Schema Map

The database has 11 tables. The core chain is: **`shows`** (venue + artist + date) → **`deals`** (1:1 with shows via `show_id`) → **`settlements`** (also 1:1 via `show_id`). `deals` has 11 columns: `id`, `show_id`, `deal_type`, `guarantee_amount`, `percentage`, `percentage_basis`, `expense_cap`, `hospitality_cap`, `bonuses_json`, `deal_notes_freetext`, and `created_at`. Settlements hold the financial outcome (`gross_box_office`, `net_box_office`, `total_expenses`, `total_to_artist`) plus a `calculation_json` that shows how the deal was applied. Supporting tables are `artists`, `venues`, `agents`, `agencies`, `ticket_sales`, `expenses`, `comps`, and `users`. There are no foreign key constraints enforced — the relationships are implicit by column naming convention.

---

## 2. Deal Type Distribution

**537 total deals. Every single deal has `deal_notes_freetext` populated — 100%.**

| Deal Type | Count | % of total |
|---|---|---|
| `vs` (guarantee vs. percentage) | 195 | 36% |
| `flat` (flat guarantee) | 185 | 34% |
| `percentage_of_net` | 109 | 20% |
| `door` | 30 | 6% |
| `percentage_of_gross` | 18 | 3% |

**Structured field population:**

| Field | Populated | Notes |
|---|---|---|
| `guarantee_amount` | 381 / 537 (71%) | blank on `percentage_of_net` and `door` |
| `percentage` | 322 / 537 (60%) | |
| `expense_cap` | 317 / 537 (59%) | always paired with `hospitality_cap` when set |
| `hospitality_cap` | 334 / 537 (62%) | 17 deals have this but no `expense_cap` |
| `bonuses_json` | 129 / 537 (24%) | serious undercount — see §3c below |

**Structured vs. prose contradictions:** Low signal on numeric mismatches — a spot-check of 15 `vs` deals found 0 percentage field contradictions (the structured `percentage` field reliably mirrors the primary percentage in the notes). The one documented exception is deliberate and self-annotating (see §4).

---

## 3. Pattern Analysis on `deal_notes_freetext`

### 3a. Walkouts / Tier Ratchets

**59 deals (11%) contain walkout, ratchet, or escalator language.** All are `vs` deal type.

Two distinct sub-patterns:

**Walkout pot** (28 deals): Artist receives 100% of gross above a specified threshold — described as the breakeven point. Structure is highly consistent:

> `"$2,631 vs 90% net + walkout pot. After breakeven on guarantee + expenses, all incremental gross goes to artist. Hospitality cap $400. Walkout pot: 100% of gross above $3,200."`

> `"790 g'tee vs 85/15 net, walkout above breakeven. Expense cap 400, hosp $600. Walkout pot: 100% of gross above $900."`

The threshold in these deals appears to be the computed breakeven (guarantee + expenses), though this is specified as a dollar amount in prose, not as a formula. **The `bonuses_json` for walkout pot deals uses `type: "gross_threshold"` with a pre-computed dollar amount** — meaning if actual expenses deviate from projections, the threshold number in the system is wrong.

**Escalating ratchet** (25 deals): Percentage steps up at 80% capacity. Extremely stereotyped language — almost every deal uses the same template:

> `"7,138 g'tee with escalator: 70% net at base, ratchets to 80% over 80% capacity. Expenses to 3550."`

> `"1,446 g'tee with escalator: 85% net at base, ratchets to 95% over 80% capacity. Expenses to 700. Ratchet: 85% to 95% over 80% sold."`

Ratchet shapes across 24 extracted clauses:

| Shape (base → cap, over threshold) | Count |
|---|---|
| 85% → 95% over 80% sold | 9 |
| 75% → 85% over 80% sold | 6 |
| 90% → 100% over 80% sold | 4 |
| 80% → 90% over 80% sold | 4 |
| 70% → 80% over 80% sold | 1 |

**The 80%-capacity threshold is universal.** Variance is only in the base/cap percentages. Three deals combine a ratchet with a tiered net split (see §4).

---

### 3b. Hospitality / Expense Caps and Overage Rules

**385 deals (72%) mention hospitality or expense caps.** However: **zero deals use the words "overage," "absorbed by," "over and above," or "in excess of."** Overage responsibility is simply never stated in the data. The cap is mentioned as a ceiling with no language about what happens if actual expenses exceed it.

Formats vary and are not standardized:

- `"Expense cap $1,950, hospitality $300."` — explicit dollar amounts, common
- `"Expenses to 3,550."` — shorthand used in ratchet deals
- `"Expenses capped $700. Hospitality cap $400."` — verbose form in `percentage_of_net` deals
- `"Hosp $500."` — bare minimum

**Two separate fields exist (`expense_cap` and `hospitality_cap`) but the notes treat them variably** — sometimes combined, sometimes only one mentioned. 17 deals have a `hospitality_cap` field but no `expense_cap` field. The structured fields align with the prose where both exist; there are no detected contradictions.

**Pattern by deal type:** Expense cap mentions cluster heavily in `vs` and `percentage_of_net` deals. `flat` deals almost never mention expense caps (consistent with buyout logic). `door` deals always have expense caps (the artist gets ticket revenue minus capped expenses).

---

### 3c. Bonuses

**89 deals (17%) contain bonus language in prose.** The structured `bonuses_json` is only populated for 129 deals total, but only **71 of the 89 prose-bonus deals have matching `bonuses_json`** — meaning **18 deals have bonuses described in text with no corresponding structured data.**

The 18 "dark" bonus deals all follow the same pattern:

> `"Performance bonuses per the deal memo (see email thread)."`

The bonus amount, trigger, and structure are entirely outside the system. There are also 5 more `percentage_of_gross` deals with `"Sellout bonus per the email"` — 3 of those do have `bonuses_json` populated (the amount was manually entered), but 2 remain null.

**Bonus trigger taxonomy across captured deals:**

| Trigger type | Count |
|---|---|
| Sellout / sold out | 41 |
| Gross threshold (`+$X if gross > $Y`) | 35 extracted clauses across 25 deals |
| Attendance threshold | 4 |
| Net threshold | 0 |

Gross-threshold bonuses are modelable as a sub-schema — they are structurally identical: a dollar bonus amount, a gross dollar trigger, and a stacking flag. The `bonuses_json` schema already uses `{"type":"gross_threshold","threshold":N,"amount":N,"stacks":true}` for these.

Sellout bonuses are a second consistent shape: `{"type":"sellout","amount":N}`. Six deals have **multiple stacked bonus tiers** (e.g., `+$800 if gross > $21,000; +$800 if gross > $29,000`), all modeled cleanly in `bonuses_json`.

**The bonus sub-schema is coherent enough to model** for the cases that are in-system. The "per the email" pattern is the gap Ada should explicitly flag.

---

### 3d. The "Net" Definition

**151 deals use the phrase "net after expenses."** That is the entire vocabulary of net definition in this dataset. No deal mentions ticket fees, platform fees, credit card surcharges, box office fees, or service fees as deductions from net. The Coastal Spell dispute (referenced in `dispute-thread.md`) is about exactly this gap — the system assumes net = gross minus approved expenses, and no deal text carves out a different definition.

**Consistency breakdown:**

- All 109 `percentage_of_net` deals: 100% say `"net after expenses"` (either `"85% of net after expenses"` or `"guarantee vs 85% of net after expenses, whichever greater"`). Zero variance.
- `vs` deals: Only 51/195 (26%) explicitly say "net after expenses." The remaining 73 use ambiguous shorthands like `"85/15 net"`, `"% of net"`, or `"net"` without defining what net means. An additional 62 `vs` deals explicitly say "GROSS" (no expense deductions) — these are unambiguous in the other direction.
- `percentage_of_gross` deals: All 18 include `"No expense deductions"` — consistently clear.

**The ambiguity is concentrated in the 73 `vs` deals that say "net" without qualification.** Ada should flag these as requiring confirmation of net definition.

---

## 4. Other Findings Worth Noting

**A known stale structured field (one deal, `deal_show_0007`).** The notes explicitly say:

> `"[Updated 4 days before show via phone call with agent: bonus threshold dropped to $6,000. Note: structured field still reflects original $11,000 — confirm before settlement.]"`

The `bonuses_json` still contains `"threshold": 11000`. This is the only self-documented discrepancy in the dataset, but it reveals a real workflow: deal terms change via phone or email after the record is created, the prose gets a bracket note, and the structured fields are not updated. Ada should watch for bracketed notes and flag them as potential override signals.

**Renegotiated deals are nearly invisible.** Only 2 deals contain words like "renegotiated" or "revised." The phone-call update above was caught only because someone added a bracket note. There is no `amended_at` timestamp or version history on `deals`.

**Notation inconsistency for the same deal structure.** `vs` deals use at least four surface forms for the same 85/15 net deal:
- `"$X guarantee vs 85% of net after expenses"`
- `"$X vs 85/15 net"`
- `"$X g'tee vs 85/15 after expenses"`
- `"Deal: $X vs 85/15 after expenses"`

All mean the same thing. Ada's extraction needs to normalize across these.

**Three deals combine a ratchet and a tiered net split**, which is the most structurally complex pattern in the dataset:

> `"8,575 g'tee vs 85% of net. Expenses to 4300. Hospitality $600. Tiered net split: 60% / 70% over $34,000."`

> `"$7,080 vs 80% net to 80% sold, 90% above. Expense cap $3,550, hospitality $400. Tiered net split: 60% / 70% over $28,000; Ratchet: 80% to 90% over 80% sold."`

The `bonuses_json` schema does not capture tiered net splits at all — these deals have `type: "tier_ratchet"` for the capacity ratchet, but the gross-dollar tiered split is only in prose.

**Door deals are maximally boilerplate.** All 30 are: `"Door deal. Artist gets ticket revenue minus expenses (capped $X). DIY/experimental tour."` The only variable is the expense cap. Trivially extractable.

**`percentage_of_gross` deals always disclaim expenses** with `"No expense deductions. Simple split deal."` — these are the most parse-friendly deal type.

**23 deals reference external documents** ("per the deal memo," "see email thread," "per the email") for bonus terms. This is a hard gap for Ada: the bonus exists, the amount doesn't. These should surface as explicit "bonus terms unresolved — check email" flags rather than silent nulls.

---

## Summary for Ada's Extraction Schema

The five deal types map reasonably cleanly to structural templates, with `vs` being the most complex. The guaranteed fields (`deal_type`, `guarantee_amount`, `percentage`, `expense_cap`, `hospitality_cap`) are reliable where populated. The `bonuses_json` is incomplete and should be treated as supplementary. The biggest extraction challenges are:

- **(a)** The 73 ambiguous-net `vs` deals — "net" is used without defining what it excludes
- **(b)** The 23 externally-referenced bonus deals — amounts live in email, not the system
- **(c)** Ratchet/walkout threshold numbers that are computed rather than contractual — a threshold stated as a dollar amount may not match actual breakeven at settlement time
- **(d)** The absent overage responsibility language — Ada can never extract it, only flag its absence
