export type PaymentMode = "mock" | "x402";

export type ChargeKind = "pay_per_use" | "plan" | "topup" | "content";

export interface Charge {
  id: string;
  kind: ChargeKind;
  method: "GET" | "POST";
  path: string;
  price: string;
  description: string;
}

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  entitlement: string;
  chargeId: string;
}

export interface TopUp {
  id: string;
  label: string;
  creditCents: number;
  chargeId: string;
}

export interface AccountSnapshot {
  userId: string;
  balanceCents: number;
  entitlements: Record<string, string>;
  ledger: LedgerEntry[];
}

export interface LedgerEntry {
  id: string;
  userId: string;
  type: "topup" | "debit" | "plan";
  amountCents: number;
  description: string;
  createdAt: string;
  paymentKey?: string;
}

export interface AppConfig {
  port: number;
  paymentMode: PaymentMode;
  x402: {
    payTo: string;
    network: `${string}:${string}`;
    facilitatorUrl: string;
    maxTimeoutSeconds: number;
  };
}

export interface AppDependencies {
  config: AppConfig;
  store: PaymentStore;
}

export interface PaymentStore {
  getAccount(userId: string): AccountSnapshot;
  grantPlan(input: {
    userId: string;
    plan: Plan;
    paymentKey: string;
    now?: Date;
  }): AccountSnapshot;
  addCredits(input: {
    userId: string;
    topUp: TopUp;
    paymentKey: string;
    now?: Date;
  }): AccountSnapshot;
  spendCredits(input: {
    userId: string;
    amountCents: number;
    description: string;
    now?: Date;
  }): AccountSnapshot;
  hasEntitlement(userId: string, entitlement: string, now?: Date): boolean;
}
