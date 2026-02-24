'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, LayoutDashboard, MoreHorizontal, Trash2, Edit } from 'lucide-react';
import { useDashboards, useCreateDashboard, useDeleteDashboard } from '@/lib/api/dashboards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatDistanceToNow } from '@/lib/utils';

export default function DashboardsPage() {
  const { data: dashboards, isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDashboard, setNewDashboard] = useState({ name: '' });

  const handleCreate = async () => {
    await createDashboard.mutateAsync({ name: newDashboard.name });
    setIsCreateOpen(false);
    setNewDashboard({ name: '' });
  };

  const handleDelete = async (dashboardId: string) => {
    if (confirm('Are you sure you want to delete this dashboard?')) {
      await deleteDashboard.mutateAsync(dashboardId);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Dashboards</h1>
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
          <h1 className="text-3xl font-bold">Dashboards</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage customizable dashboards with widgets
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Dashboard
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Dashboard</DialogTitle>
              <DialogDescription>
                Create a new dashboard to organize your widgets.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newDashboard.name}
                  onChange={(e) => setNewDashboard({ name: e.target.value })}
                  placeholder="e.g., My Dashboard"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newDashboard.name || createDashboard.isPending}>
                Create Dashboard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {dashboards?.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <LayoutDashboard className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No dashboards yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first dashboard to start organizing widgets.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboards?.map((dashboard) => (
            <Card key={dashboard.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Link href={`/dashboards/${dashboard.id}`} className="flex-1 min-w-0">
                    <CardTitle className="text-xl truncate">{dashboard.name}</CardTitle>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboards/${dashboard.id}`}>
                          <Edit className="w-4 h-4 mr-2" />
                          Open Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(dashboard.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {dashboard.widgets.length} widget{dashboard.widgets.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(dashboard.createdAt))} ago
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
