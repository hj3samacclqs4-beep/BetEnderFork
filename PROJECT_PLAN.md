# Project Plan: High-Performance DEX Aggregator

This document outlines the development plan to refactor the application into a specialized, high-performance DEX price aggregator for Ethereum and Polygon. The architecture is designed for speed, accuracy, and scalability, centered around a multi-layered caching system and an efficient request-batching pipeline.

---

## **Phase 1: Foundation & Data Management**

*Objective: Establish the core data structures and the "cold path" for discovering and storing information about new tokens and liquidity pools.*

### **Step 1.1: Restrict Network Scope**
- **Alignment:** Refactor
- *Note: The current app supports multiple chains. This step simplifies the codebase by removing all logic not related to Ethereum and Polygon, which is a prerequisite for the new focused design.*
- [ ] Review `shared/tokens.ts` and remove chain configurations other than Ethereum and Polygon.
- [X] Update `client/src/components/ChainSelector.tsx` to remove the component entirely.
- [X] Refactor `server/infrastructure/adapters/EthersAdapter.ts` to remove logic for connecting to unsupported chains.
- [ ] Clean up any other constants or configurations in the codebase related to now-removed chains.
- [ ] Verify that `server/routes.ts` is updated to remove the `:chain` parameter from API endpoints.

### **Step 1.2: Establish Server-Side File Storage**
- **Alignment:** New
- *Note: The project currently does not use a file-based database. This step creates the `data` directory and JSON files that will act as the persistent store for tokens and pools.*
- [ ] Create a new directory: `server/data`.
- [ ] Create the token storage file: `server/data/tokens.json`.
    - Schema: `[{ "name": string, "symbol": string, "address": string, "chainId": number, "logoURI": string }]`
    - Pre-populate with WETH, USDC, and USDT for Ethereum (1) and Polygon (137).
- [ ] Create the pool storage file: `server/data/pools.json`.
    - Schema: `{ "<tokenAddress_chainId>": ["poolAddress1", "poolAddress2", ...] }`
- [ ] Create a new service `server/application/services/StorageService.ts` to handle atomic reads and writes to these JSON files.

### **Step 1.3: Implement the "Cold Path" Discovery Service**
- **Alignment:** New
- *Note: The current system has no mechanism for discovering new tokens. This service will be built from scratch to integrate with Etherscan (or another provider) to find and save new assets.*
- [ ] Create a new service: `server/application/services/DiscoveryService.ts`.
- [ ] Add an Etherscan API client. Store the API key in environment variables.
- [ ] Implement a `findToken(query: string)` function to search for a token.
- [ ] Implement a `findPools(tokenAddress: string)` function to identify its liquidity pools.
- [ ] Create a new internal function that uses the `DiscoveryService` and `StorageService` to find and save new asset information when a token is not found in `tokens.json`.
- [ ] Implement filtering to discard low-liquidity or unverified pools.

---

## **Phase 2: Backend - The "Hot Path" Core Engine**

*Objective: Implement the real-time request processing pipeline, from batching user requests to fetching on-chain data with maximum efficiency.*

### **Step 2.1: Develop the Request Batcher**
- **Alignment:** New
- *Note: The current architecture is a simple request-response model. This step introduces a new, asynchronous batching system to absorb user requests and deduplicate work.*
- [ ] Create a new service: `server/application/services/RequestBatcher.ts`.
- [ ] It will expose an `addQuoteRequest()` method that holds a `Promise` and adds requests to an in-memory queue.
- [ ] Implement a `setInterval` loop (e.g., every 100ms) to trigger a `processQueue()` method.
- [ ] `processQueue()` will deduplicate requested tokens and forward them to the Controller.
- [ ] Create a new API endpoint `/api/quote` in `server/routes.ts` that awaits the `Promise` from the `RequestBatcher`.

### **Step 2.2: Implement the Controller**
- **Alignment:** New
- *Note: The existing `SnapshotService` has a simple 10-second refresh timer. This will be replaced by a sophisticated Controller that manages different update intervals for volatile vs. standard tokens.*
- [ ] Create the orchestration service: `server/application/services/ControllerService.ts`.
- [ ] The Controller will be invoked by the `RequestBatcher` with a unique set of tokens.
- [ ] It will maintain an in-memory `Map` to store `lastUpdated` timestamps for each token.
- [ ] Implement logic to segregate tokens into update tiers (Immediate, Fast-5s, Standard-10s).
- [ ] The Controller will group tokens by network and pass them to the Query Engine.

