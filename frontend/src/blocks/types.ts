// Trinity data contract — mirrors casescribe-platform SKILL.md. Block props are
// typed against these so the kit drops onto real job results unchanged.

export interface ModelUsage {
  step: string;
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export type ArtifactStatus = "pending" | "running" | "done";

export interface CaseNote {
  format: "SOAP" | "GIRP";
  fields: Record<string, string>;
}

export type ReporterCategory =
  | "child_abuse_neglect"
  | "suicidal_ideation"
  | "self_harm"
  | "domestic_violence"
  | "title_ix"
  | "none";

export interface ReporterFlag {
  triggered: boolean;
  category: ReporterCategory;
  confidence: number;
  snippet: string;
  state: string;
  timeline_hours: number;
  draft_filing?: string;
  regex_hit: boolean;
  llm_hit: boolean;
}

export interface Medicaid {
  billable: boolean;
  cpt_code: string;
  code_type: "CPT" | "HCPCS";
  description: string;
  units: number | null;
  estimated_reimbursement_usd: number;
  justification: string;
}

export interface Trinity {
  student_token: string;
  session_date: string;
  elapsed_ms: number;
  models_used: ModelUsage[];
  case_note: CaseNote;
  reporter_flag: ReporterFlag;
  medicaid: Medicaid;
}
