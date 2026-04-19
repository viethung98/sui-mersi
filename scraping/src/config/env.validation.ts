import { plainToInstance } from 'class-transformer';
import {
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	validateSync,
} from 'class-validator';

enum Environment {
	Development = 'development',
	Production = 'production',
	Test = 'test',
}

class EnvironmentVariables {
	@IsEnum(Environment)
	NODE_ENV: Environment = Environment.Development;

	@IsNumber()
	@IsOptional()
	PORT: number;

	@IsString()
	@IsOptional()
	DB_URL: string;

	@IsString()
	@IsOptional()
	DB_DATABASE: string;

	@IsString()
	@IsOptional()
	REDIS_HOST: string;

	@IsNumber()
	@IsOptional()
	REDIS_PORT: number;

	@IsString()
	@IsOptional()
	REDIS_PASSWORD: string;

	@IsString()
	@IsOptional()
	SUI_NETWORK: string;

	@IsString()
	@IsOptional()
	SUI_RPC_URL: string;

	@IsString()
	@IsOptional()
	SUI_MERCHANT_ADDRESS: string;

	@IsString()
	@IsOptional()
	SUI_PAYMENT_AMOUNT_MIST: string;

	@IsString()
	@IsOptional()
	SUI_COIN_TYPE: string;

	@IsString()
	@IsOptional()
	SUI_REGISTRY_NAME: string;
}

export function validate(
	config: Record<string, unknown>,
): EnvironmentVariables {
	const validatedConfig = plainToInstance(EnvironmentVariables, config, {
		enableImplicitConversion: true,
	});
	const errors = validateSync(validatedConfig, {
		skipMissingProperties: true,
	});

	if (errors.length > 0) {
		const messages = errors
			.map((e) => Object.values(e.constraints || {}).join(', '))
			.join('\n');
		throw new Error(`Environment validation failed:\n${messages}`);
	}
	return validatedConfig;
}
