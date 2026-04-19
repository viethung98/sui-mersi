/**
 * End-to-end test for the SuiCharge payment flow.
 *
 * Tests two verification paths:
 *  1. Registry-based (nonce): processRegistryPayment → x-sui-payment-nonce header
 *  2. Ephemeral (digest):     processEphemeralPayment → x-sui-payment-digest header
 *     + replay prevention test (same digest rejected)
 *
 * Usage:
 *   npx ts-node --skip-project --transpile-only scripts/test-sui-payment.ts
 *
 * Required env vars (in .env.dev):
 *   TEST_SUI_PRIVATE_KEY  Bech32 Sui private key (suiprivkey1...) or hex (64 chars)
 *   SUI_MERCHANT_ADDRESS  Must match the running server's SUI_MERCHANT_ADDRESS
 *   PORT                  Server port (default 3000)
 *
 * Get testnet SUI:
 *   npx @mysten/sui client faucet --address <your-address> --network testnet
 */

import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.dev' });

// Dynamic import helper for ESM-only packages
const importDynamic = new Function('specifier', 'return import(specifier)');

// ─── ANSI colours ──────────────────────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string) {
	passed++;
	console.log(`  ${green('✓')} ${label}${detail ? dim(' — ' + detail) : ''}`);
}

function fail(label: string, detail?: string) {
	failed++;
	console.log(`  ${red('✗')} ${label}${detail ? dim(' — ' + detail) : ''}`);
}

