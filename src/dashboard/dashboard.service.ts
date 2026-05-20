import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { subDays } from 'date-fns';
import { LeaderTrade, TradeStatus } from '../copy-trading/entities/leader-trade.schema';
import { BotPosition } from '../copy-trading/entities/bot-position.schema';
import { FollowedWallet } from '../followed-wallets/entity/followed-wallet.schema';
import { startOfWeek, subWeeks, format } from 'date-fns';

export interface DashboardStats {
  walletsCount: number;
  activeWalletsCount: number;
  positionsCount: number;
  tradesCopied: number;
  tradesSkipped: number;
  tradesFailed: number;
  tradesPending: number;
  totalTrades: number;
  copyRatePercent: number;
  failRatePercent: number;
  lastCopyLatencyMs?: number | null;
  avgCopyLatencyMs?: number | null;
  lastFetchLatencyMs?: number | null;
  lastExecutionLatencyMs?: number | null;
  avgFetchLatencyMs?: number | null;
  avgExecutionLatencyMs?: number | null;
  tradesCopiedLast7Days: number;
}

export interface RecentTradeDto {
  id: string;
  tradeId: string;
  walletLabel: string | null;
  wallet: string;
  marketId: string;
  tokenId: string;
  slug?: string | null;
  side: string;
  size: string;
  executedSize?: string | null;
  price: string;
  status: TradeStatus;
  reason?: string | null;
  createdAt: string;
  latencyMs?: number | null;
  fetchLatencyMs?: number | null;
  executionLatencyMs?: number | null;
}

export interface WeeklyReportDto {
  weekStart: string;
  weekEnd: string;
  tradesCopied: number;
  tradesSkipped: number;
  tradesFailed: number;
  totalTrades: number;
  copyRatePercent: number;
  byWallet: { wallet: string; label?: string; copied: number; skipped: number; failed: number }[];
}

export interface LeaderComparisonDto {
  wallet: string;
  label?: string;
  copied: number;
  skipped: number;
  failed: number;
  totalSignals: number;
  copyRatePercent: number;
  failRatePercent: number;
}

