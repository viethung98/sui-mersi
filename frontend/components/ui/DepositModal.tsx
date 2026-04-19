'use client';

import { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useProfile } from '@/lib/api/profile';
import {
  createDepositUri,
  pollForReceipt,
  verifySuiDeposit,
  USDC_COIN_TYPE,
  generateNonce,
} from '@/lib/api/sui-deposit';
import { useQueryClient } from '@tanstack/react-query';

type Step = 'amount' | 'pending' | 'verifying' | 'success' | 'error';

interface DepositModalProps {
  onClose: () => void;
}

const GUIDE_STEPS = [
  'Enter the USDC amount below',
  'Click "Continue" to generate a payment QR code',
  'Scan the QR code with your Sui wallet',
  'Confirm the transaction in your wallet',
];

export function DepositModal({ onClose }: DepositModalProps) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('amount');
  const [amountUSDC, setAmountUSDC] = useState('');
  const [nonce, setNonce] = useState('');
  const [paymentUri, setPaymentUri] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnedTxDigestRef = useRef<string>('');
  const walletAddress = profile?.walletAddress ?? '';
  const amount = parseFloat(amountUSDC);
  const canContinue = Boolean(walletAddress) && amountUSDC.length > 0 && !Number.isNaN(amount) && amount >= 0.01;

  function handleCopyUri() {
    if (!paymentUri) return;
    navigator.clipboard.writeText(paymentUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleContinueToPending() {
    if (Number.isNaN(amount) || amount < 0.01) return;
    const newNonce = generateNonce();
    const newUri = createDepositUri({ receiverAddress: walletAddress, amountUSDC: amount, nonce: newNonce });
    setNonce(newNonce);
    setPaymentUri(newUri);
    setStep('pending');
  }

  // Auto-poll for receipt in pending step
  useEffect(() => {
    if (step !== 'pending' || !walletAddress || !nonce) return;

    const amount = parseFloat(amountUSDC);
    const amountMIST = BigInt(Math.floor(amount * 1_000_000));

    const abortController = new AbortController();

    pollForReceipt(walletAddress, nonce, amountMIST, {
      signal: abortController.signal,
    })
      .then((digest) => {
        returnedTxDigestRef.current = digest;
        setStep('verifying');
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message ?? 'Payment not detected');
        setStep('error');
      });

    return () => {
      abortController.abort();
    };
  }, [step, walletAddress, nonce, amountUSDC]);

  // Verify on-chain in verifying step
  useEffect(() => {
    if (step !== 'verifying') return;

    const txDigest = returnedTxDigestRef.current;
    if (!txDigest || !nonce) return;

    const amount = parseFloat(amountUSDC);
    const amountMIST = BigInt(Math.floor(amount * 1_000_000));

    let cancelled = false;

    verifySuiDeposit({ txDigest, nonce, amount: amountMIST.toString(), coinType: USDC_COIN_TYPE })
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setStep('success');
        } else {
          setError(result.error ?? 'Verification failed');
          setStep('error');
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? 'Verification failed');
        setStep('error');
      });

    return () => {
      cancelled = true;
    };
  }, [step, nonce, amountUSDC]);

  function handleDone() {
    queryClient.invalidateQueries({ queryKey: ['wallet', 'balance', 'usdxm'] });
    onClose();
  }

  function handleRetry() {
    setNonce('');
    setPaymentUri('');
    setError(null);
    returnedTxDigestRef.current = '';
    setStep('amount');
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-3 pt-[84px] backdrop-blur-sm sm:justify-end sm:p-6 sm:pt-[88px]">
      <div
        className="modal-enter app-panel-solid stitch-ghost-border relative w-full max-w-[420px] overflow-hidden shadow-2xl"
        style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,255,0.04)' }}
      >
        <div className="pointer-events-none absolute inset-0 stitch-grid opacity-10" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-(--primary)/70 to-transparent" />

        {/* Header */}
        <div className="relative flex items-start justify-between px-5 pb-4 pt-5">
          <div className="flex items-start gap-2">
            {step === 'error' && (
              <button
                onClick={() => { setStep('amount'); setError(null); }}
                className="app-toolbar-button -ml-1 flex h-8 w-8 items-center justify-center text-(--text-muted) hover:text-(--text-secondary)"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <div>
              <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Wallet Funding</p>
              <h2 className="stitch-headline mt-2 text-2xl text-(--text-primary)">
                {step === 'amount' && 'Deposit'}
                {step === 'pending' && 'Awaiting Payment'}
                {step === 'verifying' && 'Verifying'}
                {step === 'success' && 'Deposit Confirmed'}
                {step === 'error' && 'Deposit Failed'}
              </h2>
            </div>
          </div>
          {step !== 'pending' && step !== 'verifying' && (
            <button
              onClick={step === 'success' ? handleDone : onClose}
              className="app-toolbar-button flex h-9 w-9 items-center justify-center text-(--text-muted) hover:text-(--text-primary)"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* amount step */}
        {step === 'amount' && (
          <div className="relative flex flex-col gap-5 px-5 pb-5">
            <div className="app-panel stitch-ghost-border p-4">
              <p className="stitch-label text-[9px] text-[var(--landing-tertiary)]">Funding Flow</p>
              <ol className="mt-4 space-y-3">
              {GUIDE_STEPS.map((text, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="stitch-label mt-0.5 flex h-5 w-5 flex-none items-center justify-center border border-(--primary)/40 bg-(--primary)/10 text-[8px] text-(--primary-light)">
                    {i + 1}
                  </span>
                  <span className="text-xs text-(--text-secondary) leading-relaxed">{text}</span>
                </li>
              ))}
              </ol>
            </div>

            <div>
              <label className="stitch-label text-[9px] text-(--text-muted)">Amount (USDC)</label>
              <div className="app-command-input mt-2 px-4 py-4">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountUSDC}
                  onChange={(e) => setAmountUSDC(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-lg text-(--text-primary) placeholder:text-(--text-muted) outline-none"
                />
              </div>
              {!walletAddress && (
                <p className="mt-3 text-xs leading-5 text-(--error)">Wallet address unavailable. Finish onboarding before funding.</p>
              )}
            </div>

            <button
              onClick={handleContinueToPending}
              disabled={!canContinue}
              className="stitch-primary-button stitch-label w-full py-4 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* pending step */}
        {step === 'pending' && (
          <div className="relative flex flex-col gap-4 px-5 pb-5">
            {/* QR code via qrcode.react — no encoding, no effects */}
            <div className="app-panel stitch-ghost-border p-4">
              <p className="stitch-label text-[9px] text-[var(--landing-tertiary)]">Scan With Sui Wallet</p>
              <div className="mt-4 flex justify-center border border-(--border) bg-white p-3">
                <QRCodeSVG
                  value={paymentUri}
                  size={220}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
            </div>

            <div className="app-panel stitch-ghost-border p-3">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[10px] font-mono text-(--text-secondary) break-all select-all leading-relaxed">
                  {paymentUri}
                </span>
                <button
                  onClick={handleCopyUri}
                  className="app-toolbar-button flex h-10 w-10 flex-none items-center justify-center text-(--text-muted) hover:text-(--primary-light)"
                  title="Copy URI"
                >
                  {copied ? <Check size={13} className="text-(--success)" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 size={22} className="animate-spin text-(--primary)" />
              <p className="stitch-label text-[10px] text-(--text-secondary)">Waiting for payment...</p>
            </div>
          </div>
        )}

        {/* verifying step */}
        {step === 'verifying' && (
          <div className="relative flex flex-col items-center gap-3 px-5 pb-8">
            <Loader2 size={28} className="animate-spin text-(--primary)" />
            <p className="stitch-label text-[10px] text-(--text-secondary)">Verifying on-chain...</p>
          </div>
        )}

        {/* success step */}
        {step === 'success' && (
          <div className="relative flex flex-col items-center gap-4 px-5 pb-5">
            <CheckCircle size={36} className="text-[var(--landing-tertiary)]" />
            <p className="stitch-headline text-xl text-(--text-primary)">Deposit Confirmed</p>
            <button
              onClick={handleDone}
              className="stitch-primary-button stitch-label w-full py-4 text-[10px]"
            >
              Done
            </button>
          </div>
        )}

        {/* error step */}
        {step === 'error' && (
          <div className="relative flex flex-col items-center gap-4 px-5 pb-5">
            <AlertCircle size={36} className="text-(--error)" />
            <p className="text-xs text-(--text-secondary) text-center leading-relaxed">
              {error ?? 'Something went wrong'}
            </p>
            <div className="flex gap-2 w-full">
              <button
                onClick={handleRetry}
                className="stitch-primary-button stitch-label flex-1 py-4 text-[10px]"
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="stitch-secondary-button stitch-label flex-1 py-4 text-[10px]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
