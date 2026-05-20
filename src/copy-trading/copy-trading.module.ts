import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotPosition, BotPositionSchema } from './entities/bot-position.schema';
import { FollowedWallet, FollowedWalletSchema } from 'src/followed-wallets/entity/followed-wallet.schema';
import { CopyTradingService } from './copy-trading.service';
import { PolymarketModule } from 'src/polymarket/polymarket.module';
import { CopyTradingStrategy } from './copy-trading.strategy';
import { PolymarketClient } from 'src/clients/polymarket.client';
import { LeaderTrade, LeaderTradeSchema } from './entities/leader-trade.schema';

@Module({
  imports: [
    forwardRef(() => PolymarketModule),
    MongooseModule.forFeature([
      { name: BotPosition.name, schema: BotPositionSchema },
      { name: FollowedWallet.name, schema: FollowedWalletSchema },
      { name: LeaderTrade.name, schema: LeaderTradeSchema },
    ]),
  ],
  providers: [
    CopyTradingService, CopyTradingStrategy, PolymarketClient
  ],
  exports: [
    CopyTradingService,
  ],
})
export class CopyTradingModule {}