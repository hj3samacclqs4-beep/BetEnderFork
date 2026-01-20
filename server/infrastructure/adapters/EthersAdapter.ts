import { Pool } from "../../domain/entities";
import { IChainAdapter } from "./MockAdapter";
import { ethers } from "ethers";

// MakerDAO Multicall3 address (same on most chains)
const MULTICALL_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
const MULTICALL_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"
];

// Uniswap V3 Pool ABI snippet
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)"
];

export class EthersAdapter implements IChainAdapter {
  private chainName: string;
  private provider: ethers.JsonRpcProvider;
  private stableTokenAddress: string;
  private etherscanApiKey: string;

  constructor(chainName: string, rpcUrl: string, stableTokenAddress: string, etherscanApiKey: string) {
    this.chainName = chainName;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.stableTokenAddress = stableTokenAddress;
    this.etherscanApiKey = etherscanApiKey;
  }

  getChainName(): string {
    return this.chainName;
  }

  getStableTokenAddress(): string {
    return this.stableTokenAddress;
  }

  async getTopPools(limit: number): Promise<Pool[]> {
    try {
      // Etherscan V2 Discovery: Query for top liquidity pools
      // We'll use the tokenholderlist on the stable token as a proxy for pool discovery
      // In a more advanced version, we'd use a dedicated V2 liquidity endpoint
      const response = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=token&action=tokenholderlist&address=${this.stableTokenAddress}&apikey=${this.etherscanApiKey}`);
      
      if (!response.ok) return [];
      
      const data = await response.json();
      if (data.status !== "1" || !Array.isArray(data.result)) return [];

      // Filter for addresses that look like pools (usually top holders of USDC)
      const potentialPools = data.result.slice(0, limit).map((holder: any) => holder.address);
      
      // Fetch pool details (token0, token1) via Multicall
      const poolInterface = new ethers.Interface([
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function fee() view returns (uint24)"
      ]);

      const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, this.provider);
      const calls = potentialPools.flatMap((address: string) => [
        { target: address, callData: poolInterface.encodeFunctionData("token0") },
        { target: address, callData: poolInterface.encodeFunctionData("token1") },
        { target: address, callData: poolInterface.encodeFunctionData("fee") }
      ]);

      const [, returnData] = await multicall.aggregate(calls);
      
      const pools: Pool[] = [];
      for (let i = 0; i < potentialPools.length; i++) {
        try {
          const res = returnData[i * 3];
          if (!res || res === "0x") continue;
          
          const t0 = poolInterface.decodeFunctionResult("token0", res)[0];
          const t1 = poolInterface.decodeFunctionResult("token1", returnData[i * 3 + 1])[0];
          const fee = poolInterface.decodeFunctionResult("fee", returnData[i * 3 + 2])[0];
          
          // Verify one of the tokens is our stable token
          if (t0.toLowerCase() !== this.stableTokenAddress.toLowerCase() && 
              t1.toLowerCase() !== this.stableTokenAddress.toLowerCase()) {
            continue;
          }

          pools.push({
            address: potentialPools[i],
            token0: { symbol: "...", name: "...", address: t0, decimals: 18 },
            token1: { symbol: "...", name: "...", address: t1, decimals: 18 },
            reserve0: BigInt(0),
            reserve1: BigInt(0),
            feeTier: Number(fee)
          });
        } catch (e) {
          continue;
        }
      }
      
      return pools;
    } catch (error) {
      console.error(`Error fetching pools for ${this.chainName}:`, error);
      return [];
    }
  }

  async getBatchPoolData(poolAddresses: string[]): Promise<any[]> {
    if (poolAddresses.length === 0) return [];

    const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, this.provider);
    const poolInterface = new ethers.Interface(POOL_ABI);

    // Filter out invalid addresses
    const validAddresses = poolAddresses.filter(addr => ethers.isAddress(addr));
    if (validAddresses.length === 0) return [];

    const calls = validAddresses.flatMap(address => [
      {
        target: address,
        callData: poolInterface.encodeFunctionData("slot0")
      },
      {
        target: address,
        callData: poolInterface.encodeFunctionData("liquidity")
      }
    ]);

    try {
      const [, returnData] = await multicall.aggregate(calls);
      
      const results = [];
      for (let i = 0; i < validAddresses.length; i++) {
        try {
          const slot0Data = poolInterface.decodeFunctionResult("slot0", returnData[i * 2]);
          const liquidityData = poolInterface.decodeFunctionResult("liquidity", returnData[i * 2 + 1]);
          
          results.push({
            address: validAddresses[i],
            sqrtPriceX96: BigInt(slot0Data.sqrtPriceX96.toString()),
            liquidity: BigInt(liquidityData[0].toString())
          });
        } catch (e) {
          continue;
        }
      }
      return results;
    } catch (error) {
      console.error("Multicall aggregate failed:", error);
      return [];
    }
  }
}
