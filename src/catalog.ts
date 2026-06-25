import type { Charge, Plan, TopUp } from "./types.js";

export const charges = {
  apiWeather: {
    id: "api.weather.once",
    kind: "pay_per_use",
    method: "GET",
    path: "/v1/api/weather",
    price: "$0.01",
    description: "One API call to the weather sample endpoint",
  },
  agentSummarize: {
    id: "agent.summarize.once",
    kind: "pay_per_use",
    method: "POST",
    path: "/v1/agents/summarize",
    price: "$0.03",
    description: "One agent summarization task",
  },
  mcpQuote: {
    id: "mcp.quote.once",
    kind: "pay_per_use",
    method: "POST",
    path: "/v1/mcp/tools/quote.call",
    price: "$0.02",
    description: "One MCP-style quote tool call",
  },
  contentResearch: {
    id: "content.research-note.once",
    kind: "content",
    method: "GET",
    path: "/v1/content/research-note",
    price: "$0.05",
    description: "Access to one premium research note",
  },
  planPro: {
    id: "plan.pro.monthly",
    kind: "plan",
    method: "POST",
    path: "/v1/plans/pro/purchase",
    price: "$9.00",
    description: "Community Pro plan for 30 days",
  },
  topUpStarter: {
    id: "topup.starter",
    kind: "topup",
    method: "POST",
    path: "/v1/topups/starter/purchase",
    price: "$5.00",
    description: "Add 500 internal credits",
  },
} as const satisfies Record<string, Charge>;

export const plans = {
  pro: {
    id: "pro",
    name: "Community Pro",
    durationDays: 30,
    entitlement: "plan:pro",
    chargeId: charges.planPro.id,
  },
} as const satisfies Record<string, Plan>;

export const topUps = {
  starter: {
    id: "starter",
    label: "Starter credits",
    creditCents: 500,
    chargeId: charges.topUpStarter.id,
  },
} as const satisfies Record<string, TopUp>;

export const chargeList = Object.values(charges);
export const paidCharges: Charge[] = chargeList;
