import { Injectable } from '@nestjs/common';

export interface NormalizedTrade {
  tradeId: string;
  marketId: string;
  tokenID: string;
  slug?: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  /** Leader trade time (Unix seconds or ms from API); used for latency calculation */
  leaderTradeTimestamp?: number;
  /** When we received the trade (activity fetch completed) */
  fetchedAt?: Date;
}

export interface StrategyDecision {
  shouldTrade: boolean;
  side?: 'BUY' | 'SELL';
  /** Token size (taker amount) satisfying CLOB decimal limits */
  size?: number;
  /** Rounded price used with size so maker amount has ≤2 decimals */
  price?: number;
  reason: string;
}

export interface OrderSizeFromStake {
  sizeInTokens: number;
  priceRounded: number;
  makerAmountUsd: number;
}

/** CLOB: maker (USD) max 2 decimals, taker (tokens) max 4 decimals. */
export function computeOrderSizeFromStake(
  stakeAmountUsd: number,
  price: number,
  minOrderSizeUsd = 1,
): OrderSizeFromStake {
  const priceRounded = Math.round(price * 100) / 100;
  if (priceRounded <= 0) {
    throw new Error(`Invalid price ${price}`);
  }

  const stakeCents = Math.floor(Math.min(stakeAmountUsd, 1e6) * 100);
  const minCents = Math.ceil(minOrderSizeUsd * 100);
  let sizeInTokens = 0;
  let makerAmountUsd = 0;

  const tryCents = (c: number): boolean => {
    const makerAmt = c / 100;
    const sizeR = Math.round((makerAmt / priceRounded) * 100) / 100;
    const product = sizeR * priceRounded;
    if (Math.abs(product - Math.round(product * 100) / 100) < 1e-9) {
      sizeInTokens = sizeR;
      makerAmountUsd = Math.round(product * 100) / 100;
      return true;
    }
    return false;
  };

  for (let c = Math.min(stakeCents, 1e8); c >= minCents; c--) {
    if (tryCents(c)) break;
  }
  if (sizeInTokens <= 0 || makerAmountUsd < minOrderSizeUsd) {
    for (let c = minCents; c <= Math.max(stakeCents, minCents) + 1000; c++) {
      if (tryCents(c)) break;
    }
  }
  if (sizeInTokens <= 0 || makerAmountUsd < minOrderSizeUsd) {
    throw new Error(
      `Could not find valid size for price ${priceRounded} and stake ${stakeAmountUsd} (API requires maker/taker decimal limits).`,
    );
  }

  return { sizeInTokens, priceRounded, makerAmountUsd };
}

@Injectable()
export class CopyTradingStrategy {
  // ---- CONFIG ----
  private readonly MIN_EXECUTABLE_SIZE = 1; // Polymarket minimum (tokens)
  private readonly MIN_SIGNAL_SIZE = 5; // ignore micro rebalances
  private readonly COPY_STAKE_USD = 3; // fixed USD per copy trade
  private readonly MIN_ORDER_SIZE_USD = 1;
  /** Do not copy if leader trade is at least this old when we decide */
  private readonly MAX_LEADER_TRADE_AGE_MS = 60_000;

  decide(params: {
    leaderNetChange: number;
    botCurrentPosition: number;
    trade: NormalizedTrade;
  }): StrategyDecision {
    const { leaderNetChange, botCurrentPosition, trade } = params;

    const staleReason = this.leaderTradeTooOld(trade.leaderTradeTimestamp);
    if (staleReason) {
      return { shouldTrade: false, reason: staleReason };
    }

    // Ignore noise
    if (Math.abs(leaderNetChange) < this.MIN_SIGNAL_SIZE) {
      return {
        shouldTrade: false,
        reason: 'Leader change too small (rebalance)',
      };
    }

    const side: 'BUY' | 'SELL' = leaderNetChange > 0 ? 'BUY' : 'SELL';

    // Already aligned
    if (
      (side === 'BUY' && botCurrentPosition > 0) ||
      (side === 'SELL' && botCurrentPosition < 0)
    ) {
      return {
        shouldTrade: false,
        reason: 'Bot already aligned',
      };
    }

    try {
      const { sizeInTokens, priceRounded } = computeOrderSizeFromStake(
        this.COPY_STAKE_USD,
        trade.price,
        this.MIN_ORDER_SIZE_USD,
      );
      if (sizeInTokens < this.MIN_EXECUTABLE_SIZE) {
        return {
          shouldTrade: false,
          reason: `Computed size ${sizeInTokens} below minimum ${this.MIN_EXECUTABLE_SIZE} tokens`,
        };
      }
      return {
        shouldTrade: true,
        side,
        size: sizeInTokens,
        price: priceRounded,
        reason: `Leader showed meaningful intent (copy $${this.COPY_STAKE_USD} stake → ${sizeInTokens} tokens @ ${priceRounded})`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { shouldTrade: false, reason: msg };
    }
  }

  private leaderTradeTooOld(ts: number | undefined): string | null {
    if (ts == null || Number.isNaN(ts)) return null;
    const leaderAtMs = ts < 1e12 ? ts * 1000 : ts;
    const ageMs = Date.now() - leaderAtMs;
    if (ageMs >= this.MAX_LEADER_TRADE_AGE_MS) {
      return `Leader trade too old (${Math.round(ageMs / 1000)}s ago)`;
    }
    return null;
  }
}
