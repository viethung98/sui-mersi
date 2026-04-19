export interface NormalizedProduct {
	asin: string;
	title: string;
	description?: string;
	brand?: string;
	category?: string;
	price?: number;
	originalPrice?: number;
	discountPercent?: number;
	rating?: number;
	reviewCount?: number;
	available: boolean;
	images: string[];
	productUrl: string;
	seller?: string;
	fulfillment?: string;
	features?: string[];
	specifications?: Record<string, any>;
	lastUpdated: Date;
}

export interface RawAmazonProduct {
	asin?: string;
	url?: string;
	title?: string;
	description?: string;
	brand?: string;
	price?: string | number;
	listPrice?: string | number;
	discount?: string | number;
	rating?: string | number;
	reviewsCount?: string | number;
	availability?: string;
	images?: string[];
	seller?: string;
	isPrime?: boolean;
	[key: string]: any;
}

export interface SearchFilters {
	category?: string;
	brand?: string;
	minPrice?: number;
	maxPrice?: number;
	minRating?: number;
	maxRating?: number;
	minReviewCount?: number;
	available?: boolean;
	fulfillment?: string;
	color?: string;
	size?: string;
	brands?: string[];
	categories?: string[];
	freeShipping?: boolean;
	prime?: boolean;
	onSale?: boolean;
	features?: string[];
	condition?: 'new' | 'used' | 'refurbished';
	sortBy?:
		| 'price_asc'
		| 'price_desc'
		| 'rating'
		| 'newest'
		| 'popular'
		| 'relevance';
}

export interface SearchResult {
	products: NormalizedProduct[];
	total: number;
	page: number;
	limit: number;
	totalPage: number;
	source: 'cached' | 'realtime' | 'hybrid';
	query: string;
	executionTime: number;
}
