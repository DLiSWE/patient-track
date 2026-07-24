import { RotateCcwIcon, XIcon } from "lucide-react";

import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CalendarDay, weekdayLabels } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export const serviceStatusStyles: Record<
  string,
  { cell: string; dot: string; hoverRing: string }
> = {
  attended: {
    cell: "ring-2 ring-inset ring-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-500",
    hoverRing: "hover:outline hover:outline-2 hover:outline-emerald-400",
  },
  medical: {
    cell: "ring-2 ring-inset ring-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-500",
    hoverRing: "hover:outline hover:outline-2 hover:outline-violet-400",
  },
  hold: {
    cell: "ring-2 ring-inset ring-slate-500 bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-slate-100",
    dot: "bg-slate-500",
    hoverRing: "hover:outline hover:outline-2 hover:outline-slate-400",
  },
  vacation: {
    cell: "ring-2 ring-inset ring-blue-500 bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100",
    dot: "bg-blue-500",
    hoverRing: "hover:outline hover:outline-2 hover:outline-blue-400",
  },
};

export function getServiceStatusStyle(status: string) {
  return serviceStatusStyles[status.toLowerCase()] ?? serviceStatusStyles.attended;
}

const calendarLegend = [
  {
    className: "border-emerald-500 bg-emerald-100 dark:bg-emerald-950",
    label: "Saved",
  },
  {
    className: "border-amber-500 bg-amber-100 dark:bg-amber-950",
    label: "Expected",
  },
  {
    className: "border-rose-500 bg-rose-100 dark:bg-rose-950",
    label: "Removed",
  },
  {
    className: "border-violet-500 bg-violet-100 dark:bg-violet-950",
    label: "Medical",
  },
  {
    className: "border-slate-500 bg-slate-200 dark:bg-slate-800",
    label: "Hold",
  },
  {
    className: "border-blue-500 bg-blue-100 dark:bg-blue-950",
    label: "Vacation",
  },
  {
    className: "border-zinc-800 bg-zinc-950 dark:border-zinc-600 dark:bg-black",
    label: "Unavailable",
  },
];

export function ServiceCalendar({
  activeStatus = "Attended",
  days,
  expectedDates,
  month,
  newStatusByDate,
  onClearDates,
  onMonthChange,
  onResetExpected,
  onStatusClick,
  onToggleDate,
  pendingStatusDates,
  recordedDates,
  recordedStatusByDate,
  selectedDates,
  unavailableDates,
}: {
  activeStatus?: string;
  days: Array<CalendarDay | null>;
  expectedDates: string[];
  month: string;
  newStatusByDate?: Map<string, string>;
  onClearDates: () => void;
  onMonthChange: (month: string) => void;
  onResetExpected: () => void;
  onStatusClick?: (date: string) => void;
  onToggleDate: (date: string) => void;
  pendingStatusDates?: Set<string>;
  recordedDates: Set<string>;
  recordedStatusByDate?: Map<string, string>;
  selectedDates: string[];
  unavailableDates?: Set<string>;
}) {
  const activeStatusStyle = getServiceStatusStyle(activeStatus);
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

      <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", activeStatusStyle.dot)} />
        <span>
          Clicking a day stages it as{" "}
          <span className="font-medium text-foreground">{activeStatus}</span> — a{" "}
          <span className="font-medium text-foreground">dashed border (*)</span> means the
          change is staged; nothing updates until you hit Save.
        </span>
      </div>

      <div className="mx-auto grid max-w-[18.25rem] grid-cols-7 gap-0.5 sm:max-w-[30rem] sm:gap-2">
        {weekdayLabels.map((weekday) => (
          <div
            key={weekday}
            className="flex h-5 items-center justify-center text-[10px] font-medium text-muted-foreground sm:h-6 sm:text-xs"
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
          const isPending = Boolean(pendingStatusDates?.has(day.date));
          const isUnavailable = Boolean(unavailableDates?.has(day.date));
          const recordedStatus = recordedStatusByDate?.get(day.date) ?? "Attended";
          const newStatus = newStatusByDate?.get(day.date) ?? activeStatus;
          const willChangeStatus =
            !isRecorded || recordedStatus.toLowerCase() !== activeStatus.toLowerCase();
          const shouldChangeStatus =
            isRecorded && Boolean(onStatusClick) && (isPending || willChangeStatus);
          const isClickPreviewable = shouldChangeStatus || !isRecorded;

          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={isSelected}
              title={
                isPending
                  ? `Staged as ${recordedStatus} — click to change, or Save to apply`
                  : isUnavailable
                    ? "Unavailable after discontinued date"
                  : isNew
                    ? newStatus.toLowerCase() === activeStatus.toLowerCase()
                      ? `Staged as ${newStatus} — click to cancel`
                      : `Staged as ${newStatus} — click to change to ${activeStatus}`
                    : shouldChangeStatus
                      ? `${recordedStatus} — click to stage ${activeStatus} (needs Save)`
                      : isRecorded
                        ? `${recordedStatus} — click to remove (needs Save)`
                      : !isRecorded
                        ? `Click to queue as ${activeStatus} (needs Save)`
                        : undefined
              }
              className={cn(
                "flex size-10 flex-col items-center justify-center gap-0 rounded-none border border-border text-sm font-medium transition-colors sm:size-14 sm:gap-0.5 sm:rounded-md sm:text-base",
                "bg-background hover:bg-muted",
                isClickPreviewable && !isUnavailable && activeStatusStyle.hoverRing,
                isSaved && getServiceStatusStyle(recordedStatus).cell,
                isNew && getServiceStatusStyle(newStatus).cell,
                (isPending || isNew) && "border-dashed",
                isExpected &&
                !isSelected &&
                !isRemoved &&
                "ring-2 ring-inset ring-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
                isRemoved &&
                "ring-2 ring-inset ring-rose-500 bg-rose-100 text-rose-950 line-through dark:bg-rose-950 dark:text-rose-100",
                isUnavailable &&
                "cursor-not-allowed border-zinc-800 bg-zinc-950 text-zinc-500 opacity-70 hover:bg-zinc-950 dark:border-zinc-700 dark:bg-black dark:text-zinc-500"
              )}
              disabled={isUnavailable}
              onClick={() =>
                shouldChangeStatus ? onStatusClick?.(day.date) : onToggleDate(day.date)
              }
            >
              <span>{day.dayNumber}</span>
              {isSaved && (recordedStatus.toLowerCase() !== "attended" || isPending) ? (
                <span className="text-[7px] leading-none font-normal uppercase sm:text-[9px]">
                  {recordedStatus}
                  {isPending ? "*" : ""}
                </span>
              ) : null}
              {isNew && newStatus.toLowerCase() !== "attended" ? (
                <span className="text-[7px] leading-none font-normal uppercase sm:text-[9px]">
                  {newStatus}*
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
