import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FollowedWallet } from './entity/followed-wallet.schema';

@Injectable()
export class FollowedWalletsService {
  constructor(
    @InjectModel(FollowedWallet.name)
    private readonly followedWalletModel: Model<FollowedWallet>,
  ) {}

  async findAll(): Promise<FollowedWallet[]> {
    return this.followedWalletModel.find().sort({ createdAt: -1 }).exec();
  }

  async findActive(): Promise<FollowedWallet[]> {
    return this.followedWalletModel.find({ isActive: true }).sort({ createdAt: -1 }).exec();
  }

  async add(wallet: string, label?: string): Promise<FollowedWallet> {
    const normalized = wallet.trim().toLowerCase();
    if (!normalized) {
      throw new ConflictException('Wallet address is required');
    }

    const existing = await this.followedWalletModel.findOne({ wallet: normalized }).exec();
    if (existing) {
      return existing;
    }

    return this.followedWalletModel.create({
      wallet: normalized,
      label: label?.trim() || undefined,
    });
  }

  async update(
    id: string,
    data: {
      label?: string;
      isActive?: boolean;
      lastTradeId?: string | null;
    },
  ): Promise<FollowedWallet> {
    const wallet = await this.followedWalletModel.findById(id).exec();

    if (!wallet) {
      throw new NotFoundException('Followed wallet not found');
    }

    if (data.label !== undefined) {
      wallet.label = data.label?.trim() || undefined;
    }
    if (data.isActive !== undefined) {
      wallet.isActive = data.isActive;
    }
    if (data.lastTradeId !== undefined) {
      wallet.lastTradeId = data.lastTradeId === null || data.lastTradeId === '' ? null : data.lastTradeId;
    }

    await wallet.save();
    return wallet;
  }

  async remove(id: string) {
    await this.followedWalletModel.findByIdAndDelete(id).exec();
    return { ok: true };
  }

  async removeByWallet(wallet: string) {
    const normalized = wallet.trim().toLowerCase();
    await this.followedWalletModel.deleteOne({ wallet: normalized }).exec();
    return { ok: true };
  }
}
