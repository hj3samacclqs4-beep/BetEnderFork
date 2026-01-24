import { useState } from "react";
import { useSnapshot } from "@/hooks/use-snapshots";
import { TokenTable } from "@/components/TokenTable";
import { StatsCard } from "@/components/StatsCard";
import { Activity, Coins, Globe, History, RefreshCcw, Search } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading, 
    isError, 
    error, 
    isRefetching 
  } = useSnapshot("polygon");

  // Flatten all pages of entries
  const allEntries = data?.pages.flatMap(page => page.entries) || [];

  // Filter entries based on search query
  const filteredEntries = allEntries.filter(entry => 
    entry.token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.token.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Computed stats from first page (as proxy)
  const snapshot = data?.pages[0];
  const totalLiquidity = allEntries.reduce((acc, curr) => acc + curr.liquidityUSD, 0) || 0;
  const totalVolume = allEntries.reduce((acc, curr) => acc + curr.volumeUSD, 0) || 0;
  const activeTokens = allEntries.length || 0;

  const formatLarge = (val: number) => {
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-background pb-20">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20">
              D
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              DEX Aggregator
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
              <span className={`w-2 h-2 rounded-full mr-2 ${isRefetching ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></span>
              {isRefetching ? 'Syncing...' : 'Live'}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Page Title & Last Update */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Market Overview</h2>
            <p className="text-muted-foreground mt-1">Real-time aggregated price data across top DEXs.</p>
          </div>
          
          {snapshot && (
            <div className="flex items-center text-sm text-muted-foreground">
              <History className="w-4 h-4 mr-2" />
              Last updated {formatDistanceToNow(snapshot.timestamp)} ago
            </div>
          )}
        </div>

        {/* Error State */}
        {isError && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center">
            <Activity className="w-5 h-5 mr-3" />
            <span className="font-medium">Error loading data: {(error as Error).message}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard 
            title="Total Liquidity Tracked" 
            value={isLoading ? "Loading..." : formatLarge(totalLiquidity)}
            icon={<Coins className="w-5 h-5" />}
            className="md:col-span-1"
          />
          <StatsCard 
            title="24h Volume" 
            value={isLoading ? "Loading..." : formatLarge(totalVolume)}
            icon={<Activity className="w-5 h-5" />}
            className="md:col-span-1"
          />
          <StatsCard 
            title="Active Pairs" 
            value={isLoading ? "..." : activeTokens.toString()}
            icon={<Globe className="w-5 h-5" />}
            className="md:col-span-1"
          />
        </div>

        {/* Main Data Table */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Top Tokens
            </h3>
            
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search tokens..."
                className="pl-9 bg-background/50 border-border/50 focus:border-primary/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <TokenTable 
            entries={filteredEntries} 
            isLoading={isLoading} 
          />

          {hasNextPage && (
            <div className="flex justify-center py-8">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-6 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors font-medium text-sm"
              >
                {isFetchingNextPage ? 'Loading more...' : 'Load More Tokens'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
