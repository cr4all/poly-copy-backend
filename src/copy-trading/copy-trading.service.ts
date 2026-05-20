import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Side } from '@polymarket/clob-client-v2';
import { Model } from 'mongoose';
import { PolymarketClient } from 'src/clients/polymarket.client';
import { CopyTradingStrategy, NormalizedTrade } from './copy-trading.strategy';
import { BotPosition } from './entities/bot-position.schema';
import { LeaderTrade, TradeStatus } from './entities/leader-trade.schema';

@Injectable()
export class CopyTradingService {
  private readonly logger = new Logger(CopyTradingService.name);

  constructor(
    private readonly polyClient: PolymarketClient,
    private readonly strategy: CopyTradingStrategy,

    @InjectModel(BotPosition.name)
    private readonly botPositionModel: Model<BotPosition>,

    @InjectModel(LeaderTrade.name)
    private readonly tradeModel: Model<LeaderTrade>,
  ) {}

  // ------------------------------------------------------------------
  // Handle single trade
  // ------------------------------------------------------------------
  async handleTrade(sourceWallet: string, rawTrade: any): Promise<void> {
    const tradeId = rawTrade?.id;

    try {
      // 1️⃣ Idempotency
      if (await this.tradeExists(tradeId)) {
        return;
      }

      // 2️⃣ Normalize
      const trade = this.normalizeTrade(rawTrade);

      // 3️⃣ Leader delta
      const leaderNetChange =
        trade.side === 'BUY' ? trade.size : -trade.size;

      // 4️⃣ Bot position
      const botCurrentPosition = await this.getBotPosition(
        trade.marketId,
        trade.tokenID,
      );

      // 5️⃣ Strategy
      const decision = this.strategy.decide({
        leaderNetChange,
        botCurrentPosition,
        trade,
      });

      // 6️⃣ Persist BEFORE execution
      await this.saveTrade(trade, sourceWallet, {
        status: decision.shouldTrade
          ? TradeStatus.PENDING
          : TradeStatus.SKIPPED,
        reason: decision.reason,
      });

      if (!decision.shouldTrade) {
        this.logger.debug(
          `Skip trade ${trade.tradeId}: ${decision.reason}`,
        );
        return;
      }

      // 7️⃣ Execute (measure latency: leader trade time → execution done)
      const executedAt = new Date();
      await this.executeTrade(
        trade,
        decision.side!,
        decision.size!,
      );

      // 8️⃣ Update bot position
      await this.updateBotPosition(
        trade,
        decision.side!,
        decision.size!,
      );

      // 9️⃣ Mark copied and persist latency breakdown
      const leaderTradeAt = this.toLeaderTradeAt(trade.leaderTradeTimestamp);
      const fetchedAt = trade.fetchedAt;
      const latencyMs = leaderTradeAt
        ? Math.round(executedAt.getTime() - leaderTradeAt.getTime())
        : null;
      const fetchLatencyMs =
        leaderTradeAt && fetchedAt
          ? Math.round(fetchedAt.getTime() - leaderTradeAt.getTime())
          : null;
      const executionLatencyMs =
        fetchedAt ? Math.round(executedAt.getTime() - fetchedAt.getTime()) : null;
      await this.updateTradeStatus(trade.tradeId, TradeStatus.COPIED, undefined, {
        copiedAt: executedAt,
        latencyMs: latencyMs ?? undefined,
        fetchLatencyMs: fetchLatencyMs ?? undefined,
        executionLatencyMs: executionLatencyMs ?? undefined,
        executedSize: decision.size!.toString(),
      });
      if (latencyMs != null) {
        this.logger.log(
          `Copy trade ${trade.tradeId} latency: ${latencyMs} ms (fetch: ${fetchLatencyMs ?? '—'} ms, execution: ${executionLatencyMs ?? '—'} ms)`,
        );
      }

    } catch (err) {
      this.logger.error(
        `Failed handling trade ${tradeId} from ${sourceWallet}`,
        err instanceof Error ? err.stack : undefined,
      );

      if (tradeId) {
        await this.updateTradeStatus(tradeId, TradeStatus.FAILED, err?.message);
      }
    }
  }

  // ------------------------------------------------------------------
  // DB helpers
  // ------------------------------------------------------------------

