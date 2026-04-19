export interface PaymentVerificationResult {
	ok: boolean;
	reason?: string;
	payment?: {
		from?: string;
		amount: string;
		txHash: string;
	};
}

export interface TransactionDetail {
	hash: string;
	from: string;
	to: string;
	value: string;
	amount: string;
	blockNumber: number;
	input?: string;
}
