import { registerAs } from '@nestjs/config';

export default registerAs('services', () => ({
	apifyApiToken: process.env.APIFY_API_TOKEN || '',
	comagentBaseUrl: process.env.COMAGENT_BASE_URL || 'http://localhost:3001',
	depositWebhookSecret: process.env.DEPOSIT_WEBHOOK_SECRET || '',
}));
