import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Param,
	Post,
} from '@nestjs/common';
import { ApiResponse } from '../common/dto/response.dto';
import { VerifyTransactionDto, VerifyTransactionRequestDto } from './dto';
import { TransactionService } from './transaction.service';

const TX_HASH_PATTERN = /^[0-9a-zA-Z]+$/;
const TX_HASH_MAX_LENGTH = 200;

@Controller('payment')
export class PaymentController {
	constructor(private readonly transactionService: TransactionService) {}

	@Post('verify')
	async verifyTransaction(
		@Body() dto: VerifyTransactionRequestDto,
	): Promise<ApiResponse<VerifyTransactionDto>> {
		return this.transactionService.verifyTransaction(dto);
	}

	@Get('transaction/:txHash')
	async getTransactionDetails(
		@Param('txHash') txHash: string,
	): Promise<ApiResponse<any>> {
		if (
			!txHash ||
			txHash.length > TX_HASH_MAX_LENGTH ||
			!TX_HASH_PATTERN.test(txHash)
		) {
			throw new BadRequestException('Invalid transaction hash format');
		}
		const data = await this.transactionService.getTransactionDetails(txHash);
		return ApiResponse.success(data, 200, 'Transaction details retrieved');
	}
}
