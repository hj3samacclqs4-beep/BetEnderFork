import { Pool, Token } from "../../domain/entities";
import { ethers } from "ethers";

const MULTICALL_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

const MULTICALL_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 feeTier) view returns (address pool)"
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function getReserves() view returns (uint128, uint128)"
];

export class EthersAdapter {
  private providers: { [chainId: number]: ethers.JsonRpcProvider };
  private factory: ethers.Contract;

  constructor(rpcUrls: { [chainId: number]: string }) {
    this.providers = {};
    for (const chainId in rpcUrls) {
      this.providers[chainId] = new ethers.JsonRpcProvider(rpcUrls[chainId]);
    }
    // The factory address is the same for both Ethereum and Polygon
    this.factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, this.providers[1]);
  }

  private getProvider(chainId: number): ethers.JsonRpcProvider {
    const provider = this.providers[chainId];
    if (!provider) {
      throw new Error(`Provider for chain ID ${chainId} not configured.`);
    }
    return provider;
  }

  async getPoolAddress(tokenA: Token, tokenB: Token, chainId: number): Promise<string | null> {
    const provider = this.getProvider(chainId);
    const factory = this.factory.connect(provider);
    const feeTiers = [100, 500, 3000, 10000]; // Common Uniswap V3 fee tiers
    for (const fee of feeTiers) {
      const poolAddress = await factory.getPool(tokenA.address, tokenB.address, fee);
      if (poolAddress && poolAddress !== "0x0000000000000000000000000000000000000000") {
        return poolAddress;
      }
    }
    return null;
  }

  async getBatchPoolData(poolAddresses: string[], chainId: number): Promise<any[]> {
    if (poolAddresses.length === 0) return [];

    const provider = this.getProvider(chainId);
    const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, provider);
    const poolInterface = new ethers.Interface(POOL_ABI);

    const validAddresses = poolAddresses.filter(addr => addr && ethers.isAddress(addr));
    if (validAddresses.length === 0) return [];

    const calls = validAddresses.flatMap(address => [
      { target: address, callData: poolInterface.encodeFunctionData("slot0") },
      { target: address, callData: poolInterface.encodeFunctionData("liquidity") },
      { target: address, callData: poolInterface.encodeFunctionData("getReserves") }
    ]);

    try {
      const [, returnData] = await multicall.aggregate(calls);

      const results = [];
      for (let i = 0; i < validAddresses.length; i++) {
        try {
          const slot0Data = poolInterface.decodeFunctionResult("slot0", returnData[i * 3]);
          const liquidityData = poolInterface.decodeFunctionResult("liquidity", returnData[i * 3 + 1]);
          const reservesData = poolInterface.decodeFunctionResult("getReserves", returnData[i * 3 + 2]);

          results.push({
            address: validAddresses[i],
            sqrtPriceX96: BigInt(slot0Data.sqrtPriceX96.toString()),
            liquidity: BigInt(liquidityData[0].toString()),
            reserve0: BigInt(reservesData[0].toString()),
            reserve1: BigInt(reservesData[1].toString()),
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