### **Step 2.3: Build the Multicall Query Engine**
- **Alignment:** Enhancement
- *Note: `EthersAdapter.ts` currently exists to fetch basic token data. It will be significantly enhanced to construct and execute optimized `multicall` requests to fetch prices from multiple pools in a single RPC call.*
- [ ] Refactor `server/infrastructure/adapters/EthersAdapter.ts` into a `QueryEngine.ts` service.
- [ ] Install a library to simplify multicall operations (e.g., `ethers-multicall-provider`).
- [ ] Implement `fetchPrices(network, tokensWithPools)` to construct and execute the multicall.
- [ ] It will return a structured result mapping each token to raw data from its queried pools.

---

## **Phase 3: Backend - Pricing, Caching, and Distribution**

*Objective: Process the raw on-chain data, calculate the best price, cache the results, and deliver them to the user.*

### **Step 3.1: Implement the Advanced Pricing Module**
- **Alignment:** Enhancement
- *Note: `server/domain/pricing.ts` exists but is a placeholder. This step will implement the core business logic to calculate the best price by comparing results from multiple liquidity pools.*
- [ ] Enhance the existing `server/domain/pricing.ts`.
- [ ] Create a function `calculateBestPrice(tokenAddress, rawPoolData)` that runs parallel computations to find the optimal swap rate.
- [ ] It will return the best price found and identify the corresponding liquidity pool.

### **Step 3.2: Set Up Multi-Layer Caching**
- **Alignment:** Enhancement
- *Note: A very basic cache exists within the `SnapshotService`. This will be replaced with a dedicated `CacheService` for a robust in-memory cache, with a stretch goal of adding Redis for persistence.*
- [ ] Create a new service: `server/application/services/CacheService.ts`.
- [ ] Implement a primary in-memory cache using a `Map`.
- [ ] Implement `getQuote` and `setQuote` methods.
- [ ] **(Stretch Goal)** Integrate Redis as a second-layer, persistent cache.

### **Step 3.3: Create the Dispatcher & Response Handler**
- **Alignment:** New
- *Note: In the new asynchronous architecture, a Dispatcher is required to resolve the pending promises held by the `RequestBatcher`. This component does not exist in the current synchronous flow.*
- [ ] Create a final service: `server/application/services/DispatcherService.ts`.
- [ ] After the Pricing Module returns prices, it will invoke the Dispatcher.
- [ ] The Dispatcher will call `CacheService.setQuote()` to store results.
- [ ] It will then resolve the original pending Promises in the `RequestBatcher`'s queue to send the HTTP response back to the client.

---

## **Phase 4: Frontend Integration**

*Objective: Connect the redesigned user interface to the new high-performance backend API.*

### **Step 4.1: Redesign the User Interface**
- **Alignment:** Refactor / New
- *Note: This step replaces the existing data-table-focused UI with a new, purpose-built `SwapInterface` component, aligning the frontend with the app's core purpose.*
- [ ] Overhaul `client/src/pages/Dashboard.tsx`.
- [ ] Create a new `client/src/components/SwapInterface.tsx`.
- [ ] This component will feature inputs for amount, token selection, and a display for the quote.
- [ ] Remove the now-obsolete `TokenTable.tsx` and related components.

### **Step 4.2: Connect to the New API**
- **Alignment:** Refactor
- *Note: The current frontend fetching logic in `use-snapshots.ts` will be removed. We will refactor the UI to use `useQuery` to call the new `/api/quote` endpoint.*
- [ ] In `SwapInterface.tsx`, use `@tanstack/react-query`'s `useQuery` hook to fetch data from `/api/quote`.
- [ ] The query key will be dynamic, based on the selected tokens and amount.
- [ ] Implement debouncing on the amount input to prevent excessive API calls.
- [ ] Use TanStack Query's cache as the client-side cache and `Skeleton` components for loading states.
