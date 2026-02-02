/**
 * TokenDiscoveryManager - On-Demand Pool Discovery
 * 
 * RESPONSIBILITY:
 * - Discover pools for tokens that have no pricing routes
 * - Batch discovery for efficiency (one pass, multiple tokens)
 * - Update pool registry and save to storage
 * - Track discovery attempts to avoid duplicate work
 * 
 * LAZY DISCOVERY TRIGGER:
 * - Called from MarketViewerService when insufficient-data detected
 * - Only discovers pools for tokens missing from pricingRoutes
 * - Caches discovery results (success or failure) for TTL window
 */

import { StorageService } from './StorageService';
import { EthersAdapter } from '../../infrastructure/adapters/EthersAdapter';
import { Token } from '../../domain/entities';
import { PoolRegistry, PoolMetadata, PricingRoute } from '../../domain/types';

interface DiscoveryAttempt {
  tokenAddress: string;
  chainId: number;
  attemptedAt: number;
  poolsFound: number;
  succeeded: boolean;
}

export class TokenDiscoveryManager {
  private discoveryAttempts: Map<string, DiscoveryAttempt> = new Map();
  private readonly DISCOVERY_RETRY_WINDOW = 5 * 60 * 1000; // 5 minutes - don't re-discover same token within this window
  private readonly FEE_TIERS = [100, 500, 3000, 10000];
  private readonly BASE_TOKENS: Record<number, string[]> = {
    1: [
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    ],
    137: [
      '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT
      '0x8f3cf7ad23cd3cadbd9735aff958023d60d76ee6', // DAI
      '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // WETH
      '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
    ],
  };

  constructor(
    private storageService: StorageService,
    private ethersAdapter: EthersAdapter,
  ) {}

  /**
   * Batch discover pools for multiple tokens
   * 
   * @param tokens Tokens to discover pools for
   * @param chainId Network chain ID
   * @returns Total number of pools discovered across all tokens
   */
  public async discoverPoolsForTokens(tokens: Token[], chainId: number): Promise<number> {
    console.log(`🔍 [BATCH DISCOVERY] Discovering pools for ${tokens.length} token(s) on chain ${chainId}`);
    
    // Load current registry
    const poolRegistry = await this.storageService.getPoolRegistry(chainId);
    let poolsDiscoveredThisBatch = 0;

    // Discover pools for each token
    for (const token of tokens) {
      const attemptKey = `${token.address.toLowerCase()}-${chainId}`;
      
      // Check if we've already tried discovering this token recently
      const lastAttempt = this.discoveryAttempts.get(attemptKey);
      if (lastAttempt && (Date.now() - lastAttempt.attemptedAt) < this.DISCOVERY_RETRY_WINDOW) {
        console.log(`⏭️  Skipping ${token.symbol}: already attempted ${Math.round((Date.now() - lastAttempt.attemptedAt) / 1000)}s ago`);
        continue;
      }

      console.log(`\n🔎 Discovering pools for ${token.symbol}...`);
      let poolsFoundForToken = 0;

      // Try pairing with each base token
      const baseTokens = this.BASE_TOKENS[chainId] || [];
      for (const baseToken of baseTokens) {
        // Try each fee tier
        for (const fee of this.FEE_TIERS) {
          try {
            // Create Token objects for EthersAdapter
            const tokenAFull: Token = { 
              address: token.address, 
              symbol: token.symbol, 
              name: token.name || token.symbol,
              decimals: token.decimals, 
              chainId 
            };
            const tokenBFull: Token = { 
              address: baseToken, 
              symbol: 'BASE', 
              name: 'BASE',
              decimals: 18, 
              chainId 
            };
            const poolAddress = await this.ethersAdapter.getPoolAddress(tokenAFull, tokenBFull, chainId, fee);
            
            if (poolAddress) {
              // Fetch pool state to get token0/token1
              const poolState = await this.ethersAdapter.getPoolState(poolAddress, chainId);
              
              // Add to registry
              this.addPoolToRegistry(poolRegistry, poolAddress, poolState, fee);
              poolsFoundForToken++;
              poolsDiscoveredThisBatch++;
              
              console.log(`     ✓ Pool found: ${poolAddress.slice(0,6)}... (${poolState.token0.slice(0,6)}...-${poolState.token1.slice(0,6)}...)`);
            }

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error: any) {
            // Pool doesn't exist - normal case
          }
        }
      }

      // Record discovery attempt
      this.discoveryAttempts.set(attemptKey, {
        tokenAddress: token.address,
        chainId,
        attemptedAt: Date.now(),
        poolsFound: poolsFoundForToken,
        succeeded: poolsFoundForToken > 0,
      });

      console.log(`   → Found ${poolsFoundForToken} pool(s) for ${token.symbol}`);
    }

    // Save updated registry
    await this.storageService.savePoolRegistry(chainId, poolRegistry);
    console.log(`\n✅ [BATCH DISCOVERY] Complete: ${poolsDiscoveredThisBatch} total pools discovered`);
    
    return poolsDiscoveredThisBatch;
  }

  /**
   * Add a discovered pool to the pool registry
   * 
   * Creates pool metadata and pricing routes for both tokens in the pool.
   */
  private addPoolToRegistry(
    registry: PoolRegistry,
    poolAddress: string,
    poolState: any,
    fee: number | undefined
  ): void {
    const { token0, token1 } = poolState;

    // Determine DEX type from fee (V3 has fee, V2 doesn't)
    const dexType = fee ? "v3" : "v2";
    const weight = dexType === "v3" ? 2 : 1;

    // Create pool metadata
    const poolMetadata: PoolMetadata = {
      address: poolAddress,
      dexType,
      token0,
      token1,
      feeTier: fee,
      weight,
    };

    // Add to registry
    registry.pools[poolAddress] = poolMetadata;

    // Create pricing routes with NORMALIZED (lowercase) keys
    const token0Lower = token0.toLowerCase();
    const token1Lower = token1.toLowerCase();

    if (!registry.pricingRoutes[token0Lower]) {
      registry.pricingRoutes[token0Lower] = [];
    }
    if (!registry.pricingRoutes[token1Lower]) {
      registry.pricingRoutes[token1Lower] = [];
    }

    // Add route from token0 to token1
    registry.pricingRoutes[token0Lower].push({
      pool: poolAddress,
      base: token1,
    });

    // Add route from token1 to token0
    registry.pricingRoutes[token1Lower].push({
      pool: poolAddress,
      base: token0,
    });
  }
}
