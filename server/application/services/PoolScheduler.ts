/**
 * PHASE 3: PoolScheduler - Tiered Pool Refresh Scheduling
 * 
 * RESPONSIBILITY:
 * - Continuously check PoolController for pools due refresh
 * - Execute multicall queries for scheduled pools
 * - Update pool tiers based on price volatility
 * - Reschedule next refresh based on tier
 * 
 * ARCHITECTURE:
 * - Main loop checks every 1 second (not 10s global interval)
 * - Each pool has independent refresh cadence
 * - Volatility-based tier transitions (5s / 10s / 30s)
 * - Self-adjusting (no external configuration needed)
 * 
 * PHASE 4: Integration with MulticallEngine
 * - Scheduler gets pools due refresh
 * - Passes to MulticallEngine for batching
 * - MulticallEngine handles weight-aware chunking
 * - Results processed for tier updates and caching
 */

import { poolController, AlivePool } from './PoolController';
import { sharedStateCache } from './SharedStateCache';
import { MulticallEngine } from './MulticallEngine';
import { StorageService } from './StorageService';
import { EthersAdapter } from '../../infrastructure/adapters/EthersAdapter';

export class PoolScheduler {
  private isRunning = false;
  private executionLoopIntervalId: NodeJS.Timeout | null = null;
  private multicallEngine: MulticallEngine;

  constructor(
    private storageService: StorageService,
    private ethersAdapter: EthersAdapter,
    providerCount: number = 1
  ) {
    this.multicallEngine = new MulticallEngine(
      storageService,
      ethersAdapter,
      providerCount
    );
  }

  /**
   * PHASE 3: Start the scheduler
   * 
   * Begins the execution loop that checks for pools due refresh.
   * Called once on server startup.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Pool scheduler already running');
      return;
    }

    console.log('🚀 Starting pool scheduler (tiered scheduling enabled)');
    this.isRunning = true;

    // Main loop: check every 10 seconds for pools due refresh
    // (Reduced from 1s to avoid hitting RPC rate limits on free tier)
    this.executionLoopIntervalId = setInterval(() => {
      this.executionLoop().catch(error => {
        console.error('❌ Error in scheduler execution loop:', error);
      });
    }, 10000);
  }

  /**
   * PHASE 3-4: Main execution loop
   * 
   * Called every 1 second to:
   * 1. Check which pools are due for refresh
   * 2. Group into weight-aware batches (Phase 4)
   * 3. Execute multicall for each batch (Phase 4)
   * 4. Update tiers based on price changes
   * 5. Reschedule next refresh
   */
  private async executionLoop(): Promise<void> {
    // Get pools that are due for refresh (nextRefresh <= now)
    const poolsDue = poolController.getPoolsForRefresh();

    if (poolsDue.length === 0) {
      return; // Nothing to do
    }

    console.log(`⚡ [SCHEDULER] ${poolsDue.length} pool(s) due for refresh`);

    // Group pools by chainId
    const poolsByChain = new Map<number, typeof poolsDue>();
    for (const pool of poolsDue) {
      const chainId = pool.chainId || 1; // Default to Ethereum if not set
      if (!poolsByChain.has(chainId)) {
        poolsByChain.set(chainId, []);
      }
      poolsByChain.get(chainId)!.push(pool);
    }

    // Process each chain
    for (const [chainId, chainPools] of poolsByChain) {
      await this.executeForChain(chainId, chainPools);
    }
  }

