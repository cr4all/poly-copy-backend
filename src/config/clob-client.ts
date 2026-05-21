import 'dotenv/config';
import { Wallet, JsonRpcProvider } from 'ethers';
import { ClobClient, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { V5SignerAdapter } from '../utils/web3-utils';

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137;

function getApiCreds(): { key: string; secret: string; passphrase: string } | undefined {
  const raw = process.env.POLYMARKET_API_CREDS;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as { key: string; secret: string; passphrase: string };
  } catch {
    throw new Error('POLYMARKET_API_CREDS must be valid JSON');
  }
}

export interface CreateClobClientOptions {
  rpcUrl?: string;
  privateKey?: string;
  funderAddress?: string;
  apiCreds?: { key: string; secret: string; passphrase: string };
  signatureType?: SignatureTypeV2;
  requireApiCreds?: boolean;
}

export async function createClobClient(
  options: CreateClobClientOptions = {},
): Promise<ClobClient> {
  const rpcUrl = options.rpcUrl ?? process.env.RPC_URL ?? 'https://poly.api.pocket.network';
  const privateKey = options.privateKey ?? process.env.PRIVATE_KEY;
  const funderAddress = options.funderAddress ?? process.env.FUNDER_ADDRESS;
  const requireApiCreds = options.requireApiCreds ?? true;

  if (!privateKey) throw new Error('PRIVATE_KEY is missing from environment');
  if (requireApiCreds && !funderAddress) {
    throw new Error('FUNDER_ADDRESS is missing from environment');
  }

  const apiCreds = options.apiCreds ?? getApiCreds();
  if (requireApiCreds && !apiCreds) {
    throw new Error('POLYMARKET_API_CREDS is missing from environment');
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const signer = new V5SignerAdapter(wallet);

  const builderCode = process.env.POLY_BUILDER_CODE;

  return new ClobClient({
    host: HOST,
    chain: CHAIN_ID,
    signer,
    creds: apiCreds,
    // Magic Link / email login → proxy wallet (see Polymarket Signature Types)
    signatureType: options.signatureType ?? SignatureTypeV2.POLY_PROXY,
    funderAddress,
    ...(builderCode ? { builderConfig: { builderCode } } : {}),
  });
}
