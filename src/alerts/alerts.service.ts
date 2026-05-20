import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PerformanceAlert, AlertType, AlertSeverity } from './entities/performance-alert.schema';
import { DashboardService } from '../dashboard/dashboard.service';

const FAIL_RATE_THRESHOLD_PERCENT = 15;
const COPY_RATE_LOW_THRESHOLD_PERCENT = 40;
const NO_TRADES_HOURS = 24;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(PerformanceAlert.name)
    private readonly alertModel: Model<PerformanceAlert>,
    private readonly dashboard: DashboardService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async evaluatePerformanceAlerts(): Promise<void> {
    try {
      const stats = await this.dashboard.getStatsForAlerts();
      const { total, copied, failed, lastTradeAt } = stats;

      if (total === 0) {
        await this.createAlertIfNotExists(AlertType.NO_RECENT_TRADES, AlertSeverity.INFO, {
          message: 'No trades recorded yet. Add followed wallets to start copy trading.',
        });
        return;
      }

      const failRatePercent = (failed / total) * 100;
      const copyRatePercent = (copied / total) * 100;

      if (failRatePercent >= FAIL_RATE_THRESHOLD_PERCENT) {
        await this.createAlertIfNotExists(AlertType.HIGH_FAIL_RATE, AlertSeverity.CRITICAL, {
          message: `Fail rate is ${failRatePercent.toFixed(1)}% (threshold: ${FAIL_RATE_THRESHOLD_PERCENT}%). Check execution and API.`,
          failRatePercent,
          failed,
          total,
        });
      }

      if (copyRatePercent <= COPY_RATE_LOW_THRESHOLD_PERCENT && total >= 10) {
        await this.createAlertIfNotExists(AlertType.LOW_COPY_RATE, AlertSeverity.WARNING, {
          message: `Copy rate is ${copyRatePercent.toFixed(1)}% (below ${COPY_RATE_LOW_THRESHOLD_PERCENT}%). Many trades are being skipped.`,
          copyRatePercent,
          copied,
          total,
        });
      }

      if (lastTradeAt) {
        const hoursSinceLastTrade = (Date.now() - lastTradeAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastTrade >= NO_TRADES_HOURS) {
          await this.createAlertIfNotExists(AlertType.NO_RECENT_TRADES, AlertSeverity.WARNING, {
            message: `No new trades in the last ${Math.floor(hoursSinceLastTrade)} hours. Leaders may be inactive.`,
            lastTradeAt: lastTradeAt.toISOString(),
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to evaluate performance alerts', err instanceof Error ? err.message : err);
    }
  }

  private async createAlertIfNotExists(
    type: AlertType,
    severity: AlertSeverity,
    payload: { message: string; [k: string]: unknown },
  ): Promise<void> {
    const recent = await this.alertModel
      .findOne({ type, read: false })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (recent && recent.createdAt) {
      const ageHours = (Date.now() - new Date(recent.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 2) return; // avoid spam: same alert type within 2 hours
    }

    await this.alertModel.create({
      type,
      severity,
      message: payload.message,
      metadata: payload,
      read: false,
    });
    this.logger.log(`Alert created: ${type} - ${payload.message}`);
  }

  async findAll(unreadOnly = false): Promise<PerformanceAlert[]> {
    const query = unreadOnly ? { read: false } : {};
    return this.alertModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec() as Promise<PerformanceAlert[]>;
  }

  async markAsRead(id: string): Promise<PerformanceAlert> {
    const alert = await this.alertModel.findByIdAndUpdate(id, { read: true }, { new: true }).lean().exec();
    if (!alert) throw new Error('Alert not found');
    return alert as PerformanceAlert;
  }

  async markAllAsRead(): Promise<{ count: number }> {
    const result = await this.alertModel.updateMany({ read: false }, { read: true }).exec();
    return { count: result.modifiedCount };
  }
}
