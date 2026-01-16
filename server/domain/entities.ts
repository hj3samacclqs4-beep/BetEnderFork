// === Domain Layer: Entities ===

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
}

export interface Pool {
  address: string;
  token0: Token;
  token1: Token;
  reserve0: bigint;
  reserve1: bigint;
  feeTier: number;
}

export interface SnapshotEntry {
  token: Token;
  priceUSD: number;
  liquidityUSD: number;
  volumeUSD: number;
  marketCapUSD: number;
}

export interface ChainSnapshot {
  timestamp: number;
  chain: string;
  entries: SnapshotEntry[];
}
