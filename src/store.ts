import { randomUUID } from "node:crypto";
import type { AccountSnapshot, LedgerEntry, PaymentStore, Plan, TopUp } from "./types.js";

interface MutableAccount {
  userId: string;
  balanceCents: number;
  entitlements: Map<string, Date>;
  ledger: LedgerEntry[];
  appliedPayments: Set<string>;
}

export class InMemoryPaymentStore implements PaymentStore {
  private readonly accounts = new Map<string, MutableAccount>();

  getAccount(userId: string): AccountSnapshot {
    return this.snapshot(this.accountFor(userId));
  }

  grantPlan(input: {
    userId: string;
    plan: Plan;
    paymentKey: string;
    now?: Date;
  }): AccountSnapshot {
    const now = input.now ?? new Date();
    const account = this.accountFor(input.userId);
    const idempotencyKey = `plan:${input.plan.id}:${input.paymentKey}`;

    if (!account.appliedPayments.has(idempotencyKey)) {
      const currentExpiry = account.entitlements.get(input.plan.entitlement);
      const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
      const expiresAt = new Date(startsAt.getTime() + input.plan.durationDays * 24 * 60 * 60 * 1000);

      account.entitlements.set(input.plan.entitlement, expiresAt);
      account.appliedPayments.add(idempotencyKey);
      account.ledger.push(
        this.entry({
          userId: input.userId,
          type: "plan",
          amountCents: 0,
          description: `${input.plan.name} active until ${expiresAt.toISOString()}`,
          paymentKey: input.paymentKey,
          now,
        }),
      );
    }

    return this.snapshot(account);
  }

  addCredits(input: {
    userId: string;
    topUp: TopUp;
    paymentKey: string;
    now?: Date;
  }): AccountSnapshot {
    const now = input.now ?? new Date();
    const account = this.accountFor(input.userId);
    const idempotencyKey = `topup:${input.topUp.id}:${input.paymentKey}`;

    if (!account.appliedPayments.has(idempotencyKey)) {
      account.balanceCents += input.topUp.creditCents;
      account.appliedPayments.add(idempotencyKey);
      account.ledger.push(
        this.entry({
          userId: input.userId,
          type: "topup",
          amountCents: input.topUp.creditCents,
          description: input.topUp.label,
          paymentKey: input.paymentKey,
          now,
        }),
      );
    }

    return this.snapshot(account);
  }

  spendCredits(input: {
    userId: string;
    amountCents: number;
    description: string;
    now?: Date;
  }): AccountSnapshot {
    if (input.amountCents <= 0) {
      throw new Error("amountCents must be positive");
    }

    const account = this.accountFor(input.userId);
    if (account.balanceCents < input.amountCents) {
      const err = new Error("insufficient credits");
      err.name = "InsufficientCreditsError";
      throw err;
    }

    account.balanceCents -= input.amountCents;
    account.ledger.push(
      this.entry({
        userId: input.userId,
        type: "debit",
        amountCents: -input.amountCents,
        description: input.description,
        now: input.now ?? new Date(),
      }),
    );

    return this.snapshot(account);
  }

  hasEntitlement(userId: string, entitlement: string, now = new Date()): boolean {
    const account = this.accountFor(userId);
    const expiresAt = account.entitlements.get(entitlement);
    return Boolean(expiresAt && expiresAt > now);
  }

  private accountFor(userId: string): MutableAccount {
    const existing = this.accounts.get(userId);
    if (existing) {
      return existing;
    }

    const account: MutableAccount = {
      userId,
      balanceCents: 0,
      entitlements: new Map(),
      ledger: [],
      appliedPayments: new Set(),
    };
    this.accounts.set(userId, account);
    return account;
  }

  private snapshot(account: MutableAccount): AccountSnapshot {
    return {
      userId: account.userId,
      balanceCents: account.balanceCents,
      entitlements: Object.fromEntries(
        [...account.entitlements.entries()].map(([key, value]) => [key, value.toISOString()]),
      ),
      ledger: [...account.ledger],
    };
  }

  private entry(input: Omit<LedgerEntry, "id" | "createdAt"> & { now: Date }): LedgerEntry {
    return {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      amountCents: input.amountCents,
      description: input.description,
      createdAt: input.now.toISOString(),
      paymentKey: input.paymentKey,
    };
  }
}
