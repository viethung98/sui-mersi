import { Injectable, Logger } from '@nestjs/common';
import { NormalizedProduct, RawAmazonProduct } from '../common/interfaces';
import {
	calculateDiscount,
	cleanText,
	extractAsin,
	isAvailable,
	parsePrice,
	parseRating,
	parseReviewCount,
} from '../common/utils/helpers';

@Injectable()
export class NormalizationService {
	private readonly logger = new Logger(NormalizationService.name);

	normalize(raw: any): NormalizedProduct | null {
		try {
			const isApifyFormat =
				(raw.additionalProperties &&
					typeof raw.additionalProperties === 'object') ||
				raw.offers !== undefined ||
				(raw.name !== undefined && raw.image !== undefined);

			let asin: string | undefined;
			let title: string | undefined;
			let price: any;
			let listPrice: any;
			let rating: any;
			let reviewsCount: any;
			let availability: any;
			let brand: string | undefined;
			let category: string | undefined;
			let description: string | undefined;
			let url: string | undefined;
			let images: string[];

			if (isApifyFormat) {
				asin =
					raw.additionalProperties?.asin ||
					raw.asin ||
					raw.id ||
					(raw.url ? extractAsin(raw.url) : null) ||
					(raw.productUrl ? extractAsin(raw.productUrl) : null);

				title = cleanText(raw.name || raw.title);
				price =
					raw.offers?.price ??
					raw.price ??
					raw.currentPrice ??
					raw.salePrice;
				listPrice =
					raw.additionalProperties?.listPrice?.value ??
					raw.listPrice ??
					raw.originalPrice ??
					raw.wasPrice;
				rating =
					raw.additionalProperties?.stars ??
					raw.stars ??
					raw.rating ??
					raw.aggregateRating?.ratingValue;
				reviewsCount =
					raw.additionalProperties?.reviewsCount ??
					raw.reviewsCount ??
					raw.reviewCount ??
					raw.aggregateRating?.reviewCount;
				availability =
					raw.additionalProperties?.inStock ??
					raw.inStock ??
					raw.availability ??
					(raw.offers?.availability
						? raw.offers.availability.includes('InStock')
						: true);
				brand = cleanText(
					raw.brand?.name || raw.brand?.slogan || raw.brand,
				);
				category = this.extractCategoryFromBreadcrumbs(
					raw.additionalProperties?.breadCrumbs || raw.breadcrumbs,
				);
				description = cleanText(raw.description);
				url = raw.url || raw.productUrl;
				images = this.extractApifyImages(raw);
			} else {
				asin = raw.asin || (raw.url ? extractAsin(raw.url) : null);
				title = cleanText(raw.title);
				price = raw.price;
				listPrice = raw.listPrice || raw.price;
				rating = raw.rating;
				reviewsCount = raw.reviewsCount;
				availability = raw.availability;
				brand = cleanText(raw.brand);
				category = raw.category;
				description = cleanText(raw.description);
				url = raw.url;
				images = raw.images || [];
			}

			if (!asin) {
				this.logger.warn('Product missing ASIN, skipping');
				return null;
			}

			const currentPrice = parsePrice(price);
			const originalPrice = parsePrice(listPrice);
			const parsedRating = parseRating(rating);
			const reviewCount = parseReviewCount(reviewsCount);
			const discountPercent =
				currentPrice && originalPrice
					? calculateDiscount(originalPrice, currentPrice)
					: 0;
			const available = isAvailable(availability);

			const extractedImages = isApifyFormat
				? images
				: this.extractImages(raw);
			const features = isApifyFormat
				? this.extractFeaturesFromApify(raw.additionalProperties?.features)
				: this.extractFeatures(raw);
			const specifications = isApifyFormat
				? this.extractSpecificationsFromAttributes(
						raw.additionalProperties?.attributes || [],
					)
				: this.extractSpecifications(raw);

			return {
				asin,
				title: title || 'Unknown Product',
				description: description || undefined,
				brand: brand || undefined,
				category: category || undefined,
				price: currentPrice ?? undefined,
				originalPrice:
					currentPrice !== originalPrice ? (originalPrice ?? undefined) : undefined,
				discountPercent: discountPercent > 0 ? discountPercent : undefined,
				rating: parsedRating ?? undefined,
				reviewCount: reviewCount ?? undefined,
				available,
				images: extractedImages,
				productUrl: url || `https://www.amazon.com/dp/${asin}`,
				seller: cleanText(raw.seller?.name || raw.seller) || undefined,
				fulfillment: raw.isPrime ? 'Prime' : undefined,
				features: features && features.length > 0 ? features : undefined,
				specifications:
					specifications && Object.keys(specifications).length > 0
						? specifications
						: undefined,
				lastUpdated: new Date(),
			};
		} catch (error) {
			this.logger.error(
				`Failed to normalize product: ${error.message}`,
				error.stack,
			);
			return null;
		}
	}

