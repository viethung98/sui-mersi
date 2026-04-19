import { SearchFilters } from '@/common/interfaces';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApifyClient } from 'apify-client';
import servicesConfig from '../config/services.config';

const ACTOR_ID = 'apify/e-commerce-scraping-tool';
const ACTOR_TIMEOUT_S = 300;
const COUNTRY_CODE = 'vn';

const SORT_MAP: Record<string, string> = {
	price_asc: 'price-asc-rank',
	price_desc: 'price-desc-rank',
	rating: 'review-rank',
	newest: 'date-desc-rank',
	popular: 'exact-aware-popularity-rank',
	relevance: 'relevanceblender',
};

const CONDITION_MAP: Record<string, string> = {
	new: 'p_n_condition-type:6461716011',
	used: 'p_n_condition-type:6461718011',
	refurbished: 'p_n_condition-type:6461717011',
};

const PRIME_RH = 'p_85:2470955011';

interface ApifyActorInput {
	listingUrls?: Array<{ url: string }>;
	detailsUrls?: Array<{ url: string }>;
	maxProductResults: number;
	countryCode: string;
	scrapeMode: string;
	additionalProperties: boolean;
	additionalPropertiesSearchEngine: boolean;
	additionalReviewProperties: boolean;
	scrapeInfluencerProducts: boolean;
	scrapeReviewsDelivery: boolean;
	sortReview: string;
}

@Injectable()
export class ApifyClientService {
	private readonly logger = new Logger(ApifyClientService.name);
	private readonly client: ApifyClient;

	constructor(
		@Inject(servicesConfig.KEY)
		private readonly services: ConfigType<typeof servicesConfig>,
	) {
		this.client = new ApifyClient({ token: this.services.apifyApiToken });
	}

	async searchAmazon(
		query: string,
		filters: SearchFilters,
		options?: { limit?: number; page?: number },
	): Promise<{
		success: boolean;
		data: { items: any[]; total?: number };
		timestamp: string;
		source: string;
	}> {
		const { limit = 20, page = 1 } = options || {};
		const url = this.buildAmazonSearchUrl(query, filters, page);

		const input: ApifyActorInput = {
			listingUrls: [{ url }],
			maxProductResults: limit,
			countryCode: COUNTRY_CODE,
			scrapeMode: 'AUTO',
			additionalProperties: true,
			additionalPropertiesSearchEngine: true,
			additionalReviewProperties: false,
			scrapeInfluencerProducts: false,
			scrapeReviewsDelivery: false,
			sortReview: 'Most recent',
		};

		try {
			const results = await this.runActor(input);
			this.logger.log(`Apify search completed: ${results.items.length} results`);
			return {
				success: true,
				data: results,
				timestamp: new Date().toISOString(),
				source: 'apify',
			};
		} catch (error) {
			this.logger.error(`Apify search failed: ${error.message}`, error.stack);
			throw new Error(`Apify search failed: ${error.message}`);
		}
	}

	async getProductByAsin(asin: string): Promise<any> {
		this.logger.log(`Apify product request: ${asin}`);
		const input: ApifyActorInput = {
			detailsUrls: [{ url: `https://www.amazon.com/dp/${asin}` }],
			maxProductResults: 1,
			countryCode: COUNTRY_CODE,
			scrapeMode: 'AUTO',
			additionalProperties: true,
			additionalPropertiesSearchEngine: false,
			additionalReviewProperties: false,
			scrapeInfluencerProducts: false,
			scrapeReviewsDelivery: false,
			sortReview: 'Most recent',
		};

		try {
			const results = await this.runActor(input);
			if (results.items.length === 0) {
				throw new Error(`Product ${asin} not found`);
			}
			return results.items[0];
		} catch (error) {
			this.logger.error(`Apify product fetch failed: ${error.message}`);
			throw new Error(`Apify product fetch failed: ${error.message}`);
		}
	}

	async healthCheck(): Promise<boolean> {
		try {
			await this.client.user().get();
			return true;
		} catch (error) {
			this.logger.warn(`Apify health check failed: ${error.message}`);
			return false;
		}
	}

	buildAmazonSearchUrl(
		query: string,
		filters: SearchFilters,
		page = 1,
	): string {
		const keywordParts = [
			query,
			filters.category,
			filters.brand,
			filters.color,
			filters.size,
		].filter((part): part is string => Boolean(part));

		const params = new URLSearchParams();
		params.set('k', keywordParts.join(' '));

		if (filters.sortBy && SORT_MAP[filters.sortBy]) {
			params.set('s', SORT_MAP[filters.sortBy]);
		}
		if (filters.minPrice !== undefined) {
			params.set('low-price', String(filters.minPrice));
		}
		if (filters.maxPrice !== undefined) {
			params.set('high-price', String(filters.maxPrice));
		}

		const rhFilters: string[] = [];
		if (filters.prime) rhFilters.push(PRIME_RH);
		if (filters.condition && CONDITION_MAP[filters.condition]) {
			rhFilters.push(CONDITION_MAP[filters.condition]);
		}
		if (rhFilters.length > 0) {
			params.set('rh', rhFilters.join(','));
		}

		if (page > 1) {
			params.set('page', String(page));
		}

		return `https://www.amazon.com/s?${params.toString()}`;
	}

	private async runActor(input: ApifyActorInput): Promise<{ items: any[] }> {
		const run = await this.client
			.actor(ACTOR_ID)
			.call(input, { timeout: ACTOR_TIMEOUT_S });
		const dataset = await this.client.dataset(run.defaultDatasetId || run.id);
		return dataset.listItems();
	}
}
