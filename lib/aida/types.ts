export type AidaMode = "initial" | "update" | "replace";

export type AidaDealType =
  | "flat"
  | "vs"
  | "percentage_of_net"
  | "percentage_of_gross"
  | "door";

export type AidaFlagClass =
  | "ambiguous_net"
  | "external_reference"
  | "computed_threshold"
  | "missing_overage"
  | "unresolved_reference"
  | "bracketed_update"
  | "mode_fallback"
  | "other";

export type AidaFieldAffected =
  | "guarantee_amount"
  | "percentage"
  | "percentage_basis"
  | "expense_cap"
  | "hospitality_cap"
  | "ratchet"
  | "walkout_pot"
  | "bonuses"
  | "global";

export interface AidaRatchet {
  base_percent: number;
  cap_percent: number;
  trigger_capacity_pct: number;
}

export interface AidaWalkoutPot {
  threshold_amount: number;
  threshold_source: "stated" | "computed";
}

export interface AidaTieredNetSplit {
  low_percent: number;
  high_percent: number;
  threshold_gross: number;
}

export interface AidaBonus {
  type: "sellout" | "gross_threshold" | "attendance_threshold";
  trigger: string;
  amount: number;
  stacks: boolean;
}

export interface ChangeFromPrevious {
  field_path: string;
  previous_value: unknown;
  new_value: unknown;
  evidence_quote: string;
}

export interface AidaExtraction {
  deal_type: AidaDealType;
  guarantee_amount: number | null;
  percentage: number | null;
  percentage_basis: "gross" | "net" | null;
  expense_cap: number | null;
  hospitality_cap: number | null;
  ratchet: AidaRatchet | null;
  walkout_pot: AidaWalkoutPot | null;
  tiered_net_split: AidaTieredNetSplit | null;
  bonuses: AidaBonus[];
  complex_structure: boolean;
  raw_text_preserved: string;
  changes_from_previous?: ChangeFromPrevious[] | null;
}

export interface AidaFlag {
  flag_class: AidaFlagClass;
  field_affected: AidaFieldAffected;
  description: string;
  evidence_quote: string | null;
  suggested_question: string | null;
}

export interface AidaApiRequest {
  deal_id: string;
  pasted_text: string;
  mode: AidaMode;
}

export interface AidaHistoryEntry {
  id: string;
  pastedText: string;
  modeUsed: AidaMode;
  pastedAt: string; // ISO string
  extractionSnapshotJson: string | null;
}

export interface AidaApiSuccess {
  extraction: AidaExtraction;
  flags: AidaFlag[];
  mode_used: AidaMode;
  history_id: string;
  priorHistory: AidaHistoryEntry[]; // 3 prior rows, excluding current run, most recent first
}

export interface AidaApiError {
  error: string;
  history_id: string;
}

export type AidaApiResponse = AidaApiSuccess | AidaApiError;