  private async tradeExists(tradeId: string): Promise<boolean> {
    if (!tradeId) return true;
    const doc = await this.tradeModel.exists({ tradeId }).exec();
    return !!doc;
  }

  private toLeaderTradeAt(ts: number | undefined): Date | null {
    if (ts == null || Number.isNaN(ts)) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms);
  }

  private async saveTrade(
    trade: NormalizedTrade,
    sourceWallet: string,
    meta?: {
      status?: TradeStatus;
      reason?: string;
    },
  ): Promise<void> {
    try {
      const leaderTradeAt = this.toLeaderTradeAt(trade.leaderTradeTimestamp);
      await this.tradeModel.create({
        tradeId: trade.tradeId,
        wallet: sourceWallet,
        marketId: trade.marketId,
        tokenId: trade.tokenID,
        slug: trade.slug ?? undefined,
        side: trade.side,
        size: trade.size.toString(),
        price: trade.price.toString(),
        status: meta?.status ?? TradeStatus.PENDING,
        reason: meta?.reason,
        leaderTradeAt: leaderTradeAt ?? undefined,
        fetchedAt: trade.fetchedAt ?? undefined,
      });
    } catch (err: unknown) {
      // MongoDB duplicate key (unique index on tradeId)
      if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
        return;
      }
      throw err;
    }
  }

  private async updateTradeStatus(
    tradeId: string,
    status: TradeStatus,
    reason?: string,
    extra?: {
      copiedAt?: Date;
      latencyMs?: number;
      fetchLatencyMs?: number;
      executionLatencyMs?: number;
      executedSize?: string;
    },
  ): Promise<void> {
    await this.tradeModel.updateOne({ tradeId }, { $set: { status, reason, ...extra } }).exec();
  }

  private async getBotPosition(marketId: string, tokenId: string): Promise<number> {
    const botPos = await this.botPositionModel.findOne({ marketId, tokenId }).lean().exec();
    return botPos ? Number(botPos.netSize) : 0;
  }

  private async updateBotPosition(
    trade: NormalizedTrade,
    side: 'BUY' | 'SELL',
    size: number,
  ): Promise<void> {
    let botPos = await this.botPositionModel.findOne({
      marketId: trade.marketId,
      tokenId: trade.tokenID,
    }).exec();

    if (!botPos) {
      botPos = await this.botPositionModel.create({
        marketId: trade.marketId,
        tokenId: trade.tokenID,
        netSize: '0',
      });
    }

    const delta = side === 'BUY' ? size : -size;
    botPos.netSize = (Number(botPos.netSize) + delta).toString();
    await botPos.save();
  }

  // ------------------------------------------------------------------
  // Normalization
  // ------------------------------------------------------------------
  private normalizeTrade(raw: any): NormalizedTrade {
    return {
      tradeId: raw.id,
      marketId: raw.market_id ?? raw.marketId,
      tokenID: raw.tokenID ?? raw.market_token_id,
      slug: typeof raw.slug === 'string' ? raw.slug : undefined,
      side: raw.side,
      size: Number(raw.size),
      price: Number(raw.price),
      leaderTradeTimestamp: raw.leaderTradeTimestamp != null ? Number(raw.leaderTradeTimestamp) : undefined,
      fetchedAt: raw.fetchedAt != null ? new Date(Number(raw.fetchedAt)) : undefined,
    };
  }

  // ------------------------------------------------------------------
  // Execution
  // ------------------------------------------------------------------
  private async executeTrade(
    trade: NormalizedTrade,
    side: 'BUY' | 'SELL',
    size: number,
  ) {
    const client = await this.polyClient.getClient();

    if (!trade.tokenID) {
      throw new Error('Missing tokenID');
    }

    const [tickSize, negRisk] = await Promise.all([
      client.getTickSize(trade.tokenID),
      client.getNegRisk(trade.tokenID),
    ]);

    this.logger.log(
      `Executing ${side} ${size} @ ${trade.price} (${trade.tokenID})`,
    );

    await client.createAndPostOrder(
      {
        tokenID: trade.tokenID,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        price: trade.price,
        size,
      },
      { tickSize, negRisk },
    );
  }
}
