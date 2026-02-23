declare module 'react-big-calendar' {
  import * as React from 'react';

  export interface Event {
    id?: string | number;
    title: React.ReactNode;
    start: Date;
    end: Date;
    allDay?: boolean;
    resource?: unknown;
  }

  export interface SlotInfo {
    start: Date;
    end: Date;
    slots: Date[];
    action: 'select' | 'click' | 'doubleClick';
    resourceId?: string | number;
    bounds?: { x: number; y: number };
    box?: { x: number; y: number; clientX: number; clientY: number };
  }

  export type View = 'month' | 'week' | 'work_week' | 'day' | 'agenda';

  export type DateLocalizerSpec = {
    formats: {
      date: string;
      day: string;
      weekday: string;
      time: string;
      month: string;
      yearHeader: string;
      monthHeader: string;
      dayHeader: string;
      dayRangeHeader: string;
    };
    firstOfWeek: (culture: string) => number;
    parse: (value: string, format: string, culture?: string) => Date | null;
    format: (value: Date, format: string, culture?: string) => string;
  };

  export function dateFnsLocalizer(args: {
    format: (date: Date, formatStr: string, options?: unknown) => string;
    parse: (dateStr: string, formatStr: string, referenceDate: Date, options?: unknown) => Date;
    startOfWeek: (date: Date, options?: unknown) => Date;
    getDay: (date: Date) => number;
    locales: Record<string, unknown>;
  }): DateLocalizerSpec;

  export interface CalendarProps<TEvent extends object = Event> {
    localizer: DateLocalizerSpec;
    events: TEvent[];
    startAccessor?: keyof TEvent | ((event: TEvent) => Date);
    endAccessor?: keyof TEvent | ((event: TEvent) => Date);
    titleAccessor?: keyof TEvent | ((event: TEvent) => React.ReactNode);
    allDayAccessor?: keyof TEvent | ((event: TEvent) => boolean);
    tooltipAccessor?: keyof TEvent | ((event: TEvent) => string);
    resourceAccessor?: keyof TEvent | ((event: TEvent) => unknown);
    resources?: unknown[];
    resourceIdAccessor?: string | ((resource: unknown) => string | number);
    resourceTitleAccessor?: string | ((resource: unknown) => string);
    defaultView?: View;
    view?: View;
    views?: View[] | { [key: string]: boolean | React.ComponentType };
    step?: number;
    timeslots?: number;
    min?: Date;
    max?: Date;
    scrollToTime?: Date;
    date?: Date;
    defaultDate?: Date;
    getNow?: () => Date;
    onNavigate?: (newDate: Date, view: View, action: 'PREV' | 'NEXT' | 'TODAY' | 'DATE') => void;
    onView?: (view: View) => void;
    onDrillDown?: (date: Date, view: View) => void;
    onSelectSlot?: (slotInfo: SlotInfo) => void;
    onSelectEvent?: (event: TEvent, e: React.SyntheticEvent) => void;
    onDoubleClickEvent?: (event: TEvent, e: React.SyntheticEvent) => void;
    onKeyPressEvent?: (event: TEvent, e: React.KeyboardEvent) => void;
    showMultiDayTimes?: boolean;
    selected?: TEvent;
    popup?: boolean;
    toolbar?: boolean;
    formats?: Record<string, string | ((date: Date, culture?: string, localizer?: DateLocalizerSpec) => string)>;
    eventPropGetter?: (event: TEvent) => { style?: React.CSSProperties; className?: string };
    tooltipAccessor?: string | ((event: TEvent) => string);
    selectable?: boolean | 'ignoreEvents';
    resizable?: boolean;
    onEventDrop?: (args: { event: TEvent; start: Date; end?: Date; isAllDay?: boolean }) => void;
    culture?: string;
    className?: string;
    style?: React.CSSProperties;
    elementProps?: React.HTMLAttributes<HTMLElement>;
    components?: {
      event?: React.ComponentType<{ event: TEvent; title: string }>;
      agenda?: {
        date?: React.ComponentType;
        time?: React.ComponentType;
        event?: React.ComponentType<{ event: TEvent }>;
      };
      day?: {
        header?: React.ComponentType;
        event?: React.ComponentType<{ event: TEvent }>;
      };
      month?: {
        header?: React.ComponentType;
        dateHeader?: React.ComponentType;
        event?: React.ComponentType<{ event: TEvent }>;
      };
      week?: {
        header?: React.ComponentType;
        event?: React.ComponentType<{ event: TEvent }>;
      };
      work_week?: {
        header?: React.ComponentType;
        event?: React.ComponentType<{ event: TEvent }>;
      };
      toolbar?: React.ComponentType<{ label: string; onNavigate: (action: string) => void; onView: (view: View) => void; view: View; views: string[] }>;
    };
  }

  export class Calendar<TEvent extends object = Event> extends React.Component<CalendarProps<TEvent>> {}
}
