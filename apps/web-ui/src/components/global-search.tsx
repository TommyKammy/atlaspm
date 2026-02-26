'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { TaskSearchHit } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SearchResult {
  hits: TaskSearchHit[];
  total: number;
  page: number;
  totalPages: number;
}

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const data = await api(`/search?q=${encodeURIComponent(searchQuery)}`);
      setResults(data);
    } catch (error) {
      console.error('Search failed:', error);
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query) {
        performSearch(query);
      } else {
        setResults(null);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  const handleTaskClick = (taskId: string, projectId: string) => {
    setShowResults(false);
    setQuery('');
    router.push(`/projects/${projectId}?task=${taskId}`);
  };

  const handleViewAll = () => {
    setShowResults(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search tasks..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onKeyDown={(event) => {
            const value = event.currentTarget.value.trim();
            if (event.key === 'Enter' && value) {
              event.preventDefault();
              setShowResults(false);
              router.push(`/search?q=${encodeURIComponent(value)}`);
            }
          }}
          onFocus={() => setShowResults(true)}
          className="h-10 rounded-full border-transparent bg-muted/25 pl-10 pr-10 shadow-none transition-colors focus-visible:border-border focus-visible:bg-background/90"
          data-testid="global-search-input"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults(null);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showResults && (query || results) && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-lg border bg-popover p-2 shadow-lg z-50 max-h-[400px] overflow-y-auto"
          data-testid="search-results-dropdown"
        >
          {!results?.hits.length ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {isSearching ? 'Searching...' : query ? 'No results found' : 'Type to search'}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {results.hits.slice(0, 5).map((task) => (
                  <button
                    key={task.objectID}
                    type="button"
                    onClick={() => handleTaskClick(task.objectID, task.projectId)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{task.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        task.status === 'DONE' ? 'bg-green-100 text-green-700' :
                        task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        task.status === 'BLOCKED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {task.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              {results.total > 5 && (
                <div className="mt-2 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={handleViewAll}
                  >
                    View all {results.total} results
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
