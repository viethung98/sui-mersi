'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { EVMWallet, useAuth, useWallet } from '@crossmint/client-sdk-react-ui';
import { X, CheckCircle, AlertCircle, Loader2, Mail } from 'lucide-react';
import { checkoutItem, getOrder, type CheckoutResponse, type OrderSummary } from '@/lib/api/checkout';
import { useProfile } from '@/lib/api/profile';
type Step = 'preparing' | 'approving' | 'processing' | 'completed' | 'failed';
const CHECKOUT_POLL_INTERVAL_MS = 2_500;
const CHECKOUT_POLL_TIMEOUT_MS = 2 * 60 * 1000;

const checkoutSessions = new Map<string, CheckoutResponse>();
const inflightCheckoutSessions = new Map<string, Promise<CheckoutResponse>>();

function sameAddress(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isOrderCompleted(order: OrderSummary): boolean {
  return order.status === 'delivered' || order.phase === 'completed';
}

function isOrderFailed(order: OrderSummary): boolean {
  return order.status === 'cancelled' || order.phase === 'failed';
}

function getProcessingMessage(order: OrderSummary | null): string {
  if (!order) return 'Processing order…';
  if (order.status === 'payment_confirmed') return 'Payment confirmed. Finalizing order…';
  if (order.status === 'in_progress' || order.phase === 'delivery') return 'Placing order…';
  return 'Processing order…';
}

async function getCheckoutSession(cartItemId: string): Promise<CheckoutResponse> {
  const existing = checkoutSessions.get(cartItemId);
  if (existing) return existing;

  const inflight = inflightCheckoutSessions.get(cartItemId);
  if (inflight) return inflight;

  const promise = checkoutItem(cartItemId)
    .then((data) => {
      checkoutSessions.set(cartItemId, data);
      return data;
    })
    .finally(() => {
      inflightCheckoutSessions.delete(cartItemId);
    });

  inflightCheckoutSessions.set(cartItemId, promise);
  return promise;
}

interface CheckoutModalProps {
  cartItemId: string;
  itemName: string;
  itemPrice: number; // cents
  onDone: () => void;
  onBack: () => void;
}

export function CheckoutModal({ cartItemId, itemName, itemPrice, onDone, onBack }: CheckoutModalProps) {
  const { wallet, getOrCreateWallet } = useWallet();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [step, setStep] = useState<Step>('preparing');
  const [error, setError] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<CheckoutResponse | null>(() => checkoutSessions.get(cartItemId) ?? null);
  const [orderStatus, setOrderStatus] = useState<OrderSummary | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const doneRef = useRef(false);

  const clearCheckoutSession = useCallback(() => {
    checkoutSessions.delete(cartItemId);
    inflightCheckoutSessions.delete(cartItemId);
  }, [cartItemId]);

  const cleanup = useCallback(() => {
    doneRef.current = true;
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      clearCheckoutSession();
    };
  }, [cleanup, clearCheckoutSession]);

  const startPolling = useCallback((orderId: string) => {
    doneRef.current = false;
    setStep('processing');

    pollingRef.current = setInterval(async () => {
      if (doneRef.current) return;
      try {
        const status = await getOrder(orderId);
        if (doneRef.current) return;
        setOrderStatus(status);
        if (isOrderCompleted(status)) {
          cleanup();
          clearCheckoutSession();
          setStep('completed');
        } else if (isOrderFailed(status)) {
          cleanup();
          setStep('failed');
          setError('Order failed');
        }
      } catch {
        // keep polling on transient errors
      }
    }, CHECKOUT_POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      cleanup();
      setStep('failed');
      setError('Order is still processing. Check your order history.');
    }, CHECKOUT_POLL_TIMEOUT_MS);
  }, [cleanup, clearCheckoutSession]);

  const submitPaymentAndPoll = useCallback(async (
    serializedTransaction: string,
    orderId: string,
    expectedWalletAddress: string
  ) => {
    setError(null);
    setStep('approving');
    try {
      const email = profile?.email ?? user?.email ?? null;
      if (!wallet && !email) {
        throw new Error('Profile is still loading. Retry in a moment.');
      }

      const existingWalletMatches = sameAddress(wallet?.address, expectedWalletAddress);

      const w =
        (existingWalletMatches ? wallet : null) ??
        (await getOrCreateWallet({
          chain: 'base-sepolia',
          signer: { type: 'email', email: email ?? '' },
        }));
      if (!w) throw new Error('Wallet not available');

      if (!sameAddress(w.address, expectedWalletAddress)) {
        throw new Error(
          `Wallet mismatch. Checkout expects ${expectedWalletAddress}, but Crossmint returned ${w.address}.`
        );
      }

      const evmWallet = EVMWallet.from(w);
      await evmWallet.sendTransaction({ transaction: serializedTransaction });

      startPolling(orderId);
    } catch (err: unknown) {
      setStep('failed');
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  }, [wallet, getOrCreateWallet, profile?.email, startPolling, user?.email]);

  const handleCheckout = useCallback(async () => {
    setError(null);
    setStep('preparing');
    try {
      const data = await getCheckoutSession(cartItemId);
      setOrderData(data);
      await submitPaymentAndPoll(data.serializedTransaction, data.orderId, data.walletAddress);
    } catch (err: unknown) {
      setStep('failed');
      setError(err instanceof Error ? err.message : 'Checkout failed');
    }
  }, [cartItemId, submitPaymentAndPoll]);

  // Auto-start on mount — guard against StrictMode double-fire
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    handleCheckout();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompleted = useCallback(() => {
    clearCheckoutSession();
    onDone();
  }, [clearCheckoutSession, onDone]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-(--surface) rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5 border border-(--border)">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-(--text-primary) text-xs uppercase tracking-widest">Checkout</h2>
          {(step === 'completed' || step === 'failed') && (
            <button
              onClick={step === 'completed' ? handleCompleted : onBack}
              className="p-1 rounded hover:bg-(--surface-elevated) text-(--text-secondary)"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Item summary */}
        <div className="flex items-center justify-between text-xs border border-(--border) rounded-lg px-3 py-2.5 bg-(--surface-elevated)">
          <span className="text-(--text-secondary) truncate max-w-[70%]">{itemName}</span>
          <span className="font-mono font-semibold text-(--text-primary) shrink-0 ml-2">
            ${(itemPrice / 100).toFixed(2)}
          </span>
        </div>

        {/* State views */}
        {step === 'preparing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 size={28} className="animate-spin text-(--primary)" />
            <p className="text-sm text-(--text-secondary)">Creating order…</p>
          </div>
        )}

        {step === 'approving' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Mail size={22} className="text-amber-400" />
            </div>
            <p className="text-sm font-medium text-(--text-primary)">Check your email</p>
            <p className="text-xs text-(--text-secondary) text-center leading-relaxed">
              Enter the OTP code Crossmint sent you to approve this transaction.
            </p>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 size={28} className="animate-spin text-(--primary)" />
            <p className="text-sm text-(--text-secondary)">{getProcessingMessage(orderStatus)}</p>
          </div>
        )}

        {step === 'completed' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle size={36} className="text-emerald-400" />
            <div className="text-center">
              <p className="text-sm font-semibold text-(--text-primary)">Order placed!</p>
              {orderStatus?.quote?.totalPrice && (
                <p className="text-xs text-(--text-secondary) mt-1 font-mono">
                  Total: ${orderStatus.quote.totalPrice.amount}{' '}
                  {orderStatus.quote.totalPrice.currency.toUpperCase()}
                </p>
              )}
            </div>
            <button
              onClick={handleCompleted}
              className="w-full py-2.5 text-xs font-semibold uppercase tracking-wide rounded-lg bg-(--primary) hover:bg-(--primary-hover) text-white transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {step === 'failed' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <AlertCircle size={36} className="text-red-400" />
            <p className="text-xs text-(--text-secondary) text-center leading-relaxed">
              {error ?? 'Something went wrong'}
            </p>
            <div className="flex gap-2 w-full">
              {orderData && (
                <button
                  onClick={() =>
                    submitPaymentAndPoll(
                      orderData.serializedTransaction,
                      orderData.orderId,
                      orderData.walletAddress
                    )
                  }
                  className="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide rounded-lg bg-(--primary) hover:bg-(--primary-hover) text-white transition-colors"
                >
                  Retry
                </button>
              )}
              <button
                onClick={onBack}
                className="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide rounded-lg bg-(--surface-elevated) hover:bg-(--border) text-(--text-secondary) transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
