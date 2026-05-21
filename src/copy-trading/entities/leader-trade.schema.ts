import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum TradeStatus {
  PENDING = 'PENDING',
  COPIED = 'COPIED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

export type LeaderTradeDocument = LeaderTrade & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'leader_trades',
})
export class LeaderTrade {
  _id?: string;

  @Prop({ required: true, unique: true })
  tradeId: string;

  @Prop({ required: true })
  wallet: string;

  @Prop({ required: true })
  marketId: string;

  @Prop({ required: true })
  tokenId: string;

  @Prop({ type: String, default: null })
  slug?: string | null;

  @Prop({ required: true, enum: ['BUY', 'SELL'] })
  side: 'BUY' | 'SELL';

  @Prop({ required: true })
  size: string;

  @Prop({ required: true })
  price: string;

  @Prop({
    required: true,
    enum: Object.values(TradeStatus),
    default: TradeStatus.PENDING,
  })
  status: TradeStatus;

  @Prop({ type: String, default: null })
  reason?: string | null;

  @Prop({ type: Date, default: null })
  leaderTradeAt?: Date | null;

  @Prop({ type: Date, default: null })
  fetchedAt?: Date | null;

  @Prop({ type: Date, default: null })
  copiedAt?: Date | null;

  @Prop({ type: Number, default: null })
  latencyMs?: number | null;

  @Prop({ type: Number, default: null })
  fetchLatencyMs?: number | null;

  @Prop({ type: Number, default: null })
  executionLatencyMs?: number | null;

  @Prop({ type: String, default: null })
  executedSize?: string | null;

  @Prop({ default: Date.now })
  createdAt?: Date;
}

export const LeaderTradeSchema = SchemaFactory.createForClass(LeaderTrade);
LeaderTradeSchema.index({ tradeId: 1 }, { unique: true });

LeaderTradeSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    obj.id = (obj._id as { toString?: () => string })?.toString?.();
    Reflect.deleteProperty(obj, '_id');
    Reflect.deleteProperty(obj, '__v');
    return ret;
  },
});
