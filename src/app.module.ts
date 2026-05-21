import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PolymarketClient } from './clients/polymarket.client';
import { PolymarketController } from './polymarket/polymarket.controller';
import { PolymarketService } from './polymarket/polymarket.service';
import { PolymarketPoller } from './polymarket/polymarket.poller';
import { CopyTradingModule } from './copy-trading/copy-trading.module';
import { FollowedWalletsModule } from './followed-wallets/followed-wallets.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AlertsModule } from './alerts/alerts.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/polymarket_bot',
    ),
    ScheduleModule.forRoot(),
    CopyTradingModule,
    FollowedWalletsModule,
    DashboardModule,
    AlertsModule,
  ],
  controllers: [PolymarketController],
  providers: [PolymarketClient, PolymarketService, PolymarketPoller],
  exports: [PolymarketClient, PolymarketService],
})
export class AppModule {}