function section(title: string) {
	console.log(`\n${bold(title)}`);
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(url: string, headers: Record<string, string> = {}) {
	try {
		const res = await axios.get(url, { headers, validateStatus: () => true });
		return { status: res.status, data: res.data };
	} catch (e) {
		const err = e as AxiosError;
		return { status: err.response?.status ?? 0, data: err.response?.data };
	}
}

async function post(
	url: string,
	body: any,
	headers: Record<string, string> = {},
) {
	try {
		const res = await axios.post(url, body, {
			headers,
			validateStatus: () => true,
		});
		return { status: res.status, data: res.data };
	} catch (e) {
		const err = e as AxiosError;
		return { status: err.response?.status ?? 0, data: err.response?.data };
	}
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	// ── Dynamic ESM imports ────────────────────────────────────────────────────
	// Use SuiGrpcClient — same as the NestJS service; has full API (listCoins, etc.)
	const { SuiGrpcClient } = await importDynamic('@mysten/sui/grpc');
	const { Ed25519Keypair } = await importDynamic('@mysten/sui/keypairs/ed25519');
	const { decodeSuiPrivateKey } = await importDynamic(
		'@mysten/sui/cryptography',
	);
	const { paymentKit } = await importDynamic('@mysten/payment-kit');

	// ── Config ─────────────────────────────────────────────────────────────────
	const PORT = process.env.PORT || '3000';
	const BASE_URL = `http://localhost:${PORT}/api`;
	const SUI_RPC_URL =
		process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
	const MERCHANT = process.env.SUI_MERCHANT_ADDRESS || '';
	const COIN_TYPE = process.env.SUI_COIN_TYPE || '0x2::sui::SUI';
	const PRIVATE_KEY = process.env.TEST_SUI_PRIVATE_KEY || '';

	// ── Preflight checks ───────────────────────────────────────────────────────
	section('Preflight');

	if (!MERCHANT) {
		fail(
			'SUI_MERCHANT_ADDRESS is set',
			'Missing — SuiGuard is disabled; set it in .env.dev',
		);
		process.exit(1);
	}
	ok('SUI_MERCHANT_ADDRESS is set', MERCHANT.slice(0, 12) + '…');

	if (!PRIVATE_KEY) {
		fail(
			'TEST_SUI_PRIVATE_KEY is set',
			'Missing — add it to .env.dev (see script header)',
		);
		process.exit(1);
	}

	// ── Keypair setup ──────────────────────────────────────────────────────────
	let keypair: any;
	try {
		if (PRIVATE_KEY.startsWith('suiprivkey')) {
			// Bech32 format from `sui keytool generate ed25519`
			const { secretKey } = decodeSuiPrivateKey(PRIVATE_KEY);
			keypair = Ed25519Keypair.fromSecretKey(secretKey);
		} else {
			// Hex or raw bytes
			const bytes = Buffer.from(PRIVATE_KEY.replace('0x', ''), 'hex');
			keypair = Ed25519Keypair.fromSecretKey(bytes);
		}
		ok('Keypair loaded', keypair.toSuiAddress().slice(0, 12) + '…');
	} catch (e: any) {
		fail('Keypair loaded', `Invalid TEST_SUI_PRIVATE_KEY: ${e.message}`);
		process.exit(1);
	}

	const sender: string = keypair.toSuiAddress();

	// ── Sui client + PaymentKitClient ──────────────────────────────────────────
	// SuiGrpcClient.$extend(paymentKit()) gives us both the gRPC transport and
	// the Payment Kit plugin (tx.processRegistryPayment, tx.processEphemeralPayment, etc.)
	const suiClient = new SuiGrpcClient({
		network: 'testnet',
		baseUrl: SUI_RPC_URL,
	}).$extend(paymentKit());

	// Check balance via getBalance (SuiGrpcClient returns balance.balance in MIST)
	// Require at least 0.5 SUI to cover payment amounts + gas across all tests.
	const MIN_BALANCE_MIST = BigInt('500000000'); // 0.5 SUI
	try {
		const balanceRes = await suiClient.getBalance({ owner: sender });
		const totalMist = BigInt(balanceRes?.balance?.balance ?? '0');
		const totalSui = Number(totalMist) / 1_000_000_000;
		if (totalMist < MIN_BALANCE_MIST) {
			fail(
				'Wallet has sufficient SUI balance',
				`${totalSui.toFixed(4)} SUI — need ≥ 0.5 SUI; fund with: npx @mysten/sui client faucet --address ${sender} --network testnet`,
			);
			process.exit(1);
		}
		ok('Wallet has SUI balance', `${totalSui.toFixed(4)} SUI`);
	} catch (e: any) {
		fail('Wallet balance check', e.message);
		process.exit(1);
	}

	// // ── Server reachability ────────────────────────────────────────────────────
	// const health = await get(`http://localhost:${PORT}/health`);
	// if (health.status === 200) {
	// 	ok('Server is reachable', `localhost:${PORT}`);
	// } else {
	// 	fail(
	// 		'Server is reachable',
	// 		`Got ${health.status} — is the server running? (npm run dev)`,
	// 	);
	// 	process.exit(1);
	// }

	// ──────────────────────────────────────────────────────────────────────────
	// TEST 1: Challenge — no payment headers → 402
	// ──────────────────────────────────────────────────────────────────────────
	section('Test 1 — 402 Challenge (no payment headers)');

	const fakeOrderId = '00000000-0000-0000-0000-000000000001';
	const challenge1 = await get(`${BASE_URL}/orders/${fakeOrderId}`);

	if (challenge1.status === 402) {
		ok(
			'GET /orders/:id returns 402 when no headers',
			`status=${challenge1.status}`,
		);
	} else {
		fail(
			'GET /orders/:id returns 402 when no headers',
			`Got ${challenge1.status} — is SuiGuard active?`,
		);
	}

	const c1 = challenge1.data;
	if (c1?.type === 'sui-payment-required') {
		ok('Challenge type is sui-payment-required');
	} else {
		fail('Challenge type is sui-payment-required', `Got: ${c1?.type}`);
	}

	if (c1?.nonce && typeof c1.nonce === 'string') {
		ok('Challenge contains nonce', c1.nonce);
	} else {
		fail('Challenge contains nonce', 'Missing or invalid nonce');
	}

	if (c1?.amount) {
		ok(
			'Challenge contains amount',
			`${c1.amount} MIST (${Number(c1.amount) / 1e9} SUI)`,
		);
	} else {
		fail('Challenge contains amount');
	}

	if (c1?.recipient === MERCHANT) {
		ok('Challenge recipient matches SUI_MERCHANT_ADDRESS');
	} else {
		fail(
			'Challenge recipient matches SUI_MERCHANT_ADDRESS',
			`Got: ${c1?.recipient}`,
		);
	}

	// Also test checkout endpoint
	const challengeCheckout = await post(`${BASE_URL}/checkout`, {
		user_id: 'test-user',
		items: [],
	});

	if (challengeCheckout.status === 402) {
		ok('POST /checkout returns 402 when no headers');
	} else {
		fail(
			'POST /checkout returns 402 when no headers',
			`Got ${challengeCheckout.status}`,
		);
	}

	// ──────────────────────────────────────────────────────────────────────────
	// TEST 2: Registry-based payment (nonce flow)
	// ──────────────────────────────────────────────────────────────────────────
	section('Test 2 — Registry Payment (x-sui-payment-nonce)');

	const nonce: string = c1?.nonce;
	const amount = BigInt(c1?.amount || '500000000');
	const registryName: string | undefined = c1?.registryName;

	console.log(
		dim(`  → Building processRegistryPayment tx (nonce=${nonce.slice(0, 8)}…)`),
	);

	let registryDigest: string | undefined;
	try {
		// suiClient.paymentKit.tx is the Payment Kit transaction builder
		const tx = suiClient.paymentKit.tx.processRegistryPayment({
			sender,
			coinType: COIN_TYPE,
			nonce,
			amount,
			receiver: MERCHANT,
			...(registryName ? { registryName } : {}),
		});

		tx.setSender(sender);

		const result = await suiClient.signAndExecuteTransaction({
			signer: keypair,
			transaction: tx,
		});

		// signAndExecuteTransaction returns a discriminated union — digest lives
		// under result.Transaction or result.FailedTransaction, not at the top
		// level. Pass `result` directly so waitForTransaction can extract it.
		await suiClient.waitForTransaction({ result, timeout: 120_000 });

		const txRecord = result.Transaction ?? result.FailedTransaction!;
		if (result.$kind === 'FailedTransaction') {
			throw new Error(`Transaction failed on-chain: ${JSON.stringify(txRecord.status?.error)}`);
		}
		registryDigest = txRecord.digest;

		ok('Registry payment tx submitted', registryDigest);
	} catch (e: any) {
		fail('Registry payment tx submitted', e.message);
		console.log(
			yellow(`  ℹ  Skipping nonce verification test due to tx failure`),
		);
	}

	if (registryDigest) {
		// Retry original request with the nonce header
		const verified = await get(`${BASE_URL}/orders/${fakeOrderId}`, {
			'x-sui-payment-nonce': nonce,
		});

		if (verified.status !== 402) {
			ok(
				'GET /orders/:id accepted with x-sui-payment-nonce',
				`status=${verified.status}`,
			);
		} else {
			fail(
				'GET /orders/:id accepted with x-sui-payment-nonce',
				`Still got 402: ${JSON.stringify(verified.data)}`,
			);
		}
	}

	// ──────────────────────────────────────────────────────────────────────────
	// TEST 3: Ephemeral payment (digest flow)
	// ──────────────────────────────────────────────────────────────────────────
	section('Test 3 — Ephemeral Payment (x-sui-payment-digest)');

	// Use checkout endpoint so we get a fresh 402 challenge
	const challenge3 = await post(`${BASE_URL}/checkout`, {
		user_id: 'test-user',
		items: [],
	});

	const c3 = challenge3.data;
	const ephemeralNonce: string = c3?.nonce || crypto.randomUUID();
	const ephemeralAmount = BigInt(c3?.amount || '1000000000');

	console.log(
		dim(
			`  → Building processEphemeralPayment tx (nonce=${ephemeralNonce.slice(0, 8)}…)`,
		),
	);

	let ephemeralDigest: string | undefined;
	try {
		const tx = suiClient.paymentKit.tx.processEphemeralPayment({
			sender,
			coinType: COIN_TYPE,
			nonce: ephemeralNonce,
			amount: ephemeralAmount,
			receiver: MERCHANT,
		});

		tx.setSender(sender);

		const result = await suiClient.signAndExecuteTransaction({
			signer: keypair,
			transaction: tx,
		});

		await suiClient.waitForTransaction({ result, timeout: 120_000 });

		const txRecord = result.Transaction ?? result.FailedTransaction!;
		if (result.$kind === 'FailedTransaction') {
			throw new Error(`Transaction failed on-chain: ${JSON.stringify(txRecord.status?.error)}`);
		}
		ephemeralDigest = txRecord.digest;

		ok('Ephemeral payment tx submitted', ephemeralDigest);
	} catch (e: any) {
		fail('Ephemeral payment tx submitted', e.message);
		console.log(
			yellow(`  ℹ  Skipping digest verification tests due to tx failure`),
		);
	}

	if (ephemeralDigest) {
		// First request with digest → should pass guard (handler may return 4xx but guard passes)
		const verified = await post(
			`${BASE_URL}/checkout`,
			{ user_id: 'test-user', items: [] },
			{ 'x-sui-payment-digest': ephemeralDigest },
		);

		if (verified.status !== 402) {
			ok(
				'POST /checkout accepted with x-sui-payment-digest',
				`status=${verified.status}`,
			);
		} else {
			fail(
				'POST /checkout accepted with x-sui-payment-digest',
				`Still got 402: ${JSON.stringify(verified.data)}`,
			);
		}

		// ── TEST 4: Replay prevention ─────────────────────────────────────────
		section('Test 4 — Replay Prevention (same digest rejected)');

		const replay = await post(
			`${BASE_URL}/checkout`,
			{ user_id: 'test-user', items: [] },
			{ 'x-sui-payment-digest': ephemeralDigest },
		);

		if (replay.status === 402) {
			ok('Replay with same digest returns 402');
		} else {
			fail('Replay with same digest returns 402', `Got ${replay.status}`);
		}

		if (replay.data?.type === 'sui-payment-error') {
			ok('Replay response type is sui-payment-error');
		} else {
			fail(
				'Replay response type is sui-payment-error',
				`Got: ${replay.data?.type}`,
			);
		}

		if (replay.data?.reason === 'Payment digest already used') {
			ok('Replay reason is "Payment digest already used"');
		} else {
			fail(
				'Replay reason is "Payment digest already used"',
				`Got: ${replay.data?.reason}`,
			);
		}
	}

	// ── Summary ───────────────────────────────────────────────────────────────
	console.log('\n' + '─'.repeat(50));
	const total = passed + failed;
	if (failed === 0) {
		console.log(green(bold(`  All ${total} tests passed ✓`)));
	} else {
		console.log(
			`  ${green(`${passed} passed`)}  ${red(`${failed} failed`)}  of ${total} total`,
		);
	}
	console.log('─'.repeat(50) + '\n');

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error(red('Fatal error: ' + e.message));
	process.exit(1);
});
