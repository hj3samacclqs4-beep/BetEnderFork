import type { Express } from "express";
import { createServer, type Server } from "http";
import { api } from "@shared/routes";
import { SnapshotService } from "./application/services/SnapshotService";
import { MockAdapter } from "./infrastructure/adapters/MockAdapter";
import { EthersAdapter } from "./infrastructure/adapters/EthersAdapter";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === Clean Architecture Setup ===
  // 1. Initialize Adapters (Infrastructure Layer)
  
  // Use Alchemy/Infura from secrets if available, otherwise fallback to Mock
  const ethRpc = process.env.ALCHEMY_API_KEY 
    ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : process.env.INFURA_API_KEY
    ? `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
    : null;

  const ethereumAdapter = ethRpc 
    ? new EthersAdapter("ethereum", ethRpc, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", process.env.ETHERSCAN1 || "")
    : new MockAdapter("ethereum") as any;

  const polygonAdapter = new MockAdapter("polygon") as any;

  // 2. Initialize Service (Application Layer)
  const snapshotService = new SnapshotService([ethereumAdapter, polygonAdapter]);

  // === API Routes (Infrastructure Layer - Controller) ===
  
  app.get(api.snapshots.getLatest.path, async (req, res) => {
    try {
      const chain = req.params.chain;
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 25;
      
      const snapshot = await snapshotService.generateSnapshot(chain, offset, limit);
      res.json(snapshot);
    } catch (error) {
      if (error instanceof Error && error.message.includes("No adapter")) {
        res.status(404).json({ message: "Chain not supported" });
      } else {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  return httpServer;
}
