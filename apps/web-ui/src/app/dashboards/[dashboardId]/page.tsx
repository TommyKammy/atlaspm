'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Settings } from 'lucide-react';
import {
  useDashboard,
  useCreateWidget,
  useDeleteWidget,
  Dashboard as DashboardType,
} from '@/lib/api/dashboards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const WIDGET_TYPES = [
  { value: 'TASK_COMPLETION', label: 'Task Completion', description: 'Show task completion stats' },
  { value: 'PROGRESS_CHART', label: 'Progress Chart', description: 'Visual progress over time' },
  { value: 'TEAM_LOAD', label: 'Team Load', description: 'Team capacity and workload' },
  { value: 'OVERDUE_ALERTS', label: 'Overdue Alerts', description: 'Overdue tasks summary' },
  { value: 'RECENT_ACTIVITY', label: 'Recent Activity', description: 'Latest updates and changes' },
];

function WidgetRenderer({ widget }: { widget: DashboardType['widgets'][0] }) {
  const getWidgetContent = () => {
    switch (widget.type) {
      case 'TASK_COMPLETION':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">75%</span>
              <Badge variant="default">On Track</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Completed</span>
                <span>15/20</span>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div className="h-full bg-primary rounded-full" style={{ width: '75%' }} />
              </div>
            </div>
          </div>
        );
      case 'PROGRESS_CHART':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Weekly progress trend</p>
            <div className="flex items-end gap-2 h-24">
              {[40, 60, 45, 80, 65, 90, 75].map((value, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary/20 rounded-t"
                  style={{ height: `${value}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>
        );
      case 'TEAM_LOAD':
        return (
          <div className="space-y-3">
            {[
              { name: 'Alice', load: 8, max: 10 },
              { name: 'Bob', load: 12, max: 10 },
              { name: 'Charlie', load: 6, max: 10 },
            ].map((member) => (
              <div key={member.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{member.name}</span>
                  <span className={member.load > member.max ? 'text-destructive' : ''}>
                    {member.load}/{member.max}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full">
                  <div
                    className={`h-full rounded-full ${member.load > member.max ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${Math.min((member.load / member.max) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      case 'OVERDUE_ALERTS':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">3 overdue</Badge>
              <span className="text-sm text-muted-foreground">this week</span>
            </div>
            <div className="space-y-2">
              {['Review Q4 report', 'Update documentation', 'Fix login bug'].map((task) => (
                <div key={task} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span>{task}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 'RECENT_ACTIVITY':
        return (
          <div className="space-y-3">
            {[
              { action: 'Task completed', item: 'Homepage redesign', time: '2h ago' },
              { action: 'New comment', item: 'API integration', time: '4h ago' },
              { action: 'Status changed', item: 'Bug fix #234', time: '6h ago' },
            ].map((activity, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                <div className="flex-1">
                  <p className="text-sm">{activity.action}</p>
                  <p className="text-xs text-muted-foreground">{activity.item}</p>
                </div>
                <span className="text-xs text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </div>
        );
      default:
        return <p className="text-sm text-muted-foreground">Unknown widget type</p>;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {WIDGET_TYPES.find((t) => t.value === widget.type)?.label || widget.type}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>{getWidgetContent()}</CardContent>
    </Card>
  );
}

export default function DashboardDetailPage() {
  const params = useParams();
  const dashboardId = params.dashboardId as string;

  const { data: dashboard, isLoading } = useDashboard(dashboardId);
  const createWidget = useCreateWidget(dashboardId);
  const deleteWidget = useDeleteWidget(dashboardId);

  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [selectedWidgetType, setSelectedWidgetType] = useState('');

  const handleAddWidget = async () => {
    if (!selectedWidgetType) return;

    await createWidget.mutateAsync({
      type: selectedWidgetType,
      position: { x: 0, y: 0, w: 4, h: 3 },
    });

    setIsAddWidgetOpen(false);
    setSelectedWidgetType('');
  };

  const handleDeleteWidget = async (widgetId: string) => {
    if (confirm('Remove this widget from the dashboard?')) {
      await deleteWidget.mutateAsync(widgetId);
    }
  };

  if (isLoading || !dashboard) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/dashboards">
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">{dashboard.name}</h1>
        </div>
        <Button onClick={() => setIsAddWidgetOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Widget
        </Button>
      </div>

      {dashboard.widgets.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Settings className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No widgets yet</h3>
            <p className="text-muted-foreground mb-6">
              Add your first widget to start tracking metrics.
            </p>
            <Button onClick={() => setIsAddWidgetOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Widget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboard.widgets.map((widget) => (
            <div key={widget.id} className="relative group">
              <WidgetRenderer widget={widget} />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDeleteWidget(widget.id)}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isAddWidgetOpen} onOpenChange={setIsAddWidgetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Widget</DialogTitle>
            <DialogDescription>
              Choose a widget type to add to your dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={selectedWidgetType} onValueChange={setSelectedWidgetType}>
              <SelectTrigger>
                <SelectValue placeholder="Select widget type" />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddWidgetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddWidget} disabled={!selectedWidgetType || createWidget.isPending}>
              Add Widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
