import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
	databaseConfig,
	redisConfig,
	serverConfig,
	servicesConfig,
	suiConfig,
} from './config';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { SuiModule } from './sui/sui.module';
import { NormalizationModule } from './normalization/normalization.module';
import { PaymentModule } from './payment/payment.module';
import { RealtimeSearchModule } from './realtime-search/realtime-search.module';

@Module({
	imports: [
		ThrottlerModule.forRoot([
			{ ttl: 60_000, limit: 100 },
		]),
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
			cache: true,
			load: [
				serverConfig,
				databaseConfig,
				redisConfig,
				servicesConfig,
				suiConfig,
			],
			validate,
		}),
		DatabaseModule,
		NormalizationModule,
		RealtimeSearchModule,
		PaymentModule,
		SuiModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
