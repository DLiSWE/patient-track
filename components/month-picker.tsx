"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMonthLabel, getMonthInputValue } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const monthShortLabels = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleDateString([], { month: "short" })
);

// "September 2026 ▾" button that opens a year + 12-month grid. Built on the
// Popover rather than <input type="month">, which Firefox doesn't support.
export function MonthPicker({
  className,
  month,
  onChange,
}: {
  className?: string;
  month: string;
  onChange: (month: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(month.slice(0, 4)));
  const selectedYear = Number(month.slice(0, 4));
  const selectedMonthIndex = Number(month.slice(5, 7)) - 1;
  const currentMonth = getMonthInputValue();

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (nextOpen) {
          setViewYear(selectedYear);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("min-w-32 justify-center gap-1 font-medium", className)}
            aria-label={`Choose month, currently ${formatMonthLabel(month)}`}
          />
        }
      >
        {formatMonthLabel(month)}
        <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous year"
            onClick={() => setViewYear((year) => year - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="text-sm font-semibold">{viewYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next year"
            onClick={() => setViewYear((year) => year + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {monthShortLabels.map((label, index) => {
            const value = `${viewYear}-${String(index + 1).padStart(2, "0")}`;
            const isSelected = viewYear === selectedYear && index === selectedMonthIndex;

            return (
              <Button
                key={value}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                  !isSelected && value === currentMonth && "ring-1 ring-inset ring-primary/50"
                )}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(value);
                  setIsOpen(false);
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
