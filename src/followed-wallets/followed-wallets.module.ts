import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowedWallet, FollowedWalletSchema } from './entity/followed-wallet.schema';
import { FollowedWalletsService } from './followed-wallets.service';
import { FollowedWalletsController } from './followed-wallets.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FollowedWallet.name, schema: FollowedWalletSchema }]),
  ],
  providers: [FollowedWalletsService],
  controllers: [FollowedWalletsController],
  exports: [FollowedWalletsService],
})
export class FollowedWalletsModule {}
