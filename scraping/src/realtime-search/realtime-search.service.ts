import { Injectable, Logger } from '@nestjs/common';
import { SearchFilters, SearchResult } from '../common/interfaces';
import { NormalizationService } from '../normalization/normalization.service';
import { ApifyClientService } from './apify-client.service';

@Injectable()
export class RealtimeSearchService {
	private readonly logger = new Logger(RealtimeSearchService.name);

	constructor(
		private readonly apifyClient: ApifyClientService,
		private readonly normalization: NormalizationService,
	) {}

	async search(
		query: string,
		filters?: SearchFilters,
		page = 1,
		limit = 20,
	): Promise<SearchResult> {
		const startTime = Date.now();

		try {
			const apifyResponse = await this.apifyClient.searchAmazon(
				query,
				filters ?? {},
				{ limit, page },
			);
			this.logger.debug(`Apify raw items: ${apifyResponse.data.items.length}`);

			const normalizedProducts = this.normalization.normalizeAndValidate(
				apifyResponse.data.items,
			);
			this.logger.debug(
				`After normalization: ${normalizedProducts.length} products`,
			);

			const total = normalizedProducts.length;
			return {
				products: normalizedProducts,
				total,
				page,
				limit,
				totalPage: Math.ceil(total / limit),
				source: 'realtime',
				query,
				executionTime: Date.now() - startTime,
			};
		} catch (error) {
			this.logger.error(`Realtime search failed: ${error.message}`, error.stack);
			throw error;
		}
	}

	async getProductByAsin(asin: string): Promise<any> {
		try {
			this.logger.log(`Realtime product fetch: ${asin}`);
			const rawProduct = await this.apifyClient.getProductByAsin(asin);
			const normalized = this.normalization.normalize(rawProduct);
			if (!normalized) {
				throw new Error(`Failed to normalize product ${asin}`);
			}
			return normalized;
		} catch (error) {
			this.logger.error(`Realtime product fetch failed: ${error.message}`);
			throw error;
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			return await this.apifyClient.healthCheck();
		} catch {
			return false;
		}
	}
}
