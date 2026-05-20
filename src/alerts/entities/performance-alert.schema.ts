import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export enum AlertType {
  HIGH_FAIL_RATE = 'HIGH_FAIL_RATE',
  LOW_COPY_RATE = 'LOW_COPY_RATE',
  NO_RECENT_TRADES = 'NO_RECENT_TRADES',
  DEVIATION_FROM_LEADER = 'DEVIATION_FROM_LEADER',
}

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export type PerformanceAlertDocument = PerformanceAlert & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'performance_alerts' })
export class PerformanceAlert {
  @ApiProperty({ description: 'Alert UUID' })
  _id?: string;

  @ApiProperty({ enum: AlertType })
  @Prop({ required: true, enum: Object.values(AlertType) })
  type: AlertType;

  @ApiProperty({ enum: AlertSeverity })
  @Prop({ required: true, enum: Object.values(AlertSeverity), default: AlertSeverity.WARNING })
  severity: AlertSeverity;

  @ApiProperty()
  @Prop({ required: true })
  message: string;

  @ApiProperty({ required: false })
  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown> | null;

  @ApiProperty()
  @Prop({ default: false })
  read: boolean;

  @ApiProperty()
  @Prop({ default: Date.now })
  createdAt?: Date;
}

export const PerformanceAlertSchema = SchemaFactory.createForClass(PerformanceAlert);
PerformanceAlertSchema.index({ createdAt: 1 });

PerformanceAlertSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    obj.id = (obj._id as { toString?: () => string })?.toString?.();
    Reflect.deleteProperty(obj, '_id');
    Reflect.deleteProperty(obj, '__v');
    return ret;
  },
});
