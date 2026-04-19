export const SUI_USDC_COIN_TYPE = '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC' as const

const DECIMALS = 6

function normalizeCoinType(coinType: string): string {
  const value = coinType.trim()
  if (!value) return value
  return (value.startsWith("0x") ? value : `0x${value}`).toLowerCase()
}

export const USDC = {
  coinType: SUI_USDC_COIN_TYPE,
  decimals: DECIMALS,
  multiplier: 1_000_000n,

  fromMists(mists: bigint): number {
    return Number(mists) / Number(this.multiplier)
  },

  toMists(usdc: number): bigint {
    return BigInt(Math.round(usdc * Number(this.multiplier)))
  },

  format(mists: bigint): string {
    const value = this.fromMists(mists)
    return value.toFixed(2)
  },

  isCoinType(coinType: string): boolean {
    return normalizeCoinType(coinType) === normalizeCoinType(this.coinType)
  },
} as const

