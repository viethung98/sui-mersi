import { SetMetadata } from '@nestjs/common';

export const SUI_CHARGE_METADATA_KEY = 'sui_charge';

export interface SuiChargeOptions {
	amount: string;
	coinType?: string;
	description?: string;
}

export const SuiCharge = (options: SuiChargeOptions) =>
	SetMetadata(SUI_CHARGE_METADATA_KEY, options);
