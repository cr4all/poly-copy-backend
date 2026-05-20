import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeaderTrade, LeaderTradeSchema } from '../copy-trading/entities/leader-trade.schema';
import { BotPosition, BotPositionSchema } from '../copy-trading/entities/bot-position.schema';
import { FollowedWallet, FollowedWalletSchema } from '../followed-wallets/entity/followed-wallet.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeaderTrade.name, schema: LeaderTradeSchema },
      { name: BotPosition.name, schema: BotPositionSchema },
      { name: FollowedWallet.name, schema: FollowedWalletSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
