import { useInfiniteQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { SnapshotResponse } from "@shared/schema";

export function useSnapshot(chain: string) {
  return useInfiniteQuery<SnapshotResponse>({
    queryKey: [api.snapshots.getLatest.path, chain],
    queryFn: async ({ pageParam = 0 }) => {
      const url = `${buildUrl(api.snapshots.getLatest.path, { chain })}?offset=${pageParam}&limit=25`;
      const res = await fetch(url);
      
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`No data available for ${chain}`);
        }
        throw new Error('Failed to fetch snapshot data');
      }
      
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextOffset = allPages.length * 25;
      // We assume there are 1000 tokens in the registry
      return nextOffset < 1000 ? nextOffset : undefined;
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}
