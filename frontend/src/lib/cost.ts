// Client-side mirror of backend/gmi.py cost_summary(): actual spend (each call
// priced at its own model's rate) vs the "all-frontier" counterfactual (every
// token priced at the case-note/frontier rate). Prices match the backend's
// representative estimates so the live meter reads the same on mock or live.

import type { ModelUsage } from "./types";

type Price = { in: number; out: number }; // $ per 1M tokens

const PRICES: Record<string, Price> = {
  "deepseek-ai/DeepSeek-V4-Flash": { in: 0.098, out: 0.196 },
  "zai-org/GLM-5.2-FP8": { in: 0.979, out: 3.08 },
  "Qwen/Qwen3.6-Max-Preview": { in: 1.3, out: 7.8 },
  "anthropic/claude-opus-4.8": { in: 5.0, out: 25.0 },
  "openai/gpt-5.5": { in: 5.0, out: 30.0 },
  "google/gemini-3.5-flash": { in: 1.5, out: 9.0 },
};

const FALLBACK_PRICE: Price = { in: 5.0, out: 25.0 };
const FRONTIER_MODEL = "anthropic/claude-opus-4.8";

function priceFor(modelId: string): Price {
  return PRICES[modelId] ?? FALLBACK_PRICE;
}

function callCostUsd(modelId: string, inTok: number, outTok: number): number {
  const p = priceFor(modelId);
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}

export interface CostSummary {
  actualUsd: number;
  allFrontierUsd: number;
}

export function costSummary(models: ModelUsage[]): CostSummary {
  let actual = 0;
  let frontier = 0;
  for (const m of models) {
    const inTok = m.input_tokens || 0;
    const outTok = m.output_tokens || 0;
    actual += callCostUsd(m.model, inTok, outTok);
    frontier += callCostUsd(FRONTIER_MODEL, inTok, outTok);
  }
  return { actualUsd: actual, allFrontierUsd: frontier };
}
