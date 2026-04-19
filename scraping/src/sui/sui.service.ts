import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import suiConfig from '../config/sui.config';

const importDynamic = new Function('specifier', 'return import(specifier)');

@Injectable()
export class SuiService implements OnModuleInit {
	private readonly logger = new Logger(SuiService.name);
	private client: any;
	private initialized = false;

	constructor(
		@Inject(suiConfig.KEY)
		private readonly sui: ConfigType<typeof suiConfig>,
	) {}

	async onModuleInit(): Promise<void> {
		if (!this.sui.merchantAddress) {
			this.logger.warn(
				'SUI_MERCHANT_ADDRESS is missing. Sui payment guard is disabled.',
			);
			return;
		}

		try {
			const { SuiGrpcClient } = await importDynamic('@mysten/sui/grpc');
			const { paymentKit } = await importDynamic('@mysten/payment-kit');

			this.client = new SuiGrpcClient({
				network: this.sui.network as 'testnet' | 'mainnet',
				baseUrl: this.sui.rpcUrl,
			}).$extend(paymentKit());

			this.initialized = true;
			this.logger.log(`Sui service initialized (${this.sui.network})`);
		} catch (error) {
			this.logger.error(
				`Failed to initialize Sui service: ${error?.message ?? error}`,
			);
		}
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	get instance(): any {
		return this.client;
	}
}
