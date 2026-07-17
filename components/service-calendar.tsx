import { RotateCcwIcon, XIcon } from "lucide-react";

import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CalendarDay, weekdayLabels } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const calendarLegend = [
  {
    className: "border-emerald-500 bg-emerald-100 dark:bg-emerald-950",
    label: "Saved",
  },
  {
    className: "border-sky-500 bg-sky-100 dark:bg-sky-950",
    label: "Serviced",
  },
  {
    className: "border-amber-500 bg-amber-100 dark:bg-amber-950",
    label: "Expected",
  },
  {
    className: "border-rose-500 bg-rose-100 dark:bg-rose-950",
    label: "Removed",
  },
];

export function ServiceCalendar({
  days,
  expectedDates,
  month,
  onClearDates,
  onMonthChange,
  onResetExpected,
  onToggleDate,
  recordedDates,
  selectedDates,
}: {
  days: Array<CalendarDay | null>;
  expectedDates: string[];
  month: string;
  onClearDates: () => void;
  onMonthChange: (month: string) => void;
  onResetExpected: () => void;
  onToggleDate: (date: string) => void;
  recordedDates: Set<string>;
  selectedDates: string[];
}) {
  const selectedDateSet = new Set(selectedDates);
  const expectedDateSet = new Set(expectedDates);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] md:items-end">
        <Field label="Month" htmlFor="service-month">
          <Input
            id="service-month"
            className="service-month-input w-full max-w-full min-w-0"
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </Field>

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:justify-self-end">
          <Button type="button" variant="outline" onClick={onResetExpected}>
            <RotateCcwIcon data-icon="inline-start" />
            Expected dates
          </Button>
          <Button type="button" variant="outline" onClick={onClearDates}>
            <XIcon data-icon="inline-start" />
            Remove all
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {calendarLegend.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span className={cn("size-3 rounded-sm border", item.className)} />
            {item.label}
          </div>
        ))}
      </div>

      <div className="mx-auto grid max-w-[22rem] grid-cols-7 gap-1">
        {weekdayLabels.map((weekday) => (
          <div
            key={weekday}
            className="flex h-5 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {weekday}
          </div>
        ))}

        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const isSelected = selectedDateSet.has(day.date);
          const isExpected = expectedDateSet.has(day.date);
          const isRecorded = recordedDates.has(day.date);
          const isRemoved = isRecorded && !isSelected;
          const isNew = isSelected && !isRecorded;
          const isSaved = isSelected && isRecorded;

          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={isSelected}
              className={cn(
                "flex size-11 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                "border-border bg-background hover:bg-muted",
                isSaved &&
                "border-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
                isNew &&
                "border-sky-500 bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
                isExpected &&
                !isSelected &&
                !isRemoved &&
                "border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
                isRemoved &&
                "border-rose-500 bg-rose-100 text-rose-950 line-through dark:bg-rose-950 dark:text-rose-100"
              )}
              onClick={() => onToggleDate(day.date)}
            >
              {day.dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
