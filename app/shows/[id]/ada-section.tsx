"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle, Info, ArrowRight, Copy, Check } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AdaExtraction,
  AdaFlag,
  AdaFieldAffected,
  AdaMode,
  AdaApiSuccess,
  AdaHistoryEntry,
} from "@/lib/ada/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  "Reading the email...",
  "Identifying deal terms...",
  "Checking for ambiguities...",
];

const FLAG_CLASS_LABELS: Record<AdaFlag["flag_class"], string> = {
  ambiguous_net: "Ambiguous net definition",
  external_reference: "Terms in external document",
  computed_threshold: "Computed threshold",
  missing_overage: "Overage responsibility unspecified",
  unresolved_reference: "Unresolved reference",
  bracketed_update: "Bracketed update detected",
  mode_fallback: "Mode adjusted",
  other: "Advisory",
};

const MODE_LABELS: Record<AdaMode, string> = {
  initial: "Initial",
  update: "Update",
  replace: "Replace",
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Flag display ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10.5px] text-ink-400 hover:text-ink-700 transition-colors shrink-0"
      aria-label="Copy question"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-brand-600" />
          <span className="text-brand-600">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function FlagItem({ flag, inline = false }: { flag: AdaFlag; inline?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md ring-1 ring-amber-200/70 bg-amber-50/60",
        inline ? "px-3 py-2 mt-2" : "px-4 py-3",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            "shrink-0 text-amber-600",
            inline ? "h-3 w-3 mt-0.5" : "h-3.5 w-3.5 mt-0.5",
          )}
        />
        <div className="min-w-0 w-full">
          <span
            className={cn(
              "font-medium text-amber-900",
              inline ? "text-[11px]" : "text-[12px]",
            )}
          >
            {FLAG_CLASS_LABELS[flag.flag_class]}
          </span>
          <p
            className={cn(
              "text-amber-800 mt-0.5 leading-relaxed",
              inline ? "text-[11px]" : "text-[12px]",
            )}
          >
            {flag.description}
          </p>
          {flag.evidence_quote && (
            <blockquote
              className={cn(
                "mt-1.5 pl-2 border-l-2 border-amber-300 text-amber-700 italic",
                inline ? "text-[10.5px]" : "text-[11px]",
              )}
            >
              &ldquo;{flag.evidence_quote}&rdquo;
            </blockquote>
          )}
          {flag.suggested_question && (
            <div className="mt-2 pt-2 border-t border-amber-200/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="eyebrow text-[9px] text-amber-700 mb-1">Suggested question</div>
                  <p className={cn("text-amber-800 leading-relaxed", inline ? "text-[11px]" : "text-[12px]")}>
                    {flag.suggested_question}
                  </p>
                </div>
                <CopyButton text={flag.suggested_question} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Individual extraction cards ─────────────────────────────────────────────

function FieldRow({
  label,
  value,
  flags,
}: {
  label: string;
  value: React.ReactNode;
  flags?: AdaFlag[];
}) {
  return (
    <div>
      <div className="eyebrow text-[10px] text-ink-500 mb-1">{label}</div>
      <div className="text-[13.5px] text-ink-900 font-mono tabular">{value}</div>
      {flags?.map((f, i) => <FlagItem key={i} flag={f} inline />)}
    </div>
  );
}

function CoreTermsCard({
  extraction,
  flagMap,
}: {
  extraction: AdaExtraction;
  flagMap: Map<AdaFieldAffected, AdaFlag[]>;
}) {
  if (extraction.guarantee_amount == null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Core terms</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldRow
          label="Guarantee"
          value={formatMoney(extraction.guarantee_amount)}
          flags={flagMap.get("guarantee_amount")}
        />
      </CardContent>
    </Card>
  );
}

function PercentageSplitCard({
  extraction,
  flagMap,
}: {
  extraction: AdaExtraction;
  flagMap: Map<AdaFieldAffected, AdaFlag[]>;
}) {
  if (extraction.percentage == null && extraction.percentage_basis == null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Percentage split</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldRow
          label="Percentage"
          value={formatPct(extraction.percentage)}
          flags={flagMap.get("percentage")}
        />
        <FieldRow
          label="Basis"
          value={
            extraction.percentage_basis ? (
              <span className="capitalize">{extraction.percentage_basis}</span>
            ) : (
              "—"
            )
          }
          flags={flagMap.get("percentage_basis")}
        />
      </CardContent>
    </Card>
  );
}

function CapsCard({
  extraction,
  flagMap,
}: {
  extraction: AdaExtraction;
  flagMap: Map<AdaFieldAffected, AdaFlag[]>;
}) {
  if (extraction.expense_cap == null && extraction.hospitality_cap == null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Caps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {extraction.expense_cap != null && (
          <FieldRow
            label="Expense cap"
            value={formatMoney(extraction.expense_cap)}
            flags={flagMap.get("expense_cap")}
          />
        )}
        {extraction.hospitality_cap != null && (
          <FieldRow
            label="Hospitality cap"
            value={formatMoney(extraction.hospitality_cap)}
            flags={flagMap.get("hospitality_cap")}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EscalatorsCard({
  extraction,
  flagMap,
}: {
  extraction: AdaExtraction;
  flagMap: Map<AdaFieldAffected, AdaFlag[]>;
}) {
  const hasAny =
    extraction.ratchet != null ||
    extraction.walkout_pot != null ||
    extraction.tiered_net_split != null;
  if (!hasAny) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalators</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {extraction.ratchet && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">Ratchet</div>
            <div className="text-[13px] text-ink-800 leading-relaxed">
              {formatPct(extraction.ratchet.base_percent)} base →{" "}
              {formatPct(extraction.ratchet.cap_percent)} above{" "}
              {formatPct(extraction.ratchet.trigger_capacity_pct)} capacity
            </div>
            {flagMap.get("ratchet")?.map((f, i) => <FlagItem key={i} flag={f} inline />)}
          </div>
        )}
        {extraction.walkout_pot && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">Walkout pot</div>
            <div className="text-[13px] text-ink-800 leading-relaxed">
              100% of gross above {formatMoney(extraction.walkout_pot.threshold_amount)}
              {extraction.walkout_pot.threshold_source === "computed" && (
                <span className="ml-1.5 text-[11px] text-ink-400">(computed threshold)</span>
              )}
            </div>
            {flagMap.get("walkout_pot")?.map((f, i) => <FlagItem key={i} flag={f} inline />)}
          </div>
        )}
        {extraction.tiered_net_split && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">Tiered net split</div>
            <div className="text-[13px] text-ink-800 leading-relaxed">
              {formatPct(extraction.tiered_net_split.low_percent)} up to{" "}
              {formatMoney(extraction.tiered_net_split.threshold_gross)} gross, then{" "}
              {formatPct(extraction.tiered_net_split.high_percent)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BonusesCard({
  extraction,
  flagMap,
}: {
  extraction: AdaExtraction;
  flagMap: Map<AdaFieldAffected, AdaFlag[]>;
}) {
  if (!extraction.bonuses || extraction.bonuses.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonuses</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {extraction.bonuses.map((b, i) => (
            <li key={i} className="text-[13px] text-ink-800 leading-relaxed">
              <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-brand-200/50 text-brand-800 mr-2">
                {b.type === "gross_threshold"
                  ? "gross"
                  : b.type === "attendance_threshold"
                    ? "attend"
                    : "sellout"}
              </span>
              {b.trigger}
              {" · "}
              <span className="font-mono tabular">{formatMoney(b.amount)}</span>
              {b.stacks && (
                <span className="ml-1.5 text-[11px] text-ink-400">stacks</span>
              )}
            </li>
          ))}
        </ul>
        {flagMap.get("bonuses")?.map((f, i) => <FlagItem key={i} flag={f} inline />)}
      </CardContent>
    </Card>
  );
}

// ─── Delta panel (Update mode) ───────────────────────────────────────────────

function DeltaPanel({ extraction }: { extraction: AdaExtraction }) {
  const changes = extraction.changes_from_previous;
  if (!changes || changes.length === 0) return null;

  return (
    <div className="rounded-lg ring-1 ring-sky-200/70 bg-sky-50/50 px-5 py-4">
      <div className="eyebrow text-[10px] text-sky-700 mb-3">Changes from prior version</div>
      <ul className="space-y-3">
        {changes.map((c, i) => (
          <li key={i} className="text-[12.5px] text-ink-800">
            <div className="font-mono text-[11px] text-ink-500 mb-0.5">{c.field_path}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-ink-500 line-through">{String(c.previous_value ?? "—")}</span>
              <ArrowRight className="h-3 w-3 text-ink-400 shrink-0" />
              <span className="font-medium text-ink-900">{String(c.new_value ?? "—")}</span>
            </div>
            {c.evidence_quote && (
              <blockquote className="mt-1 pl-2 border-l-2 border-sky-300 text-[11px] text-sky-700 italic">
                &ldquo;{c.evidence_quote}&rdquo;
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Extraction result display ───────────────────────────────────────────────

function ExtractionResult({
  extraction,
  flags,
  modeUsed,
}: {
  extraction: AdaExtraction;
  flags: AdaFlag[];
  modeUsed: AdaMode;
}) {
  const [showRawText, setShowRawText] = useState(false);

  const flagMap = new Map<AdaFieldAffected, AdaFlag[]>();
  for (const f of flags) {
    const existing = flagMap.get(f.field_affected) ?? [];
    flagMap.set(f.field_affected, [...existing, f]);
  }

  const globalFlags = flagMap.get("global") ?? [];

  return (
    <div className="space-y-4">
      {globalFlags.length > 0 && (
        <div className="space-y-2">
          {globalFlags.map((f, i) => <FlagItem key={i} flag={f} />)}
        </div>
      )}

      {modeUsed === "update" && <DeltaPanel extraction={extraction} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CoreTermsCard extraction={extraction} flagMap={flagMap} />
        <PercentageSplitCard extraction={extraction} flagMap={flagMap} />
        <CapsCard extraction={extraction} flagMap={flagMap} />
        <EscalatorsCard extraction={extraction} flagMap={flagMap} />
        <BonusesCard extraction={extraction} flagMap={flagMap} />
      </div>

      {extraction.complex_structure && (
        <div className="flex items-center gap-2 text-[12px] text-ink-500 pt-1">
          <Info className="h-3.5 w-3.5" />
          Ada marked this deal as complex — it may not fit the standard schema cleanly. Review the original text.
        </div>
      )}

      <div className="border-t border-ink-100/80 pt-3">
        <button
          type="button"
          onClick={() => setShowRawText((v) => !v)}
          className="flex items-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-700 transition-colors"
        >
          {showRawText ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showRawText ? "Hide" : "View"} original pasted text
        </button>
        {showRawText && (
          <div className="mt-2 text-[12px] text-ink-700 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/50 leading-relaxed whitespace-pre-wrap font-[450]" style={{ fontStyle: "italic" }}>
            {extraction.raw_text_preserved}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History panel ───────────────────────────────────────────────────────────

function HistoryEntryItem({ entry }: { entry: AdaHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);

  const snippet =
    entry.pastedText.length > 80
      ? entry.pastedText.slice(0, 80) + "…"
      : entry.pastedText;

  let snapshotData: { extraction: AdaExtraction; flags: AdaFlag[] } | null = null;
  if (entry.extractionSnapshotJson) {
    try {
      snapshotData = JSON.parse(entry.extractionSnapshotJson);
    } catch {
      // malformed snapshot — show failure state
    }
  }

  return (
    <div className="rounded-lg ring-1 ring-ink-200/60 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-ink-500">{formatTimestamp(entry.pastedAt)}</span>
            <span className="text-ink-300">·</span>
            <span className="text-[11px] text-ink-500">{MODE_LABELS[entry.modeUsed]}</span>
          </div>
          <p className="text-[12px] text-ink-600 leading-relaxed">{snippet}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-ink-400 hover:text-ink-700 transition-colors shrink-0 mt-0.5"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ink-100/80">
          {snapshotData ? (
            <ExtractionResult
              extraction={snapshotData.extraction}
              flags={snapshotData.flags}
              modeUsed={entry.modeUsed}
            />
          ) : (
            <p className="text-[12px] text-ink-400 italic">
              Extraction failed — input preserved
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AdaSection({
  dealId,
  dealNotesFreetext,
  existingExtraction,
  existingFlags,
  existingHistory,
}: {
  dealId: string;
  dealNotesFreetext: string | null;
  existingExtraction: AdaExtraction | null;
  existingFlags: AdaFlag[] | null;
  existingHistory: AdaHistoryEntry[];
}) {
  const router = useRouter();

  const [pastedText, setPastedText] = useState("");
  const [mode, setMode] = useState<AdaMode>(existingExtraction != null ? "update" : "initial");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [result, setResult] = useState<AdaApiSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AdaHistoryEntry[]>(existingHistory);

  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isLoading) {
      setLoadingPhase(0);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingPhase((p) => (p + 1) % LOADING_MESSAGES.length);
      }, 2000);
    } else {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
    }
    return () => {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
    };
  }, [isLoading]);

  // A prior extraction exists either from the server or from this session.
  const hasExisting = existingExtraction != null || result != null;

  const displayExtraction = result?.extraction ?? existingExtraction ?? null;
  const displayFlags = result?.flags ?? existingFlags ?? null;
  const displayMode = result?.mode_used ?? (existingExtraction != null ? "update" : "initial");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pastedText.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ada/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId,
          pasted_text: pastedText,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok || "error" in data) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        const success = data as AdaApiSuccess;
        setResult(success);
        setPastedText("");
        if (success.history) setHistory(success.history);
        router.refresh();
      }
    } catch {
      setError("Network error. Your input has been saved if it reached the server.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-brand-600" />
        <h2 className="text-[13px] font-semibold text-ink-900 tracking-tight">Ask Ada</h2>
        <span className="text-[11px] text-ink-400">· Deal disambiguation assistant</span>
      </div>

      {/* Current extraction results */}
      {displayExtraction && displayFlags && (
        <div className="mb-6">
          <ExtractionResult
            extraction={displayExtraction}
            flags={displayFlags}
            modeUsed={displayMode as AdaMode}
          />
        </div>
      )}

      {/* Version history — last 3 runs */}
      {history.length > 0 && (
        <div className="mb-6">
          <div className="eyebrow text-[10px] text-ink-500 mb-2">Recent runs</div>
          <div className="space-y-2">
            {history.slice(0, 3).map((entry) => (
              <HistoryEntryItem key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Paste form — always visible */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label
                  htmlFor="ada-paste"
                  className="eyebrow text-[10px] text-ink-500"
                >
                  Paste the latest deal email or agent communication
                </label>
                {dealNotesFreetext && (
                  <button
                    type="button"
                    onClick={() => setPastedText(dealNotesFreetext)}
                    className="text-[11px] text-brand-600 hover:text-brand-800 transition-colors"
                  >
                    ↓ Insert current deal notes
                  </button>
                )}
              </div>
              <textarea
                id="ada-paste"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste deal email here..."
                rows={6}
                className="w-full rounded-md ring-1 ring-ink-200/80 bg-canvas-soft px-4 py-3 text-[13px] text-ink-900 placeholder:text-ink-300 resize-y focus:outline-none focus:ring-2 focus:ring-brand-400/60 leading-relaxed"
                disabled={isLoading}
              />
            </div>

            {/* Mode selector — shown once a prior extraction exists */}
            {hasExisting && (
              <div className="flex items-center gap-4">
                <span className="eyebrow text-[10px] text-ink-500">Mode</span>
                {(["update", "replace", "initial"] as const).map((m) => (
                  <label
                    key={m}
                    className={cn(
                      "flex items-center gap-1.5 text-[12.5px] cursor-pointer",
                      mode === m ? "text-ink-900" : "text-ink-500",
                      isLoading && "opacity-50 pointer-events-none",
                    )}
                  >
                    <input
                      type="radio"
                      name="ada-mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="accent-brand-600"
                      disabled={isLoading}
                    />
                    <span className="capitalize">{m}</span>
                  </label>
                ))}
              </div>
            )}

            {error && (
              <div className="rounded-md ring-1 ring-rose-200 bg-rose-50/60 px-4 py-3 text-[12.5px] text-rose-800">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="brand"
              disabled={!pastedText.trim() || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {LOADING_MESSAGES[loadingPhase]}
                </span>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask Ada
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
