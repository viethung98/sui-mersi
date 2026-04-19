import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../common/redis.module';
import { TransactionEntity } from '../database/entities';
import { SuiModule } from '../sui/sui.module';
import { PaymentController } from './payment.controller';
import { TransactionService } from './transaction.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([TransactionEntity]),
		HttpModule,
		SuiModule,
		RedisModule,
	],
	providers: [TransactionService],
	controllers: [PaymentController],
	exports: [TransactionService],
})
export class PaymentModule {}
