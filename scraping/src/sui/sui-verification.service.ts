import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type {
	PaymentVerificationResult,
	TransactionDetail,
} from '../common/interfaces/payment.interfaces';
import suiConfig from '../config/sui.config';
import { SuiService } from './sui.service';

const MIST_PER_SUI = 1_000_000_000;
const VERIFY_MAX_ATTEMPTS = 5;
const VERIFY_RETRY_DELAY_MS = 1_500;
const RPC_CALL_TIMEOUT_MS = 5_000;

const importDynamic = new Function('specifier', 'return import(specifier)');

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`RPC call timed out after ${ms}ms`)), ms),
		),
	]);
}

@Injectable()
export class SuiVerificationService {
	private readonly logger = new Logger(SuiVerificationService.name);

	constructor(
		@Inject(suiConfig.KEY)
		private readonly sui: ConfigType<typeof suiConfig>,
		private readonly suiService: SuiService,
	) {}

	isEnabled(): boolean {
		return this.suiService.isInitialized();
	}

	async verifyPaymentByRecord(
		nonce: string,
		amount?: string,
	): Promise<PaymentVerificationResult> {
		const amountMist = amount ?? this.sui.paymentAmountMist;
		const client = this.suiService.instance;

		const { bcs } = await importDynamic('@mysten/sui/bcs');
		const { normalizeStructTag } = await importDynamic('@mysten/sui/utils');

		const normalizedCoinType = normalizeStructTag(this.sui.coinType);
		// Drop "<phantom T>" placeholder; client.paymentKit.getPaymentRecord otherwise builds a malformed type and looks up the wrong dynamic field.
		const paymentKeyType = `@mysten/payment-kit::payment_kit::PaymentKey<${normalizedCoinType}>`;

		const PaymentKeyBcs = bcs.struct('PaymentKey', {
			nonce: bcs.string(),
			payment_amount: bcs.u64(),
			receiver: bcs.Address,
		});
		const keyBytes = PaymentKeyBcs.serialize({
			nonce,
			payment_amount: BigInt(amountMist),
			receiver: this.sui.merchantAddress,
		}).toBytes();

		const registryId = client.paymentKit.getRegistryIdFromName(
			this.sui.registryName,
		);

		const result = await this.retry<any>('Registry verification', () =>
			client
				.getDynamicField({
					parentId: registryId,
					name: { type: paymentKeyType, bcs: keyBytes },
				})
				.then((r: any) => (r?.dynamicField ?? null)),
		);

		if (!result) {
			return { ok: false, reason: 'Unable to verify payment record' };
		}
		return {
			ok: true,
			payment: {
				txHash: result.previousTransaction,
				amount: amountMist,
			},
		};
	}

	async verifyPaymentProof(
		txDigest: string,
		amount?: string,
	): Promise<PaymentVerificationResult> {
		if (!txDigest) {
			return { ok: false, reason: 'Invalid payment proof format' };
		}

		const merchantAddress = this.sui.merchantAddress;
		const minAmount = BigInt(amount ?? this.sui.paymentAmountMist);

		const result = await this.retry('Ephemeral verification', async () => {
			const tx = await this.fetchTransaction(txDigest);
			if (tx?.$kind === 'FailedTransaction') {
				throw new Error('Transaction failed on-chain');
			}
			// gRPC balance changes use bc.address (not bc.owner.AddressOwner)
			const match = tx?.Transaction?.balanceChanges?.find(
				(bc: any) =>
					bc.address === merchantAddress && BigInt(bc.amount) >= minAmount,
			);
			if (!match) return null;
			return {
				txHash: txDigest,
				amount: match.amount,
				from: tx.Transaction.transaction?.sender,
			};
		});

		if (!result) {
			return { ok: false, reason: 'No matching transfer found in transaction' };
		}
		return { ok: true, payment: result };
	}

	async getTransactionDetail(
		txDigest: string,
	): Promise<TransactionDetail | null> {
		try {
			const result = await this.fetchTransaction(txDigest);
			if (!result) return null;

			const tx = result.Transaction ?? result.FailedTransaction;
			const merchantAddress = this.sui.merchantAddress;
			const balanceChange = tx.balanceChanges?.find(
				(bc: any) => bc.address === merchantAddress,
			);
			const value = balanceChange?.amount || '0';

			return {
				hash: txDigest,
				from: tx.transaction?.sender || '',
				to: merchantAddress,
				value,
				amount: (Number(value) / MIST_PER_SUI).toString(),
				blockNumber: Number(tx.epoch || 0),
			};
		} catch (error: any) {
			this.logger.warn(
				`Failed to get Sui transaction detail: ${error?.message ?? error}`,
			);
			return null;
		}
	}

	private fetchTransaction(digest: string): Promise<any> {
		return withTimeout(
			this.suiService.instance.getTransaction({
				digest,
				include: { transaction: true, balanceChanges: true },
			}),
			RPC_CALL_TIMEOUT_MS,
		);
	}

	private async retry<T>(
		label: string,
		fn: () => Promise<T | null>,
	): Promise<T | null> {
		for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
			try {
				const result = await fn();
				if (result !== null && result !== undefined) return result;
				this.logger.warn(
					`${label} ${attempt}/${VERIFY_MAX_ATTEMPTS}: empty result`,
				);
			} catch (error: any) {
				this.logger.warn(
					`${label} ${attempt}/${VERIFY_MAX_ATTEMPTS} failed: ${error?.message ?? error}`,
				);
			}
			if (attempt < VERIFY_MAX_ATTEMPTS) await sleep(VERIFY_RETRY_DELAY_MS);
		}
		return null;
	}
}
