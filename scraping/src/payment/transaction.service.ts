import { ApiResponse } from '@/common/dto/response.dto';
import { HttpService } from '@nestjs/axios';
import {
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { RedisService } from '../common/redis.service';
import servicesConfig from '../config/services.config';
import suiConfig from '../config/sui.config';
import { TransactionEntity, TransactionStatus } from '../database/entities';
import { SuiVerificationService } from '../sui/sui-verification.service';
import { VerifyTransactionDto, VerifyTransactionRequestDto } from './dto';

const NETWORK = 'sui';
const VERIFY_LOCK_TTL_S = 60;
const DOWNSTREAM_DEDUPE_TTL_S = 86_400;

@Injectable()
export class TransactionService {
	private readonly logger = new Logger(TransactionService.name);

	constructor(
		@InjectRepository(TransactionEntity)
		private readonly transactionRepo: Repository<TransactionEntity>,
		private readonly suiVerification: SuiVerificationService,
		private readonly redisService: RedisService,
		private readonly httpService: HttpService,
		@Inject(servicesConfig.KEY)
		private readonly services: ConfigType<typeof servicesConfig>,
		@Inject(suiConfig.KEY)
		private readonly sui: ConfigType<typeof suiConfig>,
	) {}

	async verifyTransaction(
		request: VerifyTransactionRequestDto,
	): Promise<ApiResponse<VerifyTransactionDto>> {
		const { txHash, userId } = request;
		const lockKey = `lock:tx_verify:${txHash}`;
		const lockValue = await this.redisService.acquireLock(
			lockKey,
			VERIFY_LOCK_TTL_S,
		);
		if (!lockValue) {
			return ApiResponse.error(
				429,
				'Transaction verification is already in progress, please retry later',
			);
		}

		try {
			const existing = await this.transactionRepo.findOne({ where: { txHash } });
			if (existing) {
				return ApiResponse.error(
					400,
					`Transaction already processed with status: ${existing.status}`,
				);
			}

			const transaction = this.transactionRepo.create({
				txHash,
				userId,
				status: 'PENDING',
				network: NETWORK,
			});

			return await this.processTransaction(txHash, userId, transaction);
		} catch (error) {
			this.logger.error(
				`Transaction verification failed: ${error.message}`,
				error.stack,
			);
			return ApiResponse.error(500, 'Transaction verification failed');
		} finally {
			await this.redisService.releaseLock(lockKey, lockValue);
		}
	}

	async getTransactionDetails(txHash: string): Promise<{
		hash: string;
		amount: string;
		from: string;
		to: string;
		blockNumber: number;
		input?: string;
	}> {
		const detail = await this.suiVerification.getTransactionDetail(txHash);
		if (!detail) {
			throw new NotFoundException('Transaction not found');
		}
		return {
			hash: detail.hash,
			amount: detail.value,
			from: detail.from,
			to: detail.to,
			blockNumber: detail.blockNumber,
			input: detail.input,
		};
	}

	private async processTransaction(
		txHash: string,
		userId: string,
		transaction: TransactionEntity,
	): Promise<ApiResponse<VerifyTransactionDto>> {
		try {
			const txDetails = await this.suiVerification.getTransactionDetail(txHash);

			if (!txDetails) {
				await this.updateTransactionStatus(
					transaction,
					'FAILED',
					'Transaction not found',
				);
				return ApiResponse.error(404, 'Transaction not found on blockchain');
			}

			transaction.receiver = txDetails.to;
			transaction.originAmount = txDetails.value;
			transaction.amount = parseFloat(txDetails.amount);
			transaction.status = 'SUCCESS';
			await this.transactionRepo.save(transaction);
			this.logger.log(`Transaction verified and saved: ${txHash}`);

			await this.callDownstreamService({
				userId,
				address: txDetails.to,
				amount: txDetails.value,
				txHash,
			});

			return ApiResponse.success(
				{
					receiver: txDetails.to,
					amount: parseFloat(txDetails.value),
					userId,
				},
				200,
				'Transaction verified successfully',
			);
		} catch (error) {
			await this.updateTransactionStatus(transaction, 'FAILED', error.message);
			return ApiResponse.error(500, 'Transaction processing failed');
		}
	}

	private async updateTransactionStatus(
		transaction: TransactionEntity,
		status: TransactionStatus,
		errorMsg?: string,
	): Promise<void> {
		transaction.status = status;
		if (errorMsg) {
			transaction.errorMsg = errorMsg;
		}
		await this.transactionRepo.save(transaction);
	}

	private async callDownstreamService(data: {
		userId: string;
		address: string;
		amount: string;
		txHash: string;
	}): Promise<void> {
		const idempotencyKey = `downstream:${data.txHash}`;
		if (await this.redisService.exists(idempotencyKey)) {
			this.logger.log(
				`Downstream service already called for txHash: ${data.txHash}`,
			);
			return;
		}

		const url = `${this.services.comagentBaseUrl}/api/deposit/${data.userId}/${data.address}/confirm`;
		const payload = {
			amount: parseInt(data.amount),
			transactionHash: data.txHash,
			network: NETWORK,
			currency: this.sui.coinType,
		};

		// Mark as processed BEFORE the HTTP call so a retry after a network failure does not double-call downstream.
		await this.redisService.set(
			idempotencyKey,
			'processed',
			DOWNSTREAM_DEDUPE_TTL_S,
		);

		try {
			const response = await firstValueFrom(
				this.httpService.post(url, payload, {
					headers: {
						'Content-Type': 'application/json',
						'X-Webhook-Secret': this.services.depositWebhookSecret,
					},
				}),
			);
			this.logger.log(
				`Deposit webhook OK for txHash: ${data.txHash}, response: ${JSON.stringify(response.data)}`,
			);
		} catch (error) {
			this.logger.error(
				`Deposit webhook call failed: ${error.message}`,
				error.stack,
			);
		}
	}
}
