import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { AidaSection } from "./aida-section";
import type { AidaExtraction, AidaFlag } from "@/lib/aida/types";
import { getShowById } from "@/lib/queries";
import { db } from "@/db";
import { dealNotesHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
} from "@/components/ui/card";
import { StatusBadge, DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseBonuses } from "@/lib/dealMath";
import {
  formatMoney,
  formatMoneyCompact,
  formatShowDateFull,
  relativeShowDate,
} from "@/lib/format";
import type { Bonus } from "@/db/schema";

const COMP_LABELS: Record<string, string> = {
  artist_gl: "Artist guest list",
  label: "Label / management",
  press: "Press",
  venue_staff: "Venue staff",
  sponsor: "Sponsor",
  promo: "Promo / radio",
  other: "Other",
};

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const {
    show,
    artist,
    agent,
    agency,
    deal,
    settlement,
    ticketSales,
    expenses,
    comps,
  } = data;

  const adaHistory = deal
    ? await db
        .select()
        .from(dealNotesHistory)
        .where(eq(dealNotesHistory.dealId, deal.id))
        .orderBy(desc(dealNotesHistory.pastedAt))
        .limit(4)
    : [];

  const grossSoFar = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const totalTickets = ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);
  const absorbedTotal = expenses
    .filter((e) => e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCompCount = comps.reduce((s, c) => s + c.count, 0);
  const compsCountingTowardGross = comps
    .filter((c) => c.countsTowardGross)
    .reduce((s, c) => s + c.count, 0);

  const bonuses = deal ? parseBonuses(deal) : [];

  const isDisputed = settlement?.status === "disputed";

  return (
    <div className="max-w-7xl">
      {/* Poster header */}
      <div className={`px-12 pt-10 pb-14 ${isDisputed ? "bg-gradient-to-b from-rose-50/40 to-canvas" : "bg-gradient-to-b from-brand-50/30 to-canvas"}`}>
        <Link
          href="/shows"
          className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All shows
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-4">
              <StatusBadge status={show.status} />
              {deal && <DealTypeBadge type={deal.dealType} />}
              {isDisputed && (
                <PlainBadge variant="rose">Disputed</PlainBadge>
              )}
              {bonuses.length > 0 && (
                <PlainBadge variant="brand">
                  {bonuses.length} bonus{bonuses.length === 1 ? "" : "es"}
                </PlainBadge>
              )}
            </div>
            <h1
              className="font-display text-[56px] font-medium text-ink-900 leading-[1.02]"
              style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
            >
              {artist?.name ?? "—"}
            </h1>
            <div className="text-[14px] text-ink-400 mt-3 flex items-center gap-2">
              <span className="text-ink-600 font-medium">{formatShowDateFull(show.date)}</span>
              <span className="text-ink-300">·</span>
              <span>{relativeShowDate(show.date)}</span>
              <span className="text-ink-200">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                doors {show.doorsTime} · set {show.setTime}
              </span>
            </div>
          </div>
          <Link href={`/shows/${show.id}/settle`} className="mt-6 shrink-0">
            <Button variant="brand" size="lg">
              <FileSpreadsheet className="h-4 w-4" />
              {settlement ? "View settlement" : "Settle show"}
            </Button>
          </Link>
        </div>

        {/* Key numbers strip */}
        <div className="flex items-baseline gap-10 mt-8 pt-5 border-t border-ink-200/40">
          <MiniStat label="Gross" value={formatMoneyCompact(grossSoFar)} />
          <MiniStat label="Tickets" value={String(totalTickets)} />
          <MiniStat label="Expenses" value={formatMoneyCompact(totalExpenses)} />
          {settlement?.totalToArtist != null && (
            <MiniStat label="To artist" value={formatMoneyCompact(settlement.totalToArtist)} accent />
          )}
        </div>
      </div>

      <div className="px-12 pb-12">
        {show.internalNotes && (
          <div className="mb-8 mt-1 rounded-lg bg-amber-50/50 ring-1 ring-amber-200/60 p-5 flex gap-3">
            <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <div className="eyebrow text-[10px] text-amber-800 mb-1.5">
                Mariana&apos;s notes
              </div>
              <div className="text-[13px] text-ink-800 leading-relaxed">
                {show.internalNotes}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-2">
          {/* Deal terms */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Deal terms</CardTitle>
                <CardDescription>
                  What was negotiated. Mariana enters this from the email
                  thread with the agent.
                </CardDescription>
              </div>
              {deal && <DealTypeBadge type={deal.dealType} />}
            </CardHeader>
            <CardContent className="space-y-5">
              {deal ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Field
                      label="Guarantee"
                      mono
                      value={
                        deal.guaranteeAmount != null
                          ? formatMoney(deal.guaranteeAmount)
                          : "—"
                      }
                    />
                    <Field
                      label="Percentage"
                      mono
                      value={
                        deal.percentage != null
                          ? `${(deal.percentage * 100).toFixed(0)}% ${deal.percentageBasis ? `of ${deal.percentageBasis}` : ""}`
                          : "—"
                      }
                    />
                    <Field
                      label="Expense cap"
                      mono
                      value={
                        deal.expenseCap != null
                          ? formatMoney(deal.expenseCap)
                          : "—"
                      }
                    />
                    <Field
                      label="Hospitality cap"
                      mono
                      value={
                        deal.hospitalityCap != null
                          ? formatMoney(deal.hospitalityCap)
                          : "—"
                      }
                    />
                  </div>

                  {bonuses.length > 0 && (
                    <div className="rounded-lg ring-1 ring-brand-200/50 bg-brand-50/20 p-4">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <TrendingUp className="h-3.5 w-3.5 text-brand-700" />
                        <div className="eyebrow text-[10px] text-brand-800">
                          Bonuses & escalators (structured)
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {bonuses.map((b, i) => (
                          <li
                            key={i}
                            className="text-[12.5px] text-ink-800 flex items-start gap-2"
                          >
                            <BonusBadge type={b.type} />
                            <span className="leading-relaxed">{b.label}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="text-[11px] text-ink-400 mt-3 leading-snug">
                        Stored in{" "}
                        <code className="font-mono text-[10px] bg-white/80 px-1 py-0.5 rounded ring-1 ring-ink-200/40">
                          bonuses_json
                        </code>
                        . The in-app tool only reads structured bonuses — anything
                        in the prose below is invisible to it.
                      </div>
                    </div>
                  )}

                  {deal.dealNotesFreetext && (
                    <div>
                      <div className="eyebrow text-[10px] text-ink-500 mb-2">
                        Deal notes (free text — what Mariana actually trusts)
                      </div>
                      <div className="text-[13px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/50 leading-relaxed font-[450]" style={{ fontStyle: "italic" }}>
                        {deal.dealNotesFreetext}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[13px] text-ink-400">
                  No deal entered yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Artist & agent */}
          <Card>
            <CardHeader>
              <CardTitle>Artist & agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Artist" value={artist?.name ?? "—"} />
              <Field
                label="Genre"
                value={
                  <span className="capitalize">{artist?.genre ?? "—"}</span>
                }
              />
              <Field
                label="Prior shows here"
                value={String(artist?.priorShowCount ?? 0)}
                mono
              />
              <Field
                label="Agent"
                value={
                  agent
                    ? `${agent.name}${agency ? ` · ${agency.name}` : ""}`
                    : "—"
                }
              />
              {agent?.preferencesNotes && (
                <div>
                  <div className="eyebrow text-[10px] text-ink-500 mb-2">
                    Agent notes
                  </div>
                  <div className="text-[12.5px] text-ink-800 bg-amber-50/50 ring-1 ring-amber-200/50 rounded-lg p-3 leading-relaxed">
                    {agent.preferencesNotes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Box office */}
          <Card>
            <CardHeader>
              <CardTitle>Box office</CardTitle>
              <CardDescription>From integrated ticketing.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="eyebrow text-[10px] text-ink-400">Gross</div>
                  <div className="text-[28px] font-mono tabular font-semibold text-ink-900 mt-1 leading-none">
                    {formatMoneyCompact(grossSoFar)}
                  </div>
                </div>
                {totalTickets > 0 ? (
                  <div className="text-[12px] text-ink-500 pt-4 border-t border-ink-100/80 leading-relaxed">
                    <span className="font-mono tabular font-medium text-ink-700">
                      {totalTickets}
                    </span>{" "}
                    tickets ·{" "}
                    <span className="font-mono tabular">
                      {formatMoney(totalFees)}
                    </span>{" "}
                    in fees
                    <div className="mt-1.5 text-ink-400">
                      Net{" "}
                      <span className="font-mono tabular text-ink-700">
                        {formatMoneyCompact(grossSoFar - totalFees)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-ink-400 pt-3 border-t border-ink-100/80">
                    No sales yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comps */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Comps</CardTitle>
                <CardDescription>
                  {totalCompCount} comp tickets across {comps.length}{" "}
                  categor{comps.length === 1 ? "y" : "ies"}.
                  {compsCountingTowardGross > 0 && (
                    <>
                      {" "}
                      <span className="text-amber-700 font-medium">
                        {compsCountingTowardGross} count toward gross.
                      </span>
                    </>
                  )}
                </CardDescription>
              </div>
              <PlainBadge variant="default">
                {totalCompCount} total
              </PlainBadge>
            </CardHeader>
            <CardContent>
              {comps.length === 0 ? (
                <div className="text-[13px] text-ink-400">
                  No comps recorded for this show.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left border-b border-ink-100/80">
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Category</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Count</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Face value</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Counts toward gross?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100/60">
                    {comps.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5">
                          {COMP_LABELS[c.category] ?? c.category}
                          {c.notes && (
                            <span className="text-ink-400 ml-1">· {c.notes}</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular">{c.count}</td>
                        <td className="py-2.5 text-right font-mono tabular text-ink-500">
                          {formatMoney(c.faceValue * c.count)}
                        </td>
                        <td className="py-2.5 text-right">
                          {c.countsTowardGross ? (
                            <span className="text-amber-700 font-medium">Yes</span>
                          ) : (
                            <span className="text-ink-400">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card className="md:col-span-3">
            <CardHeader>
              <div>
                <CardTitle>Expenses</CardTitle>
                <CardDescription>
                  Entered during the week, often incompletely.
                </CardDescription>
              </div>
              {absorbedTotal > 0 && (
                <PlainBadge variant="amber">
                  {formatMoney(absorbedTotal)} absorbed
                </PlainBadge>
              )}
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <div className="text-[13px] text-ink-400">
                  No expenses entered yet.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left border-b border-ink-100/80">
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Category</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Description</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100/60">
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2.5 capitalize">
                          {e.category}
                          {e.absorbedByVenue && (
                            <PlainBadge variant="amber" className="ml-2">absorbed</PlainBadge>
                          )}
                        </td>
                        <td className="py-2.5 text-ink-500">{e.description ?? "—"}</td>
                        <td className="py-2.5 text-right font-mono tabular">{formatMoney(e.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="py-3" colSpan={2}>Total (passed through)</td>
                      <td className="py-3 text-right font-mono tabular">{formatMoney(totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Aida — deal disambiguation assistant */}
        {deal && (
          <AidaSection
            dealId={deal.id}
            dealNotesFreetext={deal.dealNotesFreetext ?? null}
            existingExtraction={
              deal.extractionJson
                ? (JSON.parse(deal.extractionJson) as AidaExtraction)
                : null
            }
            existingFlags={
              deal.ambiguityFlagsJson
                ? (JSON.parse(deal.ambiguityFlagsJson) as AidaFlag[])
                : null
            }
            existingHistory={adaHistory.map((h) => ({
              id: h.id,
              pastedText: h.pastedText,
              modeUsed: h.modeUsed,
              pastedAt: (h.pastedAt as Date).toISOString(),
              extractionSnapshotJson: h.extractionSnapshotJson,
            }))}
          />
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow text-[9px] text-ink-400">{label}</div>
      <div className={`text-[18px] font-mono tabular font-semibold mt-0.5 leading-none ${accent ? "text-brand-700" : "text-ink-900"}`}>
        {value}
      </div>
    </div>
  );
}

function BonusBadge({ type }: { type: Bonus["type"] }) {
  const labels: Record<Bonus["type"], string> = {
    gross_threshold: "gross",
    sellout: "sellout",
    attendance_threshold: "attend",
    tier_ratchet: "ratchet",
  };
  return (
    <span className="inline-flex shrink-0 items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-brand-200/50 text-brand-800">
      {labels[type]}
    </span>
  );
}
