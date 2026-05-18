export type AdaMode = "initial" | "update" | "replace";

export type AdaDealType =
  | "flat"
  | "vs"
  | "percentage_of_net"
  | "percentage_of_gross"
  | "door";

export type AdaFlagClass =
  | "ambiguous_net"
  | "external_reference"
  | "computed_threshold"
  | "missing_overage"
  | "unresolved_reference"
  | "bracketed_update"
  | "mode_fallback"
  | "other";

export type AdaFieldAffected =
  | "guarantee_amount"
  | "percentage"
  | "percentage_basis"
  | "expense_cap"
  | "hospitality_cap"
  | "ratchet"
  | "walkout_pot"
  | "bonuses"
  | "global";

export interface AdaRatchet {
  base_percent: number;
  cap_percent: number;
  trigger_capacity_pct: number;
}

export interface AdaWalkoutPot {
  threshold_amount: number;
  threshold_source: "stated" | "computed";
}

export interface AdaTieredNetSplit {
  low_percent: number;
  high_percent: number;
  threshold_gross: number;
}

export interface AdaBonus {
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

export interface AdaExtraction {
  deal_type: AdaDealType;
  guarantee_amount: number | null;
  percentage: number | null;
  percentage_basis: "gross" | "net" | null;
  expense_cap: number | null;
  hospitality_cap: number | null;
  ratchet: AdaRatchet | null;
  walkout_pot: AdaWalkoutPot | null;
  tiered_net_split: AdaTieredNetSplit | null;
  bonuses: AdaBonus[];
  complex_structure: boolean;
  raw_text_preserved: string;
  changes_from_previous?: ChangeFromPrevious[] | null;
}

export interface AdaFlag {
  flag_class: AdaFlagClass;
  field_affected: AdaFieldAffected;
  description: string;
  evidence_quote: string | null;
  suggested_question: string | null;
}

export interface AdaApiRequest {
  deal_id: string;
  pasted_text: string;
  mode: AdaMode;
}

export interface AdaHistoryEntry {
  id: string;
  pastedText: string;
  modeUsed: AdaMode;
  pastedAt: string; // ISO string
  extractionSnapshotJson: string | null;
}

export interface AdaApiSuccess {
  extraction: AdaExtraction;
  flags: AdaFlag[];
  mode_used: AdaMode;
  history_id: string;
  priorHistory: AdaHistoryEntry[]; // 3 prior rows, excluding current run, most recent first
}

export interface AdaApiError {
  error: string;
  history_id: string;
}

export type AdaApiResponse = AdaApiSuccess | AdaApiError;
