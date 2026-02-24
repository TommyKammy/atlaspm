'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { TaskSearchHit } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SearchResult {
  hits: TaskSearchHit[];
  total: number;
  page: number;
  totalPages: number;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery, 0);
    }
  }, [initialQuery]);

  const performSearch = async (searchQuery: string, page: number) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setIsSearching(true);
    try {
      let url = `/search?q=${encodeURIComponent(searchQuery)}&page=${page}`;
      if (projectFilter) url += `&projectId=${encodeURIComponent(projectFilter)}`;
      if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
      
      const data = await api(url);
      setResults(data);
      setCurrentPage(page);
    } catch (error) {
      console.error('Search failed:', error);
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query, 0);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleTaskClick = (taskId: string, projectId: string) => {
    router.push(`/projects/${projectId}?task=${taskId}`);
  };

  const getHighlightedText = (text: string, highlightResult?: { value: string }) => {
    if (!highlightResult?.value) return text;
    // Sanitize HTML to prevent XSS attacks
    const sanitized = highlightResult.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
    return sanitized;
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-4">Search Tasks</h1>
        
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tasks by title, description, or tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
              data-testid="search-page-input"
            />
          </div>
          
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Filter by project ID"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="flex-1"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-md bg-background"
            >
              <option value="">All Statuses</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
              <option value="BLOCKED">Blocked</option>
            </select>
            
            <Button type="submit" disabled={isSearching}>
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {results && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Found {results.total} result{results.total !== 1 ? 's' : ''}
              {results.total > 0 && ` (page ${currentPage + 1} of ${results.totalPages})`}
            </p>
          </div>

          {results.hits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No tasks found matching your search.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {results.hits.map((task) => (
                  <div
                    key={task.objectID}
                    onClick={() => handleTaskClick(task.objectID, task.projectId)}
                    className="p-4 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
                    data-testid="search-result-item"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 
                          className="font-medium mb-1"
                          dangerouslySetInnerHTML={{ 
                            __html: getHighlightedText(task.title, task._highlightResult?.title) 
                          }}
                        />
                        {task.description && (
                          <p 
                            className="text-sm text-muted-foreground line-clamp-2"
                            dangerouslySetInnerHTML={{ 
                              __html: getHighlightedText(task.description, task._highlightResult?.description) 
                            }}
                          />
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge 
                            className={`
                              ${task.status === 'DONE' ? 'bg-green-100 text-green-700 border-green-200' : ''}
                              ${task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700 border-blue-200' : ''}
                              ${task.status === 'BLOCKED' ? 'bg-red-100 text-red-700 border-red-200' : ''}
                              ${task.status === 'TODO' ? 'bg-gray-100 text-gray-600 border-gray-200' : ''}
                            `}
                          >
                            {task.status}
                          </Badge>
                          {task.priority && (
                            <Badge>
                              {task.priority}
                            </Badge>
                          )}
                          {task.tags?.map((tag) => (
                            <Badge key={tag} className="text-xs bg-secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        {new Date(task.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {results.totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => performSearch(query, currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <span className="px-4 py-2 text-sm">
                    Page {currentPage + 1} of {results.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= results.totalPages - 1}
                    onClick={() => performSearch(query, currentPage + 1)}
                  >
                    Next
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
