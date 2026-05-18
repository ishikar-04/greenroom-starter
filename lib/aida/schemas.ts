import { SchemaType } from "@google/generative-ai";
import type { Schema } from "@google/generative-ai";

const ratchetSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    base_percent: { type: SchemaType.NUMBER },
    cap_percent: { type: SchemaType.NUMBER },
    trigger_capacity_pct: { type: SchemaType.NUMBER },
  },
  required: ["base_percent", "cap_percent", "trigger_capacity_pct"],
};

const walkoutPotSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    threshold_amount: { type: SchemaType.NUMBER },
    threshold_source: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["stated", "computed"],
    },
  },
  required: ["threshold_amount", "threshold_source"],
};

const tieredNetSplitSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    low_percent: { type: SchemaType.NUMBER },
    high_percent: { type: SchemaType.NUMBER },
    threshold_gross: { type: SchemaType.NUMBER },
  },
  required: ["low_percent", "high_percent", "threshold_gross"],
};

const bonusSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["sellout", "gross_threshold", "attendance_threshold"],
    },
    trigger: { type: SchemaType.STRING },
    amount: { type: SchemaType.NUMBER },
    stacks: { type: SchemaType.BOOLEAN },
  },
  required: ["type", "trigger", "amount", "stacks"],
};

const changeFromPreviousSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    field_path: { type: SchemaType.STRING },
    previous_value: { type: SchemaType.STRING },
    new_value: { type: SchemaType.STRING },
    evidence_quote: { type: SchemaType.STRING },
  },
  required: ["field_path", "previous_value", "new_value", "evidence_quote"],
};

const extractionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    deal_type: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["flat", "vs", "percentage_of_net", "percentage_of_gross", "door"],
    },
    guarantee_amount: { type: SchemaType.NUMBER, nullable: true },
    percentage: { type: SchemaType.NUMBER, nullable: true },
    percentage_basis: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["gross", "net"],
      nullable: true,
    },
    expense_cap: { type: SchemaType.NUMBER, nullable: true },
    hospitality_cap: { type: SchemaType.NUMBER, nullable: true },
    ratchet: { ...ratchetSchema, nullable: true },
    walkout_pot: { ...walkoutPotSchema, nullable: true },
    tiered_net_split: { ...tieredNetSplitSchema, nullable: true },
    bonuses: {
      type: SchemaType.ARRAY,
      items: bonusSchema,
    },
    complex_structure: { type: SchemaType.BOOLEAN },
    raw_text_preserved: { type: SchemaType.STRING },
    changes_from_previous: {
      type: SchemaType.ARRAY,
      items: changeFromPreviousSchema,
      nullable: true,
    },
  },
  required: [
    "deal_type",
    "guarantee_amount",
    "percentage",
    "percentage_basis",
    "expense_cap",
    "hospitality_cap",
    "ratchet",
    "walkout_pot",
    "tiered_net_split",
    "bonuses",
    "complex_structure",
    "raw_text_preserved",
  ],
};

const flagSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    flag_class: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [
        "ambiguous_net",
        "external_reference",
        "computed_threshold",
        "missing_overage",
        "unresolved_reference",
        "bracketed_update",
        "mode_fallback",
        "other",
      ],
    },
    field_affected: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [
        "guarantee_amount",
        "percentage",
        "percentage_basis",
        "expense_cap",
        "hospitality_cap",
        "ratchet",
        "walkout_pot",
        "bonuses",
        "global",
      ],
    },
    description: { type: SchemaType.STRING },
    evidence_quote: { type: SchemaType.STRING, nullable: true },
    suggested_question: { type: SchemaType.STRING, nullable: true },
  },
  required: ["flag_class", "field_affected", "description", "suggested_question"],
};

export const geminiResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    extraction: extractionSchema,
    flags: {
      type: SchemaType.ARRAY,
      items: flagSchema,
    },
  },
  required: ["extraction", "flags"],
};
