import 'dotenv/config';
import { createClobClient } from '../config/clob-client';

const RPC_URL = process.env.RPC_URL ?? 'https://poly.api.pocket.network';

async function main() {
  const client = await createClobClient({
    rpcUrl: RPC_URL,
    requireApiCreds: false,
    funderAddress: process.env.FUNDER_ADDRESS,
  });

  const apiCreds = await client.createOrDeriveApiKey();

  console.log('API credentials:');
  console.log(apiCreds);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