  /**
   * Execute multicall for a specific chain's pools
   */
  private async executeForChain(chainId: number, poolsDue: Array<{ address: string; chainId: number; tier: string; nextRefresh: number; lastBlockSeen: number; lastPrice: number; requestCount: number; lastRequestTime: number }>): Promise<void> {
    if (poolsDue.length === 0) {
      return;
    }

    // PHASE 6: Generate unique tick ID for this refresh cycle
    const tickId = `tick_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    console.log(`⚡ Scheduler: ${poolsDue.length} pool(s) due for refresh [${tickId}]`);

    // PHASE 4: Get pool registry for this chain
    const poolRegistry = await this.storageService.getPoolRegistry(chainId);

    // PHASE 4: Create weight-aware batches
    const batches = this.multicallEngine.createBatches(poolsDue as AlivePool[], chainId, poolRegistry);
    console.log(`📦 Created ${batches.length} batch(es) for execution`);

    // PHASE 4: Execute all batches with round-robin distribution
    try {
      const multicallResults = await this.multicallEngine.executeBatches(batches, chainId);

      console.log(`✓ Multicall execution complete: ${multicallResults.length} results [${tickId}]`);

      // PHASE 5: Block-aware pricing - skip computation if block unchanged
      let blockAwareSavings = 0;
      let computationsPerformed = 0;

      // Process results: update cache and tier
      for (const result of multicallResults) {
        if (result.success && result.data) {
          const pool = poolController
            .getAliveSet()
            .find(p => p.address === result.poolAddress);

          // PHASE 5: Check if block number changed
          if (result.blockNumber === pool?.lastBlockSeen && result.blockNumber !== 0) {
            // Block unchanged - state unchanged, skip pricing computation
            blockAwareSavings++;
          } else {
            // Block changed - recompute price
            computationsPerformed++;
            
            console.log(`✓ [CACHE] Pool ${result.poolAddress.slice(0, 6)}... cached (sqrtPrice: ${result.data.sqrtPriceX96.toString().slice(0, 16)}...)`);

            // Update pool tier based on price change
            if (pool) {
              // Compute price from sqrtPriceX96 (simplified)
              const price = Math.sqrt(Number(result.data.sqrtPriceX96) / 2 ** 96);
              poolController.updatePoolTier(result.poolAddress, price);
              pool.lastBlockSeen = result.blockNumber;
              pool.lastPrice = price;

              console.log(
                `  📊 ${result.poolAddress.slice(0, 6)}... → block ${result.blockNumber}, tier: ${pool.tier}`
              );
            }
          }
        } else {
          // Failed result - schedule retry
          console.warn(
            `⚠️ Multicall failed for pool ${result.poolAddress.slice(0, 6)}...`
          );
        }
      }

      if (multicallResults.length > 0) {
        const savingsPercent = Math.round(
          (blockAwareSavings / multicallResults.length) * 100
        );
        console.log(
          `📈 PHASE 5 Block-Aware Savings: ${blockAwareSavings}/${multicallResults.length} skipped pricing (${savingsPercent}% reduction)`
        );
      }
    } catch (error) {
      console.error('❌ Multicall batch execution failed:', error);
      // Schedule retry for all pools due
      for (const pool of poolsDue) {
        pool.nextRefresh = Date.now() + 5000; // Retry in 5s
      }
    }
  }

  /**
   * PHASE 3: Stop the scheduler
   * 
   * Gracefully shuts down the execution loop.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.executionLoopIntervalId) {
      clearInterval(this.executionLoopIntervalId);
      this.executionLoopIntervalId = null;
    }

    this.isRunning = false;
    console.log('🛑 Pool scheduler stopped');
  }

  /**
   * PHASE 3: Get scheduler status
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * DEBUG: Get scheduling statistics
   */
  public getSchedulingStats() {
    const aliveSet = poolController.getAliveSet();
    const byTier = {
      high: aliveSet.filter(p => p.tier === 'high').length,
      normal: aliveSet.filter(p => p.tier === 'normal').length,
      low: aliveSet.filter(p => p.tier === 'low').length,
    };

    // Calculate when next refreshes are due
    const now = Date.now();
    const nextRefreshes = aliveSet.map(p => p.nextRefresh - now);
    const avgMsUntilRefresh =
      nextRefreshes.length > 0
        ? nextRefreshes.reduce((a, b) => a + b, 0) / nextRefreshes.length
        : 0;

    return {
      isRunning: this.isRunning,
      totalTrackedPools: aliveSet.length,
      poolsByTier: byTier,
      averageMsUntilNextRefresh: Math.round(avgMsUntilRefresh),
      tierDistribution: {
        high_5s: byTier.high,
        normal_10s: byTier.normal,
        low_30s: byTier.low,
      },
    };
  }
}
