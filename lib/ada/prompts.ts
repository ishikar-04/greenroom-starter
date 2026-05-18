import type { AdaExtraction, AdaMode } from "./types";

const DEAL_TYPE_GUIDE = `
## Deal types and which fields apply

**flat** — Flat guarantee only. Artist receives a fixed dollar amount regardless of box office.
  Fields: guarantee_amount only. percentage, ratchet, walkout_pot, tiered_net_split are null.

**vs** (guarantee vs. percentage) — Artist receives the greater of a guarantee or a percentage of net/gross.
  Fields: guarantee_amount, percentage, percentage_basis. May also have ratchet, walkout_pot, tiered_net_split, bonuses.
  This is the most structurally complex deal type.

**percentage_of_net** — Artist receives a percentage of net box office (no guarantee, or guarantee vs. percentage whichever greater).
  Fields: percentage, percentage_basis (always "net"). May have expense_cap, hospitality_cap.

**percentage_of_gross** — Artist receives a percentage of gross box office. No expense deductions.
  Fields: percentage, percentage_basis (always "gross"). ratchet, walkout_pot are null.

**door** — Artist receives ticket revenue minus capped expenses.
  Fields: expense_cap (required), hospitality_cap (optional). guarantee_amount and percentage are null.
`.trim();

const AMBIGUITY_CLASS_GUIDE = `
## Ambiguity classes to detect

Generate a flag for each of the following when present in the email text. Do not force a flag when the class is clearly absent.

**ambiguous_net** — A vs or percentage-of-net deal where the email uses "net" without defining what is deducted from gross. No mention of expense deductions, ticket fees, etc. Example phrase: "85/15 net" with no qualifying language. Do NOT flag deals that explicitly say "net after expenses" or "gross."

**external_reference** — Deal references terms living in another document or communication, making those terms unverifiable from the email alone. Example phrase: "per the deal memo," "see email thread," "per our phone call," "bonuses per the email." Flag this when bonus amounts or deal terms are deferred to an outside source.

**computed_threshold** — A walkout pot or similar structure where the trigger threshold is described as a dollar amount that equals the breakeven (guarantee + projected expenses) rather than a contractual fixed amount. If actual expenses deviate, the stated threshold will be wrong at settlement. Example phrase: "walkout pot: 100% of gross above $3,200" where $3,200 appears to be a computed breakeven.

**missing_overage** — The deal specifies an expense cap or hospitality cap but says nothing about who absorbs costs if actual expenses exceed the cap. Example phrase: "Expense cap $1,950" with no "overages absorbed by venue" or similar language. Flag on any deal that has a cap with no overage language.

**unresolved_reference** — ONLY in update mode. The new email references context not present in the prior extraction record. Example phrase: "the +500 stays in" where no +500 was in the prior record.
`.trim();

export function buildSystemPrompt(): string {
  return `You are a deal-term extraction engine for a venue booking system used by independent music venues.

Your job: read a deal email between a venue booker and a booking agent, extract structured deal terms, and identify ambiguities that need human review before settlement.

${DEAL_TYPE_GUIDE}

${AMBIGUITY_CLASS_GUIDE}

## General extraction rules

- Identify the deal type first — it determines which fields are meaningful.
- For fields that don't apply to the deal type, output null.
- Normalize notation variants to the same structure. "85/15 net," "$X vs 85% of net after expenses," "$X g'tee vs 85/15 after expenses" all mean the same thing.
- Set complex_structure: true only when the deal genuinely doesn't fit the schema cleanly (e.g., a ratchet combined with a tiered net split combined with multiple stacked bonus tiers).
- Always copy the full original text verbatim into raw_text_preserved.
- For every flag you generate, include an evidence_quote: copy the exact phrase from the email that triggered the flag. If no specific phrase applies, set evidence_quote to null.
- The field_affected value should identify the specific deal field the flag relates to. Use "global" only for flags that span the entire deal (e.g., a bracketed override note, a mode-fallback advisory).
- For every flag you generate, produce a suggested_question: a single neutral sentence Mariana could send to the agent to resolve the ambiguity. The question must be specific to the evidence quoted, neutral in framing (do not imply a preferred answer), and short enough to paste directly into an email. Example for an ambiguous_net flag: "Could you confirm whether 'net' in this deal means gross box office minus approved venue expenses, or whether there are additional deductions (ticket fees, credit card surcharges, etc.) that come out first?"
- Generate zero flags if the deal is clear. Do not pad with unnecessary warnings.
- Percentages should be expressed as decimals (e.g., 85% → 0.85).`;
}

export function buildUserMessage(
  mode: AdaMode,
  pastedText: string,
  priorExtraction?: AdaExtraction | null,
): string {
  if (mode === "update" && priorExtraction) {
    return `Mode: UPDATE

Prior extraction on file:
${JSON.stringify(priorExtraction, null, 2)}

New email text to process:
${pastedText}

Instructions for update mode:
1. Produce a full new extraction reflecting the current deal state (do not omit fields that haven't changed).
2. Populate changes_from_previous with an entry for each field that changed between the prior extraction and the new email. Include field_path, previous_value, new_value, and evidence_quote (exact phrase from the new email).
3. For fields unchanged, carry forward the prior values exactly.
4. If the new email references context not present in the prior extraction (e.g., "the +500 stays in" with no prior +500), generate an unresolved_reference flag.`;
  }

  return `Mode: ${mode.toUpperCase()}

Deal email text:
${pastedText}`;
}
