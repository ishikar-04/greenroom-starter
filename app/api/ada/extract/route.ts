import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/db";
import { deals, dealNotesHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildSystemPrompt, buildUserMessage } from "@/lib/ada/prompts";
import { geminiResponseSchema } from "@/lib/ada/schemas";
import type {
  AdaApiRequest,
  AdaExtraction,
  AdaFlag,
  AdaMode,
} from "@/lib/ada/types";

const BRACKETED_UPDATE_RE = /\[[\s\S]*?\]/;

function makeBracketedUpdateFlag(match: string): AdaFlag {
  return {
    flag_class: "bracketed_update",
    field_affected: "global",
    description:
      "The pasted text contains a bracketed note that may represent a post-hoc update to deal terms. Verify that the structured fields reflect the most recent version.",
    evidence_quote: match,
  };
}

function makeModeFallbackFlag(): AdaFlag {
  return {
    flag_class: "mode_fallback",
    field_affected: "global",
    description:
      "Update mode was requested but no prior extraction exists for this deal. Ada ran as Initial extraction instead.",
    evidence_quote: null,
  };
}

export async function POST(req: Request) {
  let body: AdaApiRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deal_id, pasted_text, mode } = body;
  if (!deal_id || !pasted_text || !mode) {
    return NextResponse.json(
      { error: "Missing required fields: deal_id, pasted_text, mode" },
      { status: 400 },
    );
  }

  // Step 1 (Transaction A): persist the raw input before doing anything else.
  // This row is never deleted — even if Gemini fails later, Mariana's input is safe.
  let historyId: string;
  try {
    historyId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(dealNotesHistory).values({
        id: historyId,
        dealId: deal_id,
        pastedText: pasted_text,
        modeUsed: mode,
        pastedAt: new Date(),
      });
    });
  } catch (err) {
    console.error("[Ada] Failed to persist history row:", err);
    return NextResponse.json(
      { error: "Failed to save input. Please try again." },
      { status: 500 },
    );
  }

  // Step 2: deterministic bracketed_update check (before Gemini).
  const pendingFlags: AdaFlag[] = [];
  const bracketMatch = pasted_text.match(BRACKETED_UPDATE_RE);
  if (bracketMatch) {
    pendingFlags.push(makeBracketedUpdateFlag(bracketMatch[0]));
  }

  // Step 3: mode resolution — if Update requested but no prior extraction exists,
  // fall back to Initial and queue an advisory flag.
  let resolvedMode: AdaMode = mode;
  let priorExtraction: AdaExtraction | null = null;

  const dealRow = await db.query.deals.findFirst({
    where: eq(deals.id, deal_id),
  });

  if (!dealRow) {
    return NextResponse.json(
      { error: "Deal not found.", history_id: historyId },
      { status: 404 },
    );
  }

  if (dealRow.extractionJson) {
    try {
      priorExtraction = JSON.parse(dealRow.extractionJson) as AdaExtraction;
    } catch {
      priorExtraction = null;
    }
  }

  if (mode === "update" && !priorExtraction) {
    resolvedMode = "initial";
    pendingFlags.push(makeModeFallbackFlag());
  }

  // Replace mode always treats the new email as a fresh start.
  if (mode === "replace") {
    priorExtraction = null;
  }

  // Steps 4–5: build and send the Gemini request.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured.", history_id: historyId },
      { status: 500 },
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: buildSystemPrompt(),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
    },
  });

  let extraction: AdaExtraction;
  let geminiFlags: AdaFlag[];
  try {
    const userMessage = buildUserMessage(resolvedMode, pasted_text, priorExtraction);
    const result = await model.generateContent(userMessage);
    const raw = result.response.text();
    const parsed = JSON.parse(raw) as { extraction: AdaExtraction; flags: AdaFlag[] };
    extraction = parsed.extraction;
    geminiFlags = parsed.flags ?? [];
  } catch (err) {
    console.error("[Ada] Gemini call failed:", err);
    return NextResponse.json(
      {
        error: "Ada could not process the email. Your input has been saved — try again.",
        history_id: historyId,
      },
      { status: 502 },
    );
  }

  // Step 6 (Transaction B): append deterministic flags and persist results.
  const allFlags: AdaFlag[] = [...geminiFlags, ...pendingFlags];
  const extractionJson = JSON.stringify(extraction);
  const flagsJson = JSON.stringify(allFlags);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(dealNotesHistory)
        .set({ extractionSnapshotJson: JSON.stringify({ extraction, flags: allFlags }) })
        .where(eq(dealNotesHistory.id, historyId));

      await tx
        .update(deals)
        .set({
          extractionJson,
          ambiguityFlagsJson: flagsJson,
        })
        .where(eq(deals.id, deal_id));
    });
  } catch (err) {
    console.error("[Ada] Failed to persist extraction results:", err);
    return NextResponse.json(
      {
        error: "Ada extracted the deal but failed to save the results. Your original input is preserved.",
        history_id: historyId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    extraction,
    flags: allFlags,
    mode_used: resolvedMode,
    history_id: historyId,
  });
}
