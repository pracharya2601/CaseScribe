// Client-side mirror of backend/gmi.py cost_summary(): actual spend (each call
// priced at its own model's rate) vs the "all-frontier" counterfactual (every
// token priced at the case-note/frontier rate). Prices match the backend's
// representative estimates so the live meter reads the same on mock or live.

import type { ModelUsage } from "./types";

type Price = { in: number; out: number }; // $ per 1M tokens

const PRICES: Record<string, Price> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-Omni": { in: 0.1, out: 0.4 },
  "Qwen/Qwen3-Next-80B-A3B-Instruct": { in: 0.3, out: 1.2 },
  "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8": { in: 0.5, out: 2.0 },
  "anthropic/claude-sonnet-4.6": { in: 3.0, out: 15.0 },
};

const FALLBACK_PRICE: Price = { in: 3.0, out: 15.0 };
const FRONTIER_MODEL = "anthropic/claude-sonnet-4.6";

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
