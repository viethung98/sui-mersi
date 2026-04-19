import { createPaymentTransactionUri } from '@mysten/payment-kit';
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { apiClient } from './client';

export const USDC_COIN_TYPE =
  '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC';

export const POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const POLL_INTERVAL_MS = 2 * 1000;
export const VERIFY_TIMEOUT_MS = 30 * 1000;

let suiClient: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!suiClient) {
    suiClient = new SuiJsonRpcClient({
      network: 'testnet',
      url: getJsonRpcFullnodeUrl('testnet'),
    });
  }
  return suiClient;
}

export function generateNonce(): string {
  return crypto.randomUUID();
}

export function createDepositUri({
  receiverAddress,
  amountUSDC,
  nonce,
}: {
  receiverAddress: string;
  amountUSDC: number;
  nonce: string;
}): string {
  const amountMIST = BigInt(Math.floor(amountUSDC * 1_000_000));
  return createPaymentTransactionUri({
    receiverAddress,
    amount: amountMIST,
    coinType: USDC_COIN_TYPE,
    nonce,
    label: 'Account Funding',
    message: 'Deposit USDC to your account',
  });
}

interface PaymentReceiptEvent {
  nonce: string;
  amount?: string;
  payment_amount?: string;
  receiver: string;
  coin_type: string;
  payment_type?: unknown;
  timestamp_ms?: string;
}

interface PollOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

function isMatchingReceiptEvent(
  event: {
    type: string;
    parsedJson?: unknown;
  },
  nonce: string,
  amountMIST: bigint,
): boolean {
  if (!event.type.includes('PaymentReceipt')) return false;

  const payload = event.parsedJson as Partial<PaymentReceiptEvent> | null | undefined;
  if (!payload) return false;

  const eventAmount = payload.payment_amount ?? payload.amount;

  return payload.nonce === nonce && eventAmount === amountMIST.toString();
}

export async function pollForReceipt(
  recipientAddress: string,
  nonce: string,
  amountMIST: bigint,
  options?: PollOptions,
): Promise<string> {
  const client = getSuiClient();
  const timeoutMs = options?.timeoutMs ?? POLL_TIMEOUT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new DOMException('Polling aborted', 'AbortError');
    }

    const result = await client.queryTransactionBlocks({
      filter: { ToAddress: recipientAddress },
      options: { showEvents: true },
      limit: 20,
      order: 'descending',
      signal: options?.signal,
    });

    const matchingTx = result.data.find((tx) =>
      tx.events?.some((event) => isMatchingReceiptEvent(event, nonce, amountMIST)),
    );

    if (matchingTx) {
      return matchingTx.digest;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Payment receipt not found within timeout');
}

export interface VerifySuiDepositResponse {
  success: boolean;
  txDigest?: string;
  usdcAmount?: number;
  usdmxAmount?: string;
  error?: string;
}

interface VerifySuiDepositRequest {
  txDigest: string;
  nonce: string;
  amount: string;
  coinType: string;
}

export async function verifySuiDeposit(
  req: VerifySuiDepositRequest,
): Promise<VerifySuiDepositResponse> {
  try {
    return await apiClient
      .post('deposit/verify', {
        json: req,
        timeout: VERIFY_TIMEOUT_MS,
      })
      .json<VerifySuiDepositResponse>();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('Verification timed out');
    }
    const body = await (err as { response?: Response }).response?.clone().json().catch(() => null);
    throw new Error(body?.error ?? 'Verification failed');
  }
}
