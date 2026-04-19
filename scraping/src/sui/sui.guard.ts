import {
	CanActivate,
	ExecutionContext,
	Inject,
	Injectable,
	Logger,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../common/redis.service';
import suiConfig from '../config/sui.config';
import { SuiVerificationService } from './sui-verification.service';
import { SUI_CHARGE_METADATA_KEY, SuiChargeOptions } from './sui.decorator';

const importDynamic = new Function('specifier', 'return import(specifier)');

const EPHEMERAL_DIGEST_TTL_SECONDS = 86400;

@Injectable()
export class SuiGuard implements CanActivate {
	private readonly logger = new Logger(SuiGuard.name);

	constructor(
		private readonly reflector: Reflector,
		private readonly verificationService: SuiVerificationService,
		private readonly redisService: RedisService,
		@Inject(suiConfig.KEY)
		private readonly sui: ConfigType<typeof suiConfig>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (!this.verificationService.isEnabled()) {
			this.logger.warn(
				'SuiGuard: payment gate disabled (SUI_MERCHANT_ADDRESS not set)',
			);
			return true;
		}

		const chargeOptions = this.reflector.getAllAndOverride<SuiChargeOptions>(
			SUI_CHARGE_METADATA_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (!chargeOptions) {
			return true;
		}

		const req = context.switchToHttp().getRequest<Request>();
		const res = context.switchToHttp().getResponse<Response>();

		try {
			const nonce = req.headers['x-sui-payment-nonce'] as string | undefined;
			const digest = req.headers['x-sui-payment-digest'] as string | undefined;

			if (nonce) {
				return await this.verifyByNonce(nonce, chargeOptions.amount, req, res);
			}
			if (digest) {
				return await this.verifyByDigest(digest, chargeOptions.amount, req, res);
			}
			return this.issueChallenge(chargeOptions, req, res);
		} catch (error: any) {
			this.logger.error(`Sui guard error: ${error?.message ?? error}`);
			return false;
		}
	}

	private async issueChallenge(
		chargeOptions: SuiChargeOptions,
		req: Request,
		res: Response,
	): Promise<boolean> {
		const nonce = crypto.randomUUID();
		const coinType = chargeOptions.coinType || this.sui.coinType;

		let paymentUri: string | undefined;
		try {
			const { createPaymentTransactionUri } = await importDynamic(
				'@mysten/payment-kit',
			);
			paymentUri = createPaymentTransactionUri({
				receiverAddress: this.sui.merchantAddress,
				amount: BigInt(chargeOptions.amount),
				coinType,
				nonce,
				label: chargeOptions.description,
				message: `Payment for ${req.originalUrl}`,
				registryName: this.sui.registryName,
			});
		} catch {
			// Payment URI is optional
		}

		res.status(402).json({
			type: 'sui-payment-required',
			nonce,
			...(paymentUri && { paymentUri }),
			network: this.sui.network,
			recipient: this.sui.merchantAddress,
			amount: chargeOptions.amount,
			coinType,
			description: chargeOptions.description,
		});
		return false;
	}

	private async verifyByNonce(
		nonce: string,
		amount: string,
		req: Request,
		res: Response,
	): Promise<boolean> {
		const result = await this.verificationService.verifyPaymentByRecord(
			nonce,
			amount,
		);
		if (result.ok) {
			(req as any).suiPayment = {
				nonce,
				digest: result.payment?.txHash,
				amount: result.payment?.amount,
			};
			return true;
		}

		res.status(402).json({ type: 'sui-payment-error', reason: result.reason });
		return false;
	}

	private async verifyByDigest(
		digest: string,
		amount: string,
		req: Request,
		res: Response,
	): Promise<boolean> {
		const usedKey = `sui:charge:used:${digest}`;
		if (await this.redisService.get(usedKey)) {
			res.status(402).json({
				type: 'sui-payment-error',
				reason: 'Payment digest already used',
			});
			return false;
		}

		const result = await this.verificationService.verifyPaymentProof(
			digest,
			amount,
		);
		if (result.ok) {
			await this.redisService.set(usedKey, '1', EPHEMERAL_DIGEST_TTL_SECONDS);
			(req as any).suiPayment = {
				digest,
				from: result.payment?.from,
				amount: result.payment?.amount,
			};
			return true;
		}

		res.status(402).json({ type: 'sui-payment-error', reason: result.reason });
		return false;
	}
}