export interface ComparativeAnalysisDto {
  bot: { totalCopied: number; totalSkipped: number; totalFailed: number; copyRatePercent: number };
  leaders: LeaderComparisonDto[];
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(LeaderTrade.name)
    private readonly tradeModel: Model<LeaderTrade>,
    @InjectModel(BotPosition.name)
    private readonly positionModel: Model<BotPosition>,
    @InjectModel(FollowedWallet.name)
    private readonly walletModel: Model<FollowedWallet>,
  ) {}

  async getStats(): Promise<DashboardStats> {
    const since7DaysAgo = subDays(new Date(), 7);
    const [
      walletsCount,
      activeWalletsCount,
      positionsCount,
      copied,
      copiedLast7Days,
      skipped,
      failed,
      pending,
      latencyStats,
    ] = await Promise.all([
      this.walletModel.countDocuments().exec(),
      this.walletModel.countDocuments({ isActive: true }).exec(),
      this.positionModel.countDocuments().exec(),
      this.tradeModel.countDocuments({ status: TradeStatus.COPIED }).exec(),
      this.tradeModel.countDocuments({
        status: TradeStatus.COPIED,
        createdAt: { $gte: since7DaysAgo },
      }).exec(),
      this.tradeModel.countDocuments({ status: TradeStatus.SKIPPED }).exec(),
      this.tradeModel.countDocuments({ status: TradeStatus.FAILED }).exec(),
      this.tradeModel.countDocuments({ status: TradeStatus.PENDING }).exec(),
      this.getCopyLatencyStats(),
    ]);

    const totalTrades = copied + skipped + failed + pending;
    const copyRatePercent = totalTrades > 0 ? (copied / totalTrades) * 100 : 0;
    const failRatePercent = totalTrades > 0 ? (failed / totalTrades) * 100 : 0;

    return {
      walletsCount,
      activeWalletsCount,
      positionsCount,
      tradesCopied: copied,
      tradesCopiedLast7Days: copiedLast7Days,
      tradesSkipped: skipped,
      tradesFailed: failed,
      tradesPending: pending,
      totalTrades,
      copyRatePercent: Math.round(copyRatePercent * 100) / 100,
      failRatePercent: Math.round(failRatePercent * 100) / 100,
      lastCopyLatencyMs: latencyStats?.lastCopyLatencyMs ?? null,
      avgCopyLatencyMs: latencyStats?.avgCopyLatencyMs ?? null,
      lastFetchLatencyMs: latencyStats?.lastFetchLatencyMs ?? null,
      lastExecutionLatencyMs: latencyStats?.lastExecutionLatencyMs ?? null,
      avgFetchLatencyMs: latencyStats?.avgFetchLatencyMs ?? null,
      avgExecutionLatencyMs: latencyStats?.avgExecutionLatencyMs ?? null,
    };
  }

  /** Avg exec uses only recent COPIED trades so the card matches the recent trades table. */
  private static readonly AVG_EXEC_RECENT_LIMIT = 50;

  private async getCopyLatencyStats(): Promise<{
    lastCopyLatencyMs: number | null;
    avgCopyLatencyMs: number | null;
    lastFetchLatencyMs: number | null;
    lastExecutionLatencyMs: number | null;
    avgFetchLatencyMs: number | null;
    avgExecutionLatencyMs: number | null;
  }> {
    const [lastTrade, allWithLatency, recentForAvgExec] = await Promise.all([
      this.tradeModel
        .findOne({ status: TradeStatus.COPIED })
        .select('latencyMs fetchLatencyMs executionLatencyMs')
        .sort({ copiedAt: -1 })
        .lean()
        .exec(),
      this.tradeModel
        .find({ status: TradeStatus.COPIED })
        .select('latencyMs fetchLatencyMs executionLatencyMs')
        .lean()
        .exec(),
      this.tradeModel
        .find({ status: TradeStatus.COPIED })
        .select('executionLatencyMs')
        .sort({ copiedAt: -1 })
        .limit(DashboardService.AVG_EXEC_RECENT_LIMIT)
        .lean()
        .exec(),
    ]);
    type Row = { latencyMs?: number | null; fetchLatencyMs?: number | null; executionLatencyMs?: number | null };
    const rows = (allWithLatency ?? []) as Row[];
    const withLatency = rows.filter((t) => t.latencyMs != null);
    const withFetch = rows.filter((t) => t.fetchLatencyMs != null);
    const withExecution = rows.filter((t) => t.executionLatencyMs != null);
    const recentWithExec = (recentForAvgExec ?? []).filter(
      (t) => t.executionLatencyMs != null,
    ) as { executionLatencyMs: number }[];
    const last = lastTrade as Row | null;
    if (withLatency.length === 0) {
      return {
        lastCopyLatencyMs: last?.latencyMs ?? null,
        avgCopyLatencyMs: null,
        lastFetchLatencyMs: last?.fetchLatencyMs ?? null,
        lastExecutionLatencyMs: last?.executionLatencyMs ?? null,
        avgFetchLatencyMs: null,
        avgExecutionLatencyMs:
          recentWithExec.length > 0
            ? Math.round(
                recentWithExec.reduce((s, t) => s + (t.executionLatencyMs ?? 0), 0) /
                  recentWithExec.length,
              )
            : null,
      };
    }
    return {
      lastCopyLatencyMs: last?.latencyMs ?? null,
      avgCopyLatencyMs: Math.round(
        withLatency.reduce((s, t) => s + (t.latencyMs ?? 0), 0) / withLatency.length,
      ),
      lastFetchLatencyMs: last?.fetchLatencyMs ?? null,
      lastExecutionLatencyMs: last?.executionLatencyMs ?? null,
      avgFetchLatencyMs:
        withFetch.length > 0
          ? Math.round(
              withFetch.reduce((s, t) => s + (t.fetchLatencyMs ?? 0), 0) / withFetch.length,
            )
          : null,
      avgExecutionLatencyMs:
        recentWithExec.length > 0
          ? Math.round(
              recentWithExec.reduce((s, t) => s + (t.executionLatencyMs ?? 0), 0) /
                recentWithExec.length,
            )
          : withExecution.length > 0
            ? Math.round(
                withExecution.reduce((s, t) => s + (t.executionLatencyMs ?? 0), 0) /
                  withExecution.length,
              )
            : null,
    };
  }

  async getRecentTrades(limit = 20, onlyCopied = false): Promise<RecentTradeDto[]> {
    const wallets = await this.walletModel.find().select('wallet label').lean().exec();
    const walletLabels = new Map(wallets.map((w) => [w.wallet, w.label]));

    const query = onlyCopied ? { status: TradeStatus.COPIED } : {};
    const trades = await this.tradeModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return trades.map((t) => ({
      id: String((t as { _id?: { toString(): string } })._id ?? ''),
      tradeId: t.tradeId,
      walletLabel: walletLabels.get(t.wallet) ?? null,
      wallet: t.wallet,
      marketId: t.marketId,
      tokenId: t.tokenId,
      slug: t.slug ?? undefined,
      side: t.side,
      size: t.size,
      executedSize: t.executedSize ?? undefined,
      price: t.price,
      status: t.status,
      reason: t.reason ?? undefined,
      createdAt: t.createdAt?.toISOString() ?? '',
      latencyMs: t.latencyMs ?? undefined,
      fetchLatencyMs: t.fetchLatencyMs ?? undefined,
      executionLatencyMs: t.executionLatencyMs ?? undefined,
    }));
  }

  async getWeeklyReports(weeks = 12): Promise<WeeklyReportDto[]> {
    const wallets = await this.walletModel.find().select('wallet label').lean().exec();
    const walletLabels = new Map(wallets.map((w) => [w.wallet, w.label]));

    const reports: WeeklyReportDto[] = [];
    const now = new Date();

    for (let i = 0; i < weeks; i++) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const trades = await this.tradeModel
        .find({ createdAt: { $gte: weekStart, $lte: weekEnd } })
        .lean()
        .exec();

      const copied = trades.filter((t) => t.status === TradeStatus.COPIED).length;
      const skipped = trades.filter((t) => t.status === TradeStatus.SKIPPED).length;
      const failed = trades.filter((t) => t.status === TradeStatus.FAILED).length;
      const total = trades.length;
      const copyRatePercent = total > 0 ? (copied / total) * 100 : 0;

      const byWalletMap = new Map<string, { copied: number; skipped: number; failed: number }>();
      for (const t of trades) {
        if (!byWalletMap.has(t.wallet)) {
          byWalletMap.set(t.wallet, { copied: 0, skipped: 0, failed: 0 });
        }
        const row = byWalletMap.get(t.wallet)!;
        if (t.status === TradeStatus.COPIED) row.copied++;
        else if (t.status === TradeStatus.SKIPPED) row.skipped++;
        else if (t.status === TradeStatus.FAILED) row.failed++;
      }

      const byWallet = Array.from(byWalletMap.entries()).map(([wallet, counts]) => ({
        wallet,
        label: walletLabels.get(wallet) ?? undefined,
        ...counts,
      }));

      reports.push({
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        weekEnd: format(weekEnd, 'yyyy-MM-dd'),
        tradesCopied: copied,
        tradesSkipped: skipped,
        tradesFailed: failed,
        totalTrades: total,
        copyRatePercent: Math.round(copyRatePercent * 100) / 100,
        byWallet,
      });
    }

    return reports;
  }

  async getComparativeAnalysis(): Promise<ComparativeAnalysisDto> {
    const wallets = await this.walletModel.find().select('wallet label').lean().exec();
    const walletLabels = new Map(wallets.map((w) => [w.wallet, w.label]));

    const trades = await this.tradeModel.find().lean().exec();
    const bot = {
      totalCopied: trades.filter((t) => t.status === TradeStatus.COPIED).length,
      totalSkipped: trades.filter((t) => t.status === TradeStatus.SKIPPED).length,
      totalFailed: trades.filter((t) => t.status === TradeStatus.FAILED).length,
    };
    const total = bot.totalCopied + bot.totalSkipped + bot.totalFailed;
    const copyRatePercent = total > 0 ? (bot.totalCopied / total) * 100 : 0;

    const byWallet = new Map<string, { copied: number; skipped: number; failed: number }>();
    for (const t of trades) {
      if (!byWallet.has(t.wallet)) {
        byWallet.set(t.wallet, { copied: 0, skipped: 0, failed: 0 });
      }
      const row = byWallet.get(t.wallet)!;
      if (t.status === TradeStatus.COPIED) row.copied++;
      else if (t.status === TradeStatus.SKIPPED) row.skipped++;
      else if (t.status === TradeStatus.FAILED) row.failed++;
    }

    const leaders: LeaderComparisonDto[] = Array.from(byWallet.entries()).map(([wallet, counts]) => {
      const totalSignals = counts.copied + counts.skipped + counts.failed;
      return {
        wallet,
        label: walletLabels.get(wallet) ?? undefined,
        copied: counts.copied,
        skipped: counts.skipped,
        failed: counts.failed,
        totalSignals,
        copyRatePercent: totalSignals > 0 ? Math.round((counts.copied / totalSignals) * 10000) / 100 : 0,
        failRatePercent: totalSignals > 0 ? Math.round((counts.failed / totalSignals) * 10000) / 100 : 0,
      };
    });

    return {
      bot: { ...bot, copyRatePercent: Math.round(copyRatePercent * 100) / 100 },
      leaders: leaders.sort((a, b) => b.totalSignals - a.totalSignals),
    };
  }

  /** Used by AlertsService to evaluate thresholds (no circular dep). */
  async getStatsForAlerts(): Promise<{ total: number; copied: number; failed: number; lastTradeAt: Date | null }> {
    const [counts, last] = await Promise.all([
      this.tradeModel
        .aggregate<{ _id: string; cnt: number }>([
          { $group: { _id: '$status', cnt: { $sum: 1 } } },
        ])
        .exec(),
      this.tradeModel
        .findOne()
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean()
        .exec(),
    ]);
    let total = 0;
    let copied = 0;
    let failed = 0;
    for (const row of counts) {
      total += row.cnt;
      if (row._id === TradeStatus.COPIED) copied = row.cnt;
      if (row._id === TradeStatus.FAILED) failed = row.cnt;
    }
    return {
      total,
      copied,
      failed,
      lastTradeAt: last?.createdAt ?? null,
    };
  }
}
