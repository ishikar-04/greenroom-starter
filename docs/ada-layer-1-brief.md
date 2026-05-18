# Ada Layer 1 — Build Brief

## Context

You are working on Greenroom, a Next.js + SQLite SaaS for independent music venues. The primary user is **Mariana Reyes**, lead booker at The Crescent (650-cap indie rock room, Nashville). She negotiates deals with booking agents via email; deal terms arrive as prose. The current product's structured deal fields don't model real deals well, so Mariana enters deals as long-form notes in `deal_notes_freetext`. This causes disputes at settlement time when interpretations diverge.

**You are building Ada — an AI Deal Disambiguation Assistant.** Ada lives on `/shows/[id]`. Mariana pastes a deal email, picks a mode, and Ada returns deal-type-aware structured extraction plus ambiguity flags. **Ada surfaces ambiguity for human resolution; it does not pick interpretations.** This discipline is the core product philosophy — preserve it in every design decision.

**Read `docs/discovery-findings.md` before writing any code.** That file contains an analysis of 537 historical deals. The findings inform the extraction schema, the ambiguity classes, and which patterns are reliable. Treat that document as authoritative.

## Scope of this PR

Build only the following. Do not build anything not listed.

1. Database schema additions to support Ada's output and append-only notes history
2. Server-side API route that calls Gemini with deal text and returns structured extraction + flags
3. UI on `/shows/[id]` for paste, mode selection, Ask Ada button, and result display
4. Persistence of every paste (append-only) and current extraction (overwritten)

**Out of scope (do not build, do not mention in UI):**
- Flag resolution / mark-as-resolved interactions
- Calculator or settlement math
- Email integration / OAuth
- Receipt scanner
- Delete actions on extractions or notes
- Version history UI (data preserved, but no UI to browse it)
- Agent clarification email drafting

## Database changes

Read the current `deals` schema before making changes. Use the project's existing migration approach (raw SQL, drizzle, or whatever convention already exists in the repo — match it).

**Augment the `deals` table** with two new nullable columns:
- `extraction_json` (text, JSON) — Ada's current structured extraction
- `ambiguity_flags_json` (text, JSON) — Ada's current flags array

**Create a new table `deal_notes_history`:**
- `id` (primary key)
- `deal_id` (foreign key to `deals.id`)
- `pasted_text` (text, not null) — the raw email text Mariana pasted
- `mode_used` (text, not null) — one of: `initial`, `update`, `replace`
- `pasted_at` (timestamp, default now)
- `extraction_snapshot_json` (text, JSON, nullable) — the extraction result from this specific run, populated after Gemini returns

This table is **append-only**. No update or delete code paths anywhere in the app.

### Transactional integrity

The database mutations must follow safe transactional boundaries because **Mariana's input is sacred — never lose it; everything else is derivative.**

Implement as follows:
1. **First commit:** Insert the `deal_notes_history` row with `pasted_text`, `mode_used`, `pasted_at`. The `extraction_snapshot_json` starts null. This insert is its own committed transaction so the raw input is durable before Gemini is called.
2. **Then call Gemini** outside the transaction.
3. **Then a second transaction wraps** the update to `deal_notes_history` (setting `extraction_snapshot_json`) and the update to `deals` (setting `extraction_json` and `ambiguity_flags_json`). Either both succeed or both roll back.

If Gemini fails, the history row remains (with null snapshot). The deal record is unchanged. The user gets an error response, but their input is preserved for retry.

## Extraction schema

Gemini's output JSON must conform to this shape. The top-level `deal_type` determines which sub-schema is populated.

