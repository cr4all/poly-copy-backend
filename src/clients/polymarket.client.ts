import { Injectable } from '@nestjs/common';
import { ClobClient } from '@polymarket/clob-client-v2';
import { createClobClient } from '../config/clob-client';

@Injectable()
export class PolymarketClient {
  private clientPromise: Promise<ClobClient>;

  constructor() {
    this.clientPromise = createClobClient();
  }

  async getClient(): Promise<ClobClient> {
    return this.clientPromise;
  }
}
