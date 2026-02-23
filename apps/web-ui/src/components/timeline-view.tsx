'use client';

import { useMemo, useState, useRef } from 'react';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, differenceInDays, min, max } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import type { Task, Section } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TimelineViewProps {
  tasks: Task[];
  sections: Section[];
  onTaskClick?: (taskId: string) => void;
  onTaskDateChange?: (taskId: string, startAt: Date | null, dueAt: Date | null) => void;
}

type ZoomLevel = 'day' | 'week' | 'month';

const statusColors: Record<Task['status'], string> = {
  TODO: 'bg-gray-500',
  IN_PROGRESS: 'bg-blue-500',
  DONE: 'bg-green-500',
  BLOCKED: 'bg-red-500',
};

const statusBgColors: Record<Task['status'], string> = {
  TODO: 'bg-gray-500/20',
  IN_PROGRESS: 'bg-blue-500/20',
  DONE: 'bg-green-500/20',
  BLOCKED: 'bg-red-500/20',
};

export default function TimelineView({ tasks, sections, onTaskClick, onTaskDateChange }: TimelineViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const dateRange = useMemo(() => {
    if (zoom === 'day') {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return { start, end, days: [currentDate] };
    }
    
    if (zoom === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start, end, days: eachDayOfInterval({ start, end }) };
    }
    
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return { start, end, days: eachDayOfInterval({ start, end }) };
  }, [currentDate, zoom]);

  const tasksWithDates = useMemo(() => {
    return tasks.filter(task => task.startAt || task.dueAt).map(task => {
      const start = task.startAt ? new Date(task.startAt) : new Date(task.dueAt!);
      const end = task.dueAt ? new Date(task.dueAt) : start;
      return { ...task, computedStart: start, computedEnd: end };
    });
  }, [tasks]);

  const groupedTasks = useMemo(() => {
    const grouped = new Map<string, typeof tasksWithDates>();
    
    sections.forEach(section => {
      grouped.set(section.id, []);
    });
    
    tasksWithDates.forEach(task => {
      const sectionTasks = grouped.get(task.sectionId) || [];
      sectionTasks.push(task);
      grouped.set(task.sectionId, sectionTasks);
    });
    
    return grouped;
  }, [tasksWithDates, sections]);

  const navigatePrev = () => {
    if (zoom === 'day') {
      setCurrentDate(prev => addDays(prev, -1));
    } else if (zoom === 'week') {
      setCurrentDate(prev => addDays(prev, -7));
    } else {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    }
  };

  const navigateNext = () => {
    if (zoom === 'day') {
      setCurrentDate(prev => addDays(prev, 1));
    } else if (zoom === 'week') {
      setCurrentDate(prev => addDays(prev, 7));
    } else {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getTaskPosition = (task: typeof tasksWithDates[0]) => {
    const totalDays = dateRange.days.length;
    const startOffset = differenceInDays(task.computedStart, dateRange.start);
    const duration = Math.max(1, differenceInDays(task.computedEnd, task.computedStart) + 1);
    
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;
    
    return { left: Math.max(0, left), width: Math.min(100 - left, width) };
  };

  const isTodayInRange = dateRange.days.some(day => isSameDay(day, new Date()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium">
            {format(dateRange.start, zoom === 'month' ? 'MMMM yyyy' : 'MMM d')} - {format(dateRange.end, 'MMM d, yyyy')}
          </span>
        </div>
        
        <div className="flex items-center gap-1 rounded-md border bg-muted p-1">
          {(['day', 'week', 'month'] as ZoomLevel[]).map((level) => (
            <Button
              key={level}
              variant={zoom === level ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setZoom(level)}
              className="text-xs capitalize"
            >
              {level}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card" ref={containerRef}>
        <div className="grid" style={{ gridTemplateColumns: '200px 1fr' }}>
          <div className="border-b border-r p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Section / Task
          </div>
          <div className="grid border-b" style={{ gridTemplateColumns: `repeat(${dateRange.days.length}, 1fr)` }}>
            {dateRange.days.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  'border-r p-2 text-center text-xs',
                  isSameDay(day, new Date()) && 'bg-accent/30',
                  zoom === 'month' && !isSameMonth(day, currentDate) && 'bg-muted/50 text-muted-foreground'
                )}
              >
                <div className="font-medium">{format(day, zoom === 'month' ? 'd' : 'EEE')}</div>
                {zoom !== 'month' && <div className="text-muted-foreground">{format(day, 'MMM d')}</div>}
              </div>
            ))}
          </div>
        </div>

        {isTodayInRange && zoom !== 'month' && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 z-10 w-px bg-red-500"
              style={{
                left: `${((differenceInDays(new Date(), dateRange.start) + 0.5) / dateRange.days.length) * 100}%`,
              }}
            >
              <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          </div>
        )}

        <div className="max-h-[500px] overflow-auto">
          {sections.map((section) => {
            const sectionTasks = groupedTasks.get(section.id) || [];
            
            return (
              <div key={section.id} className="grid border-b" style={{ gridTemplateColumns: '200px 1fr' }}>
                <div className="border-r bg-muted/50 p-3">
                  <div className="text-sm font-medium">{section.name}</div>
                  <div className="text-xs text-muted-foreground">{sectionTasks.length} tasks</div>
                </div>
                
                <div className="relative" style={{ minHeight: sectionTasks.length > 0 ? `${Math.max(60, sectionTasks.length * 40 + 20)}px` : '40px' }}>
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dateRange.days.length}, 1fr)` }}>
                    {dateRange.days.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-r',
                          isSameDay(day, new Date()) && 'bg-accent/10'
                        )}
                      />
                    ))}
                  </div>
                  
                  <div className="relative p-2">
                    {sectionTasks.length === 0 ? (
                      <div className="flex h-10 items-center justify-center text-xs text-muted-foreground">
                        No tasks with dates
                      </div>
                    ) : (
                      sectionTasks.map((task, index) => {
                        const position = getTaskPosition(task);
                        
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              'absolute cursor-pointer rounded-md px-2 py-1 text-xs text-white transition-all hover:brightness-110',
                              statusColors[task.status]
                            )}
                            style={{
                              left: `${position.left}%`,
                              width: `${position.width}%`,
                              top: `${index * 36 + 4}px`,
                              minWidth: '4px',
                            }}
                            onClick={() => onTaskClick?.(task.id)}
                            title={`${task.title} (${format(task.computedStart, 'MMM d')} - ${format(task.computedEnd, 'MMM d')})`}
                          >
                            <div className="truncate">{task.title}</div>
                            {position.width > 15 && (
                              <div className="text-[10px] opacity-80">
                                {format(task.computedStart, 'MMM d')} - {format(task.computedEnd, 'MMM d')}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {sections.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No sections available. Create a section to see tasks on the timeline.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3 text-xs">
        <span className="font-medium text-muted-foreground">Status:</span>
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn('h-3 w-3 rounded', color)} />
            <span>{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