```json
{
  "deal_type": "flat" | "vs" | "percentage_of_net" | "percentage_of_gross" | "door",
  "guarantee_amount": number | null,
  "percentage": number | null,
  "percentage_basis": "gross" | "net" | null,
  "expense_cap": number | null,
  "hospitality_cap": number | null,
  "ratchet": {
    "base_percent": number,
    "cap_percent": number,
    "trigger_capacity_pct": number
  } | null,
  "walkout_pot": {
    "threshold_amount": number,
    "threshold_source": "stated" | "computed"
  } | null,
  "tiered_net_split": {
    "low_percent": number,
    "high_percent": number,
    "threshold_gross": number
  } | null,
  "bonuses": [
    {
      "type": "sellout" | "gross_threshold" | "attendance_threshold",
      "trigger": "string description",
      "amount": number,
      "stacks": boolean
    }
  ],
  "complex_structure": boolean,
  "raw_text_preserved": "full original pasted text"
}
```

For deal types where a field doesn't apply (e.g., `ratchet` on a `flat` deal), use `null`. Set `complex_structure: true` only for deals that don't cleanly fit the schema.

**For Update mode only**, also include:
```json
"changes_from_previous": [
  {
    "field_path": "guarantee_amount | bonuses[0].amount | ...",
    "previous_value": any,
    "new_value": any,
    "evidence_quote": "string from new email"
  }
]
```

## Ambiguity flag schema

```json
{
  "flag_class": "ambiguous_net" | "external_reference" | "computed_threshold" | "missing_overage" | "unresolved_reference" | "bracketed_update" | "mode_fallback" | "other",
  "field_affected": "guarantee_amount" | "percentage" | "percentage_basis" | "expense_cap" | "hospitality_cap" | "ratchet" | "walkout_pot" | "bonuses" | "global",
  "description": "human-readable explanation",
  "evidence_quote": "exact phrase from email text, or null"
}
```

Each extraction returns an array of zero or more flags.

## The ambiguity classes

These are **guidance for Gemini, not hardcoded rules.** The Gemini prompt should describe each and ask Gemini to identify them when present, but not force them when absent:

1. **`ambiguous_net`** — Vs or percentage-of-net deal where the email says "net" without defining what's deducted (no mention of expenses, ticket fees, etc.). Discovery found 73 such deals.
2. **`external_reference`** — Deal references terms in another document ("per the deal memo," "see email thread," "per our phone call"). Discovery found 23 such deals.
3. **`computed_threshold`** — Walkout pot or similar uses a dollar threshold derived from guarantee + expenses rather than a contractual fixed amount. If actual expenses deviate at settlement, the threshold may be wrong.
4. **`missing_overage`** — Deal specifies an expense cap or hospitality cap but does not state who absorbs overages. Discovery found this is universal in the dataset (0/537 deals specify). Ada flags this on any deal with a cap.
5. **`unresolved_reference`** — *Only relevant in Update mode.* New email references context not in the prior record (e.g., "the +500 stays in" with no prior +500).
6. **`bracketed_update`** — The pasted text contains bracketed prose like `[Updated 4 days before show via phone call...]`. **This is a deterministic regex check, not Gemini.** Match `\[.*?\]` patterns in pasted text and append a flag if present. Run this in the API handler, not inside the Gemini call.
7. **`mode_fallback`** — Generated by the API handler (not Gemini) when Update mode is requested but no prior extraction exists. The handler gracefully falls back to executing as Initial mode and appends this advisory flag explaining what happened.

## Two modes (plus implicit fallback)

Mariana picks via radio button on the paste UI:

**Initial** — No prior extraction exists for this deal. Default when `deals.extraction_json` is null.

**Update** — A prior extraction exists. Send Gemini both the prior extraction AND the new email; ask it to identify what changes, preserve unchanged fields, flag anything in the new email that references missing context. Output is still a full extraction (the new current state), with the additional `changes_from_previous` array.

**Replace** — Discard prior interpretation. Treat new email as the deal of record. Same prompt as Initial.

**UI behavior:**
- When no prior extraction exists for the deal: hide the mode toggle entirely; default silently to Initial.
- When a prior extraction exists: show the toggle with Update as default; require explicit selection to switch to Replace.

**Server-side fallback:** If incoming `mode === "update"` but `deals.extraction_json` is null, gracefully execute as Initial extraction and append the `mode_fallback` advisory flag. Do not error.

## Gemini setup

