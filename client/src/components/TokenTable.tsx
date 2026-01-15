import { TokenEntry } from "@shared/schema";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { motion } from "framer-motion";
import { ArrowUpRight, DollarSign, Activity, BarChart3, Database } from "lucide-react";

interface TokenTableProps {
  entries: TokenEntry[];
  isLoading: boolean;
}

export function TokenTable({ entries, isLoading }: TokenTableProps) {
  // Formatters
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  };

  const formatLargeNumber = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 w-full bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[200px] font-semibold text-muted-foreground">Token</TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground">
              <div className="flex items-center justify-end gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Price
              </div>
            </TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground">
              <div className="flex items-center justify-end gap-1">
                <Database className="w-3.5 h-3.5" /> Liquidity
              </div>
            </TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground">
              <div className="flex items-center justify-end gap-1">
                <Activity className="w-3.5 h-3.5" /> Volume (24h)
              </div>
            </TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground">
              <div className="flex items-center justify-end gap-1">
                <BarChart3 className="w-3.5 h-3.5" /> Market Cap
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                No tokens found for this chain.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry, index) => (
              <motion.tr
                key={entry.token.address}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="group border-b border-border/50 hover:bg-muted/20 transition-colors"
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    {entry.token.logoURI ? (
                      <img 
                        src={entry.token.logoURI} 
                        alt={entry.token.symbol}
                        className="w-8 h-8 rounded-full ring-1 ring-border shadow-sm object-contain bg-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${entry.token.symbol}&background=random&color=fff`;
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-bold text-primary ring-1 ring-primary/20 group-hover:ring-primary/40 transition-all">
                        {entry.token.symbol[0]}
                      </div>
                    )}
                    <div>
                      <div className="text-foreground font-bold">{entry.token.symbol}</div>
                      <div className="text-xs text-muted-foreground font-mono">{entry.token.address.slice(0, 6)}...{entry.token.address.slice(-4)}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(entry.priceUSD)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {formatLargeNumber(entry.liquidityUSD)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {formatLargeNumber(entry.volumeUSD)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {formatLargeNumber(entry.marketCapUSD)}
                </TableCell>
              </motion.tr>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
