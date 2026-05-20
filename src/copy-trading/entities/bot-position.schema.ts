import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BotPositionDocument = BotPosition & Document;

@Schema({ timestamps: { createdAt: false, updatedAt: true }, collection: 'bot_positions' })
export class BotPosition {
  _id?: string;

  @Prop({ required: true })
  marketId: string;

  @Prop({ required: true })
  tokenId: string;

  @Prop({ default: '0' })
  netSize: string;

  @Prop({ default: Date.now })
  updatedAt?: Date;
}

export const BotPositionSchema = SchemaFactory.createForClass(BotPosition);
BotPositionSchema.index({ marketId: 1, tokenId: 1 }, { unique: true });

BotPositionSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    obj.id = (obj._id as { toString?: () => string })?.toString?.();
    Reflect.deleteProperty(obj, '_id');
    Reflect.deleteProperty(obj, '__v');
    return ret;
  },
});