Use **`gemini-2.5-flash`** as the model. The API key is in `.env.local` as `GEMINI_API_KEY`.

Use the official `@google/generative-ai` Node SDK (run `npm install @google/generative-ai` if not already installed).

**Critical: enforce schema at the API level via `responseSchema`.** Do not rely on text-mode JSON output. Define the extraction schema and flag schema as explicit schema objects and pass them into the model's `generationConfig.responseSchema` configuration. This guarantees structural enforcement and removes the need for defensive parsing on our end. Use enum types for the discriminated union fields (`deal_type`, `flag_class`, `field_affected`, `percentage_basis`, etc.).

The response should be configured with `responseMimeType: "application/json"`.

Place the prompts and schema definitions in `lib/ada/prompts.ts` and `lib/ada/schemas.ts` (or similar — match existing convention). Do not inline prompts or schemas in the API route.

### System prompt requirements

- Tell Gemini it's a deal-term extractor for a venue booking system
- Describe the five deal types and which fields apply to each (a flat deal won't have ratchet/walkout/percentage; a door deal won't have percentage; etc.)
- Describe the six "Gemini-handled" ambiguity classes (1–5 above, plus 6 as a hint — but the regex match is authoritative for `bracketed_update`)
- Each ambiguity class description should include one example phrase
- Instruct Gemini to preserve original prose in `raw_text_preserved` and quote evidence in flag `evidence_quote` fields
- For Update mode: include the prior extraction JSON, instruct Gemini to identify changes and populate `changes_from_previous`, and to flag `unresolved_reference` for any new-email references to missing context

## API contract

Single POST endpoint: `/api/ada/extract`

**Request body:**
```json
{
  "deal_id": "string",
  "pasted_text": "string",
  "mode": "initial" | "update" | "replace"
}
```

**Response (success):**
```json
{
  "extraction": { ...extraction schema... },
  "flags": [ ...flag schema... ],
  "mode_used": "initial" | "update" | "replace",
  "history_id": "string"
}
```

**Response (error):**
```json
{
  "error": "string description",
  "history_id": "string"
}
```

(`history_id` is returned even on error so the UI can reference the preserved input.)

### Handler logic

1. **Step 1 (transaction A):** Insert row into `deal_notes_history` with `pasted_text`, `mode_used`, `pasted_at`. Commit. Capture `history_id`.
2. **Step 2:** Run `bracketed_update` regex on `pasted_text`. Collect any matches as pending flags to append later.
3. **Step 3 (mode resolution):** If `mode === "update"` and `deals.extraction_json` is null, downgrade to Initial mode internally and queue a `mode_fallback` flag for later append.
4. **Step 4:** Build the Gemini prompt — Initial/Replace use the base prompt; Update mode includes the prior extraction JSON.
5. **Step 5:** Call Gemini with `responseSchema` enforced. Wrap in try/catch.
6. **Step 6 (on Gemini success, transaction B):** Append the deterministic flags (`bracketed_update`, `mode_fallback` if applicable) to Gemini's flag array. Update `deal_notes_history` row's `extraction_snapshot_json`. Update `deals.extraction_json` and `deals.ambiguity_flags_json`. Commit.
7. **Step 7 (on Gemini failure):** Return error response with `history_id`. The `deal_notes_history` row from Step 1 remains intact.

## UI surface

On `/shows/[id]`, add an Ada section. **Do not disturb existing UI components.** Add Ada as a new section *below* the existing Deal Terms and Deal Notes cards. The existing structured deal display and free-text notes remain visible — Ada is additive, and the comparison between existing structured fields and Ada's extraction is itself an audit feature.

### Pre-extraction state (paste form)

A new section titled "Ask Ada" (or similar; match existing copy conventions). Contains:

- A clear instructional label: e.g., "Paste the latest deal email or agent communication."
- Large textarea for pasted email (multi-line, resizable)
- Mode selector: radio buttons for Initial / Update / Replace. Hide entirely if no prior extraction. Show with Update as default when prior extraction exists.
- "Ask Ada" button: disabled when textarea is empty or while request is in flight
- Loading state during the API call: a generic spinner with **rotating progress text** ("Reading the email...", "Identifying deal terms...", "Checking for ambiguities..."). Rotate every ~2 seconds during the 3–8 second wait. Use the project's existing spinner/loading component if one exists. Do not add domain-themed flourishes.

