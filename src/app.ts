import cors from "cors";
import express from "express";
import { z } from "zod";
import { chargeList, charges, plans, topUps } from "./catalog.js";
import { loadConfig } from "./config.js";
import { asyncHandler, paymentKeyFromRequest, userIdFromRequest } from "./http.js";
import { createPaymentMiddleware } from "./payments.js";
import { InMemoryPaymentStore } from "./store.js";
import type { AppDependencies } from "./types.js";

const summarizeSchema = z.object({
  text: z.string().min(1).max(20_000),
});

const mcpToolCallSchema = z.object({
  arguments: z
    .object({
      symbol: z.string().min(1).max(16).default("X402"),
    })
    .default({ symbol: "X402" }),
});

const spendCreditsSchema = z.object({
  units: z.coerce.number().int().positive().max(1_000).default(1),
});

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const config = overrides.config ?? loadConfig();
  const store = overrides.store ?? new InMemoryPaymentStore();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", paymentMode: config.paymentMode });
  });

  app.get("/v1/catalog", (_req, res) => {
    res.json({
      charges: chargeList,
      plans: Object.values(plans),
      topUps: Object.values(topUps),
    });
  });

  app.use(createPaymentMiddleware(config));

  app.get("/v1/api/weather", (_req, res) => {
    res.json({
      chargeId: charges.apiWeather.id,
      data: {
        location: "community-lab",
        condition: "clear",
        temperatureCelsius: 22,
      },
    });
  });

  app.post(
    "/v1/agents/summarize",
    asyncHandler((req, res) => {
      const parsed = summarizeSchema.parse(req.body);
      const sentence = parsed.text.replace(/\s+/g, " ").trim().slice(0, 180);

      res.json({
        chargeId: charges.agentSummarize.id,
        result: {
          summary: sentence.length < parsed.text.length ? `${sentence}...` : sentence,
          inputCharacters: parsed.text.length,
        },
      });
    }),
  );

  app.post(
    "/v1/mcp/tools/quote.call",
    asyncHandler((req, res) => {
      const parsed = mcpToolCallSchema.parse(req.body);

      res.json({
        jsonrpc: "2.0",
        result: {
          chargeId: charges.mcpQuote.id,
          content: [
            {
              type: "text",
              text: `${parsed.arguments.symbol.toUpperCase()} is ready for paid tool execution.`,
            },
          ],
        },
      });
    }),
  );

  app.get("/v1/content/research-note", (_req, res) => {
    res.json({
      chargeId: charges.contentResearch.id,
      title: "x402 Community Payment Notes",
      body: "Paid content is unlocked after a one-time x402-compatible payment.",
    });
  });

  app.post("/v1/plans/pro/purchase", (req, res) => {
    const account = store.grantPlan({
      userId: userIdFromRequest(req),
      plan: plans.pro,
      paymentKey: paymentKeyFromRequest(req),
    });

    res.json({ chargeId: charges.planPro.id, account });
  });

  app.get("/v1/plans/pro/report", (req, res) => {
    const userId = userIdFromRequest(req);
    if (!store.hasEntitlement(userId, plans.pro.entitlement)) {
      res.status(403).json({
        error: "missing_entitlement",
        entitlement: plans.pro.entitlement,
        purchasePath: charges.planPro.path,
      });
      return;
    }

    res.json({
      entitlement: plans.pro.entitlement,
      report: {
        apiCalls: 128,
        agentTasks: 42,
        mcpToolCalls: 19,
      },
    });
  });

  app.post("/v1/topups/starter/purchase", (req, res) => {
    const account = store.addCredits({
      userId: userIdFromRequest(req),
      topUp: topUps.starter,
      paymentKey: paymentKeyFromRequest(req),
    });

    res.json({ chargeId: charges.topUpStarter.id, account });
  });

  app.post(
    "/v1/credits/agent-call",
    asyncHandler((req, res) => {
      const parsed = spendCreditsSchema.parse(req.body);
      const unitPriceCents = 3;
      const account = store.spendCredits({
        userId: userIdFromRequest(req),
        amountCents: parsed.units * unitPriceCents,
        description: `${parsed.units} internal agent credit unit(s)`,
      });

      res.json({
        chargedCents: parsed.units * unitPriceCents,
        account,
      });
    }),
  );

  app.get("/v1/me", (req, res) => {
    res.json(store.getAccount(userIdFromRequest(req)));
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "invalid_request", issues: err.issues });
      return;
    }

    if (err instanceof Error && err.name === "InsufficientCreditsError") {
      res.status(402).json({ error: "insufficient_credits", topUpPath: charges.topUpStarter.path });
      return;
    }

    res.status(500).json({
      error: "internal_error",
      message: err instanceof Error ? err.message : "unknown error",
    });
  });

  return app;
}
