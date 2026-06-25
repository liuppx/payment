import "dotenv/config";
import { z } from "zod";
import type { AppConfig } from "./types.js";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PAYMENTS_MODE: z.enum(["mock", "x402"]).default("mock"),
  X402_PAY_TO: z.string().default("0xYourWalletAddress"),
  X402_NETWORK: z.string().regex(/^[a-z0-9]+:[a-zA-Z0-9-]+$/).default("eip155:84532"),
  X402_FACILITATOR_URL: z.string().url().default("https://facilitator.x402.org"),
  X402_MAX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
});

export function loadConfig(env = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    port: parsed.PORT,
    paymentMode: parsed.PAYMENTS_MODE,
    x402: {
      payTo: parsed.X402_PAY_TO,
      network: parsed.X402_NETWORK as `${string}:${string}`,
      facilitatorUrl: parsed.X402_FACILITATOR_URL,
      maxTimeoutSeconds: parsed.X402_MAX_TIMEOUT_SECONDS,
    },
  };
}
