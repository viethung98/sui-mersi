import { apiClient } from './client';
import type { components } from '@/src/types/api.d';

export type CheckoutResponse = {
  orderId: string;
  crossmintOrderId: string;
  phase: string;
  serializedTransaction: string;
  walletAddress: string;
};
export type OrderItemSummary = {
  productId: string;
  productName: string;
  price: number;
  image: string | null;
  size: string | null;
  color: string | null;
  productUrl: string | null;
  retailer: string | null;
};
export type OrderSummary = Omit<components['schemas']['OrderSummary'], 'lineItems'> & {
  status: string;
  item?: OrderItemSummary;
  lineItems?: unknown[];
  tx_hash?: string | null;
  payment_hash?: string | null;
};
export type OrderList = Omit<components['schemas']['OrderList'], 'orders'> & {
  orders: OrderSummary[];
};
type OrderListParams = { type?: string; phase?: string; status?: string; page?: number; limit?: number };
const CHECKOUT_TIMEOUT_MS = 60 * 1000;

function isCheckoutResponse(value: unknown): value is CheckoutResponse {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.orderId === 'string' &&
    typeof data.crossmintOrderId === 'string' &&
    typeof data.phase === 'string' &&
    typeof data.serializedTransaction === 'string' &&
    typeof data.walletAddress === 'string'
  );
}

export async function checkoutItem(cartItemId: string): Promise<CheckoutResponse> {
  try {
    const res = await apiClient.post('checkout', {
      json: { cartItemId },
      timeout: CHECKOUT_TIMEOUT_MS,
    });
    const text = await res.text();

    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Checkout returned invalid JSON (${res.status})`);
    }

    if (!isCheckoutResponse(data)) {
      throw new Error('Checkout response missing order or payment details');
    }

    return data;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('Checkout request timed out after 60 seconds');
    }

    const response = typeof err === 'object' && err !== null && 'response' in err
      ? (err as { response?: Response }).response
      : undefined;

    if (!response) {
      throw err instanceof Error ? err : new Error('Checkout failed');
    }

    const body = await response.clone().json().catch(() => null);
    const code = body?.code ?? '';
    if (code === 'CheckoutNoWalletError') throw new Error('Complete onboarding first — wallet required');
    if (code === 'CheckoutMissingAddressError') throw new Error('Complete onboarding first — address required');
    if (code === 'InsufficientFundsError') throw new Error('Insufficient USDC balance');
    throw new Error(body?.error ?? 'Checkout failed');
  }
}

export async function getOrder(orderId: string): Promise<OrderSummary> {
  return apiClient.get(`orders/${orderId}`).json<OrderSummary>();
}

export async function listOrders(params: OrderListParams = {}): Promise<OrderList> {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);
  if (params.phase) searchParams.set('phase', params.phase);
  if (params.status) searchParams.set('status', params.status);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  return apiClient.get('orders', { searchParams }).json<OrderList>();
}
