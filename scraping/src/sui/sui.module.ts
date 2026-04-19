import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RedisModule } from '../common/redis.module';
import { SuiGuard } from './sui.guard';
import { SuiService } from './sui.service';
import { SuiVerificationService } from './sui-verification.service';

@Module({
	imports: [RedisModule],
	providers: [
		SuiService,
		SuiVerificationService,
		SuiGuard,
		{ provide: APP_GUARD, useClass: SuiGuard },
	],
	exports: [SuiService, SuiVerificationService, SuiGuard],
})
export class SuiModule {}
