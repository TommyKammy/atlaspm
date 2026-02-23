'use client';

import { useMemo } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer, type Event as CalendarEvent } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMonths, subMonths } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { Task } from '@/lib/types';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface TaskCalendarEvent extends CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Task;
  status: Task['status'];
  priority?: Task['priority'];
}

interface CalendarViewProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  onTaskDrop?: (taskId: string, newDate: Date) => void;
}

const statusColors: Record<Task['status'], string> = {
  TODO: '#6b7280',
  IN_PROGRESS: '#3b82f6',
  DONE: '#22c55e',
  BLOCKED: '#ef4444',
};

const priorityColors: Record<NonNullable<Task['priority']>, string> = {
  LOW: '#9ca3af',
  MEDIUM: '#3b82f6',
  HIGH: '#f59e0b',
  URGENT: '#ef4444',
};

export default function CalendarView({ tasks, onTaskClick, onTaskDrop }: CalendarViewProps) {
  const events = useMemo<TaskCalendarEvent[]>(() => {
    return tasks
      .filter((task) => task.dueAt || task.startAt)
      .map((task) => {
        const start = task.startAt ? new Date(task.startAt) : new Date(task.dueAt!);
        const end = task.dueAt ? new Date(task.dueAt) : start;
        
        return {
          id: task.id,
          title: task.title,
          start,
          end: end < start ? start : end,
          resource: task,
          status: task.status,
          priority: task.priority || undefined,
        };
      });
  }, [tasks]);

  const eventStyleGetter = (event: TaskCalendarEvent) => {
    const backgroundColor = statusColors[event.status];
    const borderColor = event.priority ? priorityColors[event.priority] : backgroundColor;
    
    return {
      style: {
        backgroundColor,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        padding: '2px 4px',
        fontSize: '12px',
      },
    };
  };

  const handleSelectEvent = (event: TaskCalendarEvent) => {
    onTaskClick?.(event.id);
  };

  const handleEventDrop = ({ event, start }: { event: TaskCalendarEvent; start: Date }) => {
    onTaskDrop?.(event.id, start);
  };

  return (
    <div className="h-[600px] rounded-lg border bg-card">
      <style jsx global>{`
        .rbc-calendar {
          font-family: inherit;
        }
        .rbc-header {
          padding: 8px;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground));
          background: hsl(var(--card));
          border-bottom: 1px solid hsl(var(--border));
        }
        .rbc-time-header-content {
          border-left: 1px solid hsl(var(--border));
        }
        .rbc-time-content {
          border-top: 1px solid hsl(var(--border));
        }
        .rbc-time-slot {
          color: hsl(var(--muted-foreground));
          font-size: 12px;
        }
        .rbc-event {
          cursor: pointer;
        }
        .rbc-event:hover {
          opacity: 1;
          filter: brightness(1.1);
        }
        .rbc-today {
          background-color: hsl(var(--accent) / 0.3);
        }
        .rbc-off-range-bg {
          background-color: hsl(var(--muted) / 0.3);
        }
        .rbc-button-link {
          color: hsl(var(--foreground));
        }
        .rbc-active {
          background-color: hsl(var(--accent));
        }
        .rbc-toolbar button {
          color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 13px;
        }
        .rbc-toolbar button:hover {
          background-color: hsl(var(--accent));
        }
        .rbc-toolbar button.rbc-active {
          background-color: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }
        .rbc-month-view {
          border: 1px solid hsl(var(--border));
          border-radius: 4px;
        }
        .rbc-time-view {
          border: 1px solid hsl(var(--border));
          border-radius: 4px;
        }
      `}</style>
      <BigCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        titleAccessor="title"
        eventPropGetter={eventStyleGetter}
        onSelectEvent={handleSelectEvent}
        views={['month', 'week', 'day']}
        defaultView="month"
        popup
        selectable
        resizable={false}
        onEventDrop={handleEventDrop}
        tooltipAccessor={(event: TaskCalendarEvent) => 
          `${event.title}\nStatus: ${event.status}\n${event.priority ? `Priority: ${event.priority}` : ''}`
        }
      />
    </div>
  );
}
