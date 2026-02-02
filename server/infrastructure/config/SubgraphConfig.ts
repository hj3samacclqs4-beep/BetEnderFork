/**
 * Subgraph Configuration
 * 
 * Defines which subgraphs to query for pool topology discovery
 * Uses The Graph API endpoints
 */

export interface SubgraphConfig {
  name: string;
  endpoint: string;
  dexType: "v2" | "v3" | "custom";
  chainId: number;
}

const GRAPH_API_KEY = process.env.THE_GRAPH_API_KEY || "";

export const subgraphConfig: Record<number, SubgraphConfig[]> = {
  // Ethereum
  1: [
    {
      name: "Uniswap V3",
      endpoint: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/ELUcwQQj5M5NilErg5h2JU16EWEbxqea3zNYelujbpe`,
      dexType: "v3",
      chainId: 1,
    },
    {
      name: "Uniswap V2",
      endpoint: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/EJw8N1DPbqByePEA8ND82u51Q7iL3QAierBCQiS3SNyd`,
      dexType: "v2",
      chainId: 1,
    },
    {
      name: "SushiSwap",
      endpoint: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/BxaqKvroXXwVezya7kvzKvqKK6jxc73BfzZeJMTPVj9`,
      dexType: "v2",
      chainId: 1,
    },
  ],
  // Polygon
  137: [
    {
      name: "Uniswap V3 (Polygon)",
      endpoint: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/A8N3t6jPTtbAMZwgBuQdBKKfEp1ZitcFJ3G6u4oBXVs`,
      dexType: "v3",
      chainId: 137,
    },
    {
      name: "QuickSwap",
      endpoint: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/z3LEz7tD7AKmddyZa5qpqYFYS6rMo2fy5g47DzPuSXn`,
      dexType: "v2",
      chainId: 137,
    },
  ],
};

export const BASE_TOKENS: Record<number, string[]> = {
  1: [
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  ],
  137: [
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
    "0x8f3cf7ad23cd3cadbd9735aff958023d60d76ee6", // DAI
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
  ],
};
