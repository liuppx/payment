import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RouteConfig, RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { paidCharges } from "./catalog.js";
import type { AppConfig, Charge } from "./types.js";

function routeKey(charge: Charge): string {
  return `${charge.method} ${charge.path}`;
}

export function buildX402Routes(config: AppConfig): RoutesConfig {
  const routes: Record<string, RouteConfig> = {};

  for (const charge of paidCharges) {
    routes[routeKey(charge)] = {
      accepts: {
        scheme: "exact",
        price: charge.price,
        network: config.x402.network,
        payTo: config.x402.payTo,
        maxTimeoutSeconds: config.x402.maxTimeoutSeconds,
      },
      description: charge.description,
      serviceName: "Community Payment",
      tags: [charge.kind, charge.id],
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "payment_required",
          charge,
        },
      }),
    };
  }

  return routes;
}

export function createPaymentMiddleware(config: AppConfig): RequestHandler {
  if (config.paymentMode === "x402") {
    const facilitatorClient = new HTTPFacilitatorClient({ url: config.x402.facilitatorUrl });
    const resourceServer = new x402ResourceServer(facilitatorClient).register(
      config.x402.network,
      new ExactEvmScheme(),
    );

    return paymentMiddleware(
      buildX402Routes(config),
      resourceServer,
      {
        appName: "Community Payment",
        testnet: config.x402.network !== "eip155:8453",
      },
      undefined,
      false,
    );
  }

  return createMockPaymentMiddleware();
}

function createMockPaymentMiddleware(): RequestHandler {
  const paidRouteMap = new Map(paidCharges.map((charge) => [routeKey(charge), charge]));

  return (req: Request, res: Response, next: NextFunction) => {
    const charge = paidRouteMap.get(`${req.method.toUpperCase()} ${req.path}`);
    if (!charge) {
      next();
      return;
    }

    if (req.header("x-mock-payment") === "paid") {
      next();
      return;
    }

    res.status(402).json({
      error: "payment_required",
      mode: "mock",
      hint: "Retry with X-Mock-Payment: paid for local development.",
      accepts: [
        {
          scheme: "mock",
          price: charge.price,
          network: "local",
          chargeId: charge.id,
        },
      ],
      charge,
    });
  };
}
