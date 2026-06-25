import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InMemoryPaymentStore } from "../src/store.js";
import type { AppConfig } from "../src/types.js";

const mockConfig: AppConfig = {
  port: 0,
  paymentMode: "mock",
  x402: {
    payTo: "0x0000000000000000000000000000000000000000",
    network: "eip155:84532",
    facilitatorUrl: "https://facilitator.x402.org",
    maxTimeoutSeconds: 60,
  },
};

describe("community payment app", () => {
  it("exposes a catalog for paid API, agent, MCP, content, plan, and top-up routes", async () => {
    const app = createApp({ config: mockConfig });

    const res = await request(app).get("/v1/catalog").expect(200);

    expect(res.body.charges.map((charge: { id: string }) => charge.id)).toEqual(
      expect.arrayContaining([
        "api.weather.once",
        "agent.summarize.once",
        "mcp.quote.once",
        "content.research-note.once",
        "plan.pro.monthly",
        "topup.starter",
      ]),
    );
  });

  it("returns 402 for protected routes without payment", async () => {
    const app = createApp({ config: mockConfig });

    const res = await request(app).get("/v1/api/weather").expect(402);

    expect(res.body.error).toBe("payment_required");
    expect(res.body.accepts[0]).toMatchObject({
      scheme: "mock",
      price: "$0.01",
      chargeId: "api.weather.once",
    });
  });

  it("allows a paid API call in mock mode", async () => {
    const app = createApp({ config: mockConfig });

    const res = await request(app)
      .get("/v1/api/weather")
      .set("X-Mock-Payment", "paid")
      .expect(200);

    expect(res.body.chargeId).toBe("api.weather.once");
    expect(res.body.data.condition).toBe("clear");
  });

  it("grants a plan entitlement after a paid plan purchase", async () => {
    const store = new InMemoryPaymentStore();
    const app = createApp({ config: mockConfig, store });

    await request(app).get("/v1/plans/pro/report").set("X-Community-User", "alice").expect(403);

    await request(app)
      .post("/v1/plans/pro/purchase")
      .set("X-Community-User", "alice")
      .set("X-Mock-Payment", "paid")
      .set("X-Mock-Payment-Id", "plan-payment-1")
      .expect(200);

    const res = await request(app)
      .get("/v1/plans/pro/report")
      .set("X-Community-User", "alice")
      .expect(200);

    expect(res.body.entitlement).toBe("plan:pro");
  });

  it("applies top-up payments idempotently and spends internal credits", async () => {
    const store = new InMemoryPaymentStore();
    const app = createApp({ config: mockConfig, store });

    await request(app)
      .post("/v1/topups/starter/purchase")
      .set("X-Community-User", "bob")
      .set("X-Mock-Payment", "paid")
      .set("X-Mock-Payment-Id", "topup-payment-1")
      .expect(200);

    await request(app)
      .post("/v1/topups/starter/purchase")
      .set("X-Community-User", "bob")
      .set("X-Mock-Payment", "paid")
      .set("X-Mock-Payment-Id", "topup-payment-1")
      .expect(200);

    const spend = await request(app)
      .post("/v1/credits/agent-call")
      .set("X-Community-User", "bob")
      .send({ units: 2 })
      .expect(200);

    expect(spend.body.chargedCents).toBe(6);
    expect(spend.body.account.balanceCents).toBe(494);
    expect(spend.body.account.ledger).toHaveLength(2);
  });

  it("returns 402 when internal credits are insufficient", async () => {
    const app = createApp({ config: mockConfig });

    const res = await request(app)
      .post("/v1/credits/agent-call")
      .set("X-Community-User", "charlie")
      .send({ units: 1 })
      .expect(402);

    expect(res.body).toMatchObject({
      error: "insufficient_credits",
      topUpPath: "/v1/topups/starter/purchase",
    });
  });
});
