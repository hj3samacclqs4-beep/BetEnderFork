import { Token, Pool } from "../../domain/entities";
import { SUPPORTED_TOKENS } from "../../../shared/tokens";

export interface IChainAdapter {
  getChainName(): string;
  getTopPools(limit: number): Promise<Pool[]>;
  getStableTokenAddress(): string;
  getBatchPoolData(poolAddresses: string[]): Promise<any[]>;
}

export class MockAdapter implements IChainAdapter {
  private chainName: string;
  private stableToken: Token;
  private tokens: Token[];

  constructor(chainName: string) {
    this.chainName = chainName.toLowerCase();
    
    const metadata = SUPPORTED_TOKENS[this.chainName] || [];
    
    // Find USDC or first token as stable for mock purposes
    const stableMeta = metadata.find(t => t.symbol === "USDC") || metadata[0];
    
    this.stableToken = {
      symbol: stableMeta.symbol,
      name: stableMeta.name,
      address: stableMeta.address,
      decimals: stableMeta.decimals
    };

    this.tokens = metadata.filter(t => t.address !== this.stableToken.address).map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals
    }));
  }

  getChainName(): string {
    return this.chainName;
  }

  getStableTokenAddress(): string {
    return this.stableToken.address;
  }

  async getBatchPoolData(poolAddresses: string[]): Promise<any[]> {
    return [];
  }

  async getTopPools(limit: number): Promise<Pool[]> {
    // In a real adapter, this would call RPC or Subgraph
    // For this mock, we pretend we have a pool for every token in the system
    // but we only return those that are currently being windowed or a larger set
    
    // We increase mock pool limit to handle dynamic tokens
    const maxPools = 5000; 
    const pools: Pool[] = [];
    
    // For mock stability, we generate a pool for the stable token vs others
    // Real logic would be: fetch most liquid pool from Uniswap/Quickswap factory
    return pools; // Empty here because the Service handles the fallback logic
  }

  private getBasePrice(symbol: string): number {
    switch (symbol) {
      case "WETH": return 3500;
      case "WBTC": return 65000;
      case "UNI": return 10;
      case "AAVE": return 120;
      case "LINK": return 18;
      case "LDO": return 2.5;
      case "ARB": return 1.2;
      case "WMATIC": return 0.8;
      case "USDT": return 1;
      case "DAI": return 1;
      case "MKR": return 2800;
      case "SNX": return 3.5;
      case "COMP": return 60;
      case "GRT": return 0.25;
      case "SUSHI": return 1.1;
      case "QUICK": return 0.05;
      default: return 1;
    }
  }
}
