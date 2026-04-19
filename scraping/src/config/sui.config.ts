import { registerAs } from '@nestjs/config';

export default registerAs('sui', () => ({
	network: process.env.SUI_NETWORK || 'testnet',
	rpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
	merchantAddress: process.env.SUI_MERCHANT_ADDRESS || '',
	paymentAmountMist: process.env.SUI_PAYMENT_AMOUNT_MIST || '100000000',
	coinType: process.env.SUI_COIN_TYPE || '0x2::sui::SUI',
	registryName: process.env.SUI_REGISTRY_NAME || undefined,
}));
