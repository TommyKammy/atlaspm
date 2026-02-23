'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, FolderOpen, MoreHorizontal, Trash2, Edit } from 'lucide-react';
import { usePortfolios, useCreatePortfolio, useDeletePortfolio } from '@/lib/api/portfolios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { formatDistanceToNow } from '@/lib/utils';

export default function PortfoliosPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  
  const { data: portfolios, isLoading } = usePortfolios(workspaceId);
  const createPortfolio = useCreatePortfolio(workspaceId);
  const deletePortfolio = useDeletePortfolio(workspaceId);
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPortfolio, setNewPortfolio] = useState({ name: '', description: '' });

  const handleCreate = async () => {
    await createPortfolio.mutateAsync(newPortfolio);
    setIsCreateOpen(false);
    setNewPortfolio({ name: '', description: '' });
  };

  const handleDelete = async (portfolioId: string) => {
    if (confirm('Are you sure you want to delete this portfolio?')) {
      await deletePortfolio.mutateAsync(portfolioId);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Portfolios</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted" />
              <CardContent className="h-32 bg-muted mt-4" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Portfolios</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track progress across multiple projects
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Portfolio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Portfolio</DialogTitle>
              <DialogDescription>
                Create a new portfolio to group and track multiple projects.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newPortfolio.name}
                  onChange={(e) => setNewPortfolio({ ...newPortfolio, name: e.target.value })}
                  placeholder="e.g., Q1 2024 Initiatives"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newPortfolio.description}
                  onChange={(e) => setNewPortfolio({ ...newPortfolio, description: e.target.value })}
                  placeholder="Describe this portfolio..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newPortfolio.name || createPortfolio.isPending}>
                Create Portfolio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {portfolios?.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No portfolios yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first portfolio to start tracking multiple projects together.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Portfolio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolios?.map((portfolio) => (
            <Card
              key={portfolio.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(`/workspaces/${workspaceId}/portfolios/${portfolio.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-xl truncate">{portfolio.name}</CardTitle>
                    {portfolio.description && (
                      <CardDescription className="line-clamp-2 mt-1">
                        {portfolio.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/workspaces/${workspaceId}/portfolios/${portfolio.id}`);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(portfolio.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {portfolio.projects.length} project{portfolio.projects.length !== 1 ? 's' : ''}
                    </span>
                    <span className="font-medium">{portfolio.progress}% complete</span>
                  </div>
                  <Progress value={portfolio.progress} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(portfolio.createdAt))} ago
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
