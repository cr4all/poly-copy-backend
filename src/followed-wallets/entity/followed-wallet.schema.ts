import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type FollowedWalletDocument = FollowedWallet & Document;

@Schema({ timestamps: true, collection: 'followed_wallets' })
export class FollowedWallet {
  @ApiProperty({ description: 'Follower UUID' })
  _id?: string;

  /** Virtual: populated from _id by schema */
  id?: string;

  @ApiProperty({ description: 'Wallet address (0x...)' })
  @Prop({ required: true, unique: true })
  wallet: string;

  @ApiProperty({ description: 'Optional label (e.g. @Leader1)', required: false })
  @Prop({ type: String, default: null })
  label?: string | null;

  @ApiProperty({ description: 'Whether copy trading is active for this follower' })
  @Prop({ default: true })
  isActive: boolean;

  @ApiProperty({
    description: 'Last processed trade ID (cursor); null until first poll',
    required: false,
  })
  @Prop({ type: String, default: null })
  lastTradeId?: string | null;

  @ApiProperty({ description: 'Created at (ISO 8601)' })
  createdAt?: Date;

  @ApiProperty({ description: 'Updated at (ISO 8601)' })
  updatedAt?: Date;
}

export const FollowedWalletSchema = SchemaFactory.createForClass(FollowedWallet);

FollowedWalletSchema.virtual('id').get(function () {
  return (this as { _id?: { toString(): string } })._id?.toString();
});

FollowedWalletSchema.set('toJSON', {
  virtuals: true,
  getters: true,
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    obj.id = (obj._id as { toString?: () => string })?.toString?.();
    Reflect.deleteProperty(obj, '_id');
    Reflect.deleteProperty(obj, '__v');
    return ret;
  },
});