	normalizeAndValidate(rawProducts: any[]): NormalizedProduct[] {
		this.logger.log(`Normalizing ${rawProducts.length} products...`);

		const normalized: NormalizedProduct[] = [];
		for (const raw of rawProducts) {
			const product = this.normalize(raw);
			if (product && this.validate(product)) {
				normalized.push(product);
			} else if (process.env.LOG_LEVEL === 'debug') {
				// JSON.stringify in a hot loop is expensive; only build payload when actually logging.
				this.logger.debug(
					`Skipped item: ${JSON.stringify({ name: raw.name, title: raw.title, url: raw.url, keys: Object.keys(raw).slice(0, 10) })}`,
				);
			}
		}

		this.logger.log(
			`Successfully normalized ${normalized.length}/${rawProducts.length} products`,
		);
		return normalized;
	}

	private validate(product: NormalizedProduct): boolean {
		if (!product.asin) {
			this.logger.warn(`Missing ASIN, skipping product: ${product.title}`);
			return false;
		}
		if (!product.title || product.title.length < 3) {
			this.logger.warn(`Invalid title for ASIN ${product.asin}`);
			return false;
		}
		if (
			product.rating !== undefined &&
			product.rating !== null &&
			(product.rating < 0 || product.rating > 5)
		) {
			this.logger.warn(
				`Invalid rating for ASIN ${product.asin}: ${product.rating}`,
			);
			return false;
		}
		return true;
	}

	private extractApifyImages(raw: any): string[] {
		const images: string[] = [];

		if (typeof raw.image === 'string' && raw.image) {
			images.push(raw.image);
		}
		if (Array.isArray(raw.images)) {
			for (const img of raw.images) {
				if (typeof img === 'string' && img) images.push(img);
				else if (typeof img === 'object' && img?.url) images.push(img.url);
			}
		}
		if (
			typeof raw.thumbnail === 'string' &&
			raw.thumbnail &&
			images.length === 0
		) {
			images.push(raw.thumbnail);
		}
		if (Array.isArray(raw.additionalProperties?.images)) {
			for (const img of raw.additionalProperties.images) {
				if (typeof img === 'string' && img) images.push(img);
				else if (typeof img === 'object' && img?.url) images.push(img.url);
			}
		}

		return [...new Set(images)];
	}

	private extractImages(raw: RawAmazonProduct): string[] {
		if (Array.isArray(raw.images)) {
			return raw.images.filter(
				(img) => typeof img === 'string' && img.length > 0,
			);
		}
		if (typeof raw.images === 'string') {
			return [raw.images];
		}
		const imageFields = ['image', 'imageUrl', 'thumbnail', 'mainImage'];
		for (const field of imageFields) {
			if (raw[field] && typeof raw[field] === 'string') {
				return [raw[field]];
			}
		}
		return [];
	}

	private extractFeatures(raw: RawAmazonProduct): string[] | undefined {
		const source = Array.isArray(raw.features)
			? raw.features
			: Array.isArray(raw.bulletPoints)
				? raw.bulletPoints
				: null;
		if (!source || source.length === 0) return undefined;

		const cleaned = source
			.map((f) => cleanText(f))
			.filter((f): f is string => !!f && f.length > 0);
		return cleaned.length > 0 ? cleaned : undefined;
	}

	private extractSpecifications(
		raw: RawAmazonProduct,
	): Record<string, any> | undefined {
		const candidates = [raw.specifications, raw.productDetails];
		for (const candidate of candidates) {
			if (
				candidate &&
				typeof candidate === 'object' &&
				Object.keys(candidate).length > 0
			) {
				return candidate;
			}
		}
		return undefined;
	}

	private extractCategoryFromBreadcrumbs(
		breadCrumbs?: string,
	): string | undefined {
		if (!breadCrumbs) return undefined;

		const meaningful = breadCrumbs
			.split(/[>|,]/)
			.map((cat) => cleanText(cat.trim()))
			.filter(
				(cat): cat is string =>
					!!cat &&
					cat.length > 2 &&
					!cat.toLowerCase().includes('amazon') &&
					!cat.toLowerCase().includes('all'),
			);

		return meaningful.length > 0 ? meaningful[meaningful.length - 1] : undefined;
	}

	private extractSpecificationsFromAttributes(
		attributes?: any[],
	): Record<string, any> | undefined {
		if (!Array.isArray(attributes) || attributes.length === 0) return undefined;

		const specs: Record<string, any> = {};
		for (const attr of attributes) {
			const key = cleanText(attr?.key);
			if (key && attr.value !== undefined && attr.value !== null) {
				specs[key] = attr.value;
			}
		}
		return Object.keys(specs).length > 0 ? specs : undefined;
	}

	private extractFeaturesFromApify(features?: any[]): string[] | undefined {
		if (!Array.isArray(features) || features.length === 0) return undefined;

		const cleaned = features
			.map((f) => cleanText(f))
			.filter((f): f is string => !!f && f.length > 0);
		return cleaned.length > 0 ? cleaned : undefined;
	}
}