### Post-extraction state (results display)

After a successful run, replace (or augment, depending on what flows better) the paste form with a results display. Mariana should still be able to re-run Ada from this state (the textarea and button remain accessible, perhaps collapsed by default with a "Run Ada again" affordance).

**Layout structure (structural requirements):**

1. **Global flag banner** at the top — renders any flags with `field_affected: "global"` (typically `bracketed_update`, `mode_fallback`). Visible warning styling (yellow/orange tone, not red).

2. **Delta panel** below banner — *only renders in Update mode*. Shows the `changes_from_previous` array as a clear list: each entry shows the field, old value → new value, and the evidence quote.

3. **Card-based extraction display** for the deal terms. Cards group related fields. **The card structure should adapt to deal type — do not render empty cards.** Suggested groupings (Claude Code may adjust naming to fit existing UI patterns):
   - **Core terms:** `guarantee_amount`
   - **Percentage split:** `percentage`, `percentage_basis`
   - **Caps:** `expense_cap`, `hospitality_cap`
   - **Escalators:** `ratchet`, `walkout_pot`, `tiered_net_split`
   - **Bonuses:** the `bonuses` array

   For a `flat` deal, only "Core terms" may render. For a `door` deal, only "Caps". For a complex `vs` deal, all five.

4. **Inline flags** — flags with a specific `field_affected` value render *inside the card containing that field*, visually attached to the field. Styling consistent with the global banner but inline (smaller, no banner chrome). Show flag class label, description, and evidence quote.

5. **Optional metadata** — Claude Code may add subtle metadata like a collapsible "View original pasted text" (showing `raw_text_preserved`), a small indicator if `complex_structure: true`, or a timestamp showing when Ada last ran. Use judgment; these are nice-to-haves.

### Permission to deviate

The structural intent is required. The visual styling should match the existing app's component library and design tokens, not pixel-replicate any prototype.

**Required:**
- Banner placement above extraction
- Delta panel below banner (Update mode only)
- Card-based extraction display
- Inline flags positioned near the field they affect via `field_affected` mapping

**Flexible (Claude Code's judgment):**
- Exact card titles (use natural language matching app conventions)
- Number of cards (driven by populated fields, not fixed at any count)
- Visual styling (must match existing app)
- Subtle metadata additions

### Flag rendering details

- Read-only in v1 — no resolve buttons, no dismiss actions, no click handlers beyond expand-for-detail if needed
- Show: flag class label (humanized — "Ambiguous net definition" not `ambiguous_net`), description text, evidence quote in a quoted-text style if present
- Color/treatment communicates "advisory" not "error" — these are things Mariana should think about, not things that are broken

## Implementation constraints

- Use the existing project's framework conventions (Next.js App Router, the existing DB layer, existing styling system)
- Read 2–3 existing pages/routes/components to match patterns before writing new code
- All new files in plausible locations matching existing convention
- Don't refactor existing code unrelated to Ada
- TypeScript throughout, with shared types for the extraction and flag schemas (export from `lib/ada/types.ts` or similar)
- The schema definitions used in `responseSchema` should be the source of truth; TypeScript types can be derived from them

## What to do before writing code

1. Read `docs/discovery-findings.md` in full
2. Read the existing `deals` table schema and one example show page (`/shows/[id]`) to understand the codebase
3. Confirm `.env.local` has `GEMINI_API_KEY` set (it does)
4. **Outline your plan: the files you'll create, the schema migration approach, the prompt strategy. Wait for my confirmation before writing code.**

## What to do at the end

1. Commit on a new branch `feat/ada-layer-1` (parent: `feat/ada-discovery`)
2. Don't merge to main
3. Tell me what you built, what you didn't, what edge cases you noticed, and what you'd do differently with more time
