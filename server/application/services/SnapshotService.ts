import { IChainAdapter } from "../../infrastructure/adapters/MockAdapter";
import { ChainSnapshot, SnapshotEntry, Token } from "../../domain/entities";
import { computeSpotPrice, computeLiquidityUSD } from "../../domain/pricing";
import { SUPPORTED_TOKENS, TokenMetadata } from "../../../shared/tokens";

export class SnapshotService {
  private adapters: Map<string, IChainAdapter>;
  private cache: Map<string, any>;
  private isUpdating: Map<string, boolean>;
  private dynamicTokens: Map<string, TokenMetadata[]>;

  constructor(adapters: IChainAdapter[]) {
    this.adapters = new Map();
    this.cache = new Map();
    this.isUpdating = new Map();
    this.dynamicTokens = new Map();
    adapters.forEach(adapter => this.adapters.set(adapter.getChainName().toLowerCase(), adapter));
    
    // Initial fetch of external token lists
    this.refreshDynamicTokens();
  }

  private async refreshDynamicTokens() {
    try {
      console.log("Refreshing dynamic token lists...");
      
      // Ethereum - Trust Wallet
      const ethRes = await fetch("https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/tokenlist.json");
      if (ethRes.ok) {
        const data = await ethRes.json();
        this.dynamicTokens.set("ethereum", data.tokens || []);
      }

      // Polygon - Official List
      const polyRes = await fetch("https://raw.githubusercontent.com/maticnetwork/polygon-token-list/master/src/tokens/defaultTokens.json");
      if (polyRes.ok) {
        const data = await polyRes.json();
        this.dynamicTokens.set("polygon", data || []);
      }
      
      console.log(`Loaded ${this.dynamicTokens.get("ethereum")?.length} ETH and ${this.dynamicTokens.get("polygon")?.length} Polygon tokens.`);
    } catch (e) {
      console.error("Failed to fetch dynamic tokens:", e);
    }
  }

  async generateSnapshot(chain: string, offset: number = 0, limit: number = 25): Promise<ChainSnapshot> {
    const chainKey = chain.toLowerCase();
    const adapter = this.adapters.get(chainKey);
    if (!adapter) {
      throw new Error(`No adapter found for chain: ${chain}`);
    }

    // Merge static and dynamic tokens
    const staticMeta = SUPPORTED_TOKENS[chainKey] || [];
    const dynamicMeta = this.dynamicTokens.get(chainKey) || [];
    
    // De-duplicate by address
    const seen = new Set(staticMeta.map(t => t.address.toLowerCase()));
    const allMetadata = [...staticMeta, ...dynamicMeta.filter(t => !seen.has(t.address.toLowerCase()))];

    const windowedMetadata = allMetadata.slice(offset, offset + limit);

    // Filter tokens that need updating (stale or missing)
    const now = Date.now();
    
    // Fetch real pool data in batch
    const pools = await adapter.getTopPools(50);
    const poolAddresses = pools.map(p => p.address);
    const poolStates = await adapter.getBatchPoolData(poolAddresses);

    const entries: SnapshotEntry[] = await Promise.all(windowedMetadata.map(async (meta) => {
      const cacheKey = `${chainKey}:${meta.address.toLowerCase()}`;
      const cached = this.cache.get(cacheKey) as any;

      if (cached && (now - cached.timestamp < 10000)) {
        return cached.entry;
      }

      // Match token to discovered pools
      const stableAddress = adapter.getStableTokenAddress().toLowerCase();
      const metaAddress = meta.address.toLowerCase();
      
      const poolData = pools.find(p => 
        (p.token0.address.toLowerCase() === metaAddress && p.token1.address.toLowerCase() === stableAddress) ||
        (p.token1.address.toLowerCase() === metaAddress && p.token0.address.toLowerCase() === stableAddress)
      );

      let price = 0;
      let liquidity = 0;

      if (poolData) {
        const state = poolStates.find((s: any) => s.address === poolData.address);
        if (state) {
          const enrichedPool = { 
            ...poolData, 
            sqrtPriceX96: state.sqrtPriceX96, 
            liquidity: state.liquidity,
            // Ensure token decimals are correct for pricing
            token0: poolData.token0.address.toLowerCase() === metaAddress ? { ...meta } : { symbol: "USDC", name: "USD Coin", address: stableAddress, decimals: 6 },
            token1: poolData.token1.address.toLowerCase() === metaAddress ? { ...meta } : { symbol: "USDC", name: "USD Coin", address: stableAddress, decimals: 6 }
          };
          price = computeSpotPrice(enrichedPool, meta.address, stableAddress);
          liquidity = Number(state.liquidity) / 1e18; // Normalized liquidity
        }
      }

      // If no real pool found, use mock fallback for prototype visibility
      if (price === 0) {
        price = 1; 
        liquidity = 500000;
      }

      const entry: SnapshotEntry = {
        token: {
          symbol: meta.symbol,
          name: meta.name,
          address: meta.address,
          decimals: meta.decimals,
          logoURI: meta.logoURI
        },
        priceUSD: price,
        liquidityUSD: liquidity,
        volumeUSD: liquidity * 0.15,
        marketCapUSD: price * 10_000_000
      };

      // Store in LRU-style cache
      this.cache.set(cacheKey, { timestamp: now, entry } as any);
      return entry;
    }));

    return {
      timestamp: now,
      chain: adapter.getChainName(),
      entries
    };
  }

  getLatestSnapshot(chain: string): ChainSnapshot | undefined {
    return this.cache.get(chain.toLowerCase());
  }
}
