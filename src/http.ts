import { createHash, randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";

export function userIdFromRequest(req: Request): string {
  const value = req.header("x-community-user")?.trim();
  return value || "anonymous";
}

export function paymentKeyFromRequest(req: Request): string {
  const explicit =
    req.header("x-payment-id") ?? req.header("x-mock-payment-id") ?? req.header("idempotency-key");

  if (explicit?.trim()) {
    return explicit.trim();
  }

  const x402Payment = req.header("x-payment");
  if (x402Payment?.trim()) {
    return createHash("sha256").update(x402Payment.trim()).digest("hex");
  }

  return `generated:${randomUUID()}`;
}

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
