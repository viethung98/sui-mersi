import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyTransactionRequestDto {
	@ApiProperty({
		description: 'The transaction hash to verify',
		example: '0x123abc...',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	txHash: string;

	@ApiProperty({
		description: 'The ID of the user making the request',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	userId: string;
}

export class VerifyTransactionDto {
	@ApiProperty({
		description: 'The recipient address of the transaction',
	})
	receiver: string;

	@ApiProperty({
		description: 'The amount transferred in the transaction',
		example: 100.5,
	})
	amount: number;

	@ApiProperty({
		description: 'The ID of the user making the request',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	userId: string;
}
