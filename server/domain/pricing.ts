import { Pool, Token } from "./entities";

// === Domain Layer: Pure Functions ===

/**
 * Computes the spot price of a token in terms of the stable token (USDC/USDT).
 * Supports both V2 (reserves) and V3 (sqrtPriceX96).
 * 
 * @param pool The liquidity pool containing the token and a stablecoin
 * @param tokenAddress The address of the token we want to price
 * @param stableTokenAddress The address of the stablecoin (USDC/USDT)
 * @returns Price in USD
 */
export function computeSpotPrice(
  pool: Pool, 
  tokenAddress: string, 
  stableTokenAddress: string
): number {
  const isToken0 = pool.token0.address.toLowerCase() === tokenAddress.toLowerCase();
  
  // V3 Logic: Price = (sqrtPriceX96 / 2^96)^2
  if (pool.sqrtPriceX96) {
    const sqrtPriceX96 = Number(pool.sqrtPriceX96);
    const Q96 = Math.pow(2, 96);
    const price0 = Math.pow(sqrtPriceX96 / Q96, 2);
    
    // Adjust for decimals: price0 is token1/token0
    const decimalAdjustment = Math.pow(10, pool.token0.decimals - pool.token1.decimals);
    const adjustedPrice0 = price0 * decimalAdjustment;
    
    return isToken0 ? 1 / adjustedPrice0 : adjustedPrice0;
  }

  // V2 Logic: Reserve-based
  const tokenReserve = isToken0 ? pool.reserve0 : pool.reserve1;
  const stableReserve = isToken0 ? pool.reserve1 : pool.reserve0;
  
  const token = isToken0 ? pool.token0 : pool.token1;
  const stable = isToken0 ? pool.token1 : pool.token0;

  if (tokenReserve === BigInt(0)) return 0;

  const rToken = Number(tokenReserve) / Math.pow(10, token.decimals);
  const rStable = Number(stableReserve) / Math.pow(10, stable.decimals);

  return rStable / rToken;
}

export function computeLiquidityUSD(pool: Pool, priceToken0: number, priceToken1: number): number {
  // V3 uses virtual liquidity, for simple dashboard we can approximate with TVL if reserves are provided
  // or use the liquidity parameter for relative depth. 
  // For this prototype, we'll continue using TVL (sum of both sides in USD)
  const r0 = Number(pool.reserve0) / Math.pow(10, pool.token0.decimals);
  const r1 = Number(pool.reserve1) / Math.pow(10, pool.token1.decimals);
  
  return (r0 * priceToken0) + (r1 * priceToken1);
}
