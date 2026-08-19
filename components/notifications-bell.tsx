"use client";

import { useState } from "react";
import { BellIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addDaysToDateString } from "@/lib/date-utils";
import type { NotificationItem, NotificationSeverity } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const severityTextClass: Record<NotificationSeverity, string> = {
  critical: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
};

const extendWeekPresets = [1, 2, 4];

function formatShortDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function groupByCategory(notifications: NotificationItem[]) {
  const categories: string[] = [];
  const itemsByCategory = new Map<string, NotificationItem[]>();

  for (const item of notifications) {
    const existing = itemsByCategory.get(item.category);
    if (existing) {
      existing.push(item);
    } else {
      categories.push(item.category);
      itemsByCategory.set(item.category, [item]);
    }
  }

  return categories.map((category) => ({
    category,
    items: itemsByCategory.get(category) ?? [],
  }));
}

function ExtendStatusControl({
  item,
  isExtending,
  onExtendStatus,
}: {
  item: NotificationItem;
  isExtending: boolean;
  onExtendStatus: (item: NotificationItem, weeks: number) => void;
}) {
  const [pendingWeeks, setPendingWeeks] = useState<number | null>(null);
  const resolution = item.resolution;

  if (!resolution) {
    return null;
  }

  if (pendingWeeks !== null) {
    const throughDate = formatShortDate(
      addDaysToDateString(resolution.lastStatusDate, pendingWeeks * 7)
    );

    return (
      <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
        <span className="text-xs text-muted-foreground">Extend to {throughDate}?</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={isExtending}
          onClick={() => {
            onExtendStatus(item, pendingWeeks);
            setPendingWeeks(null);
          }}
        >
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={isExtending}
          onClick={() => setPendingWeeks(null)}
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      {extendWeekPresets.map((weeks) => (
        <Button
          key={weeks}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={isExtending}
          onClick={() => setPendingWeeks(weeks)}
        >
          {weeks}wk
        </Button>
      ))}
    </div>
  );
}

function NotificationRow({
  item,
  isExtending,
  onSelectMember,
  onExtendStatus,
}: {
  item: NotificationItem;
  isExtending: boolean;
  onSelectMember: (memberId: string) => void;
  onExtendStatus: (item: NotificationItem, weeks: number) => void;
}) {
  const content = (
    <>
      <span className="truncate text-sm font-medium">{item.title}</span>
      <span className={cn("text-xs", severityTextClass[item.severity])}>
        {item.description}
      </span>
    </>
  );

  if (!item.memberId) {
    return (
      <div className="flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left">
        {content}
      </div>
    );
  }

  const memberId = item.memberId;

  if (!item.resolution) {
    return (
      <PopoverClose
        render={
          <button
            type="button"
            className="flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted"
          />
        }
        onClick={() => onSelectMember(memberId)}
      >
        {content}
      </PopoverClose>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border px-2.5 py-2">
      <PopoverClose
        render={
          <button
            type="button"
            className="flex flex-col items-start gap-0.5 text-left transition-colors hover:opacity-80"
          />
        }
        onClick={() => onSelectMember(memberId)}
      >
        {content}
      </PopoverClose>
      <ExtendStatusControl item={item} isExtending={isExtending} onExtendStatus={onExtendStatus} />
    </div>
  );
}

export function NotificationsBell({
  notifications,
  isExtendingStatus = false,
  onSelectMember,
  onExtendStatus,
  className,
}: {
  notifications: NotificationItem[];
  isExtendingStatus?: boolean;
  onSelectMember: (memberId: string) => void;
  onExtendStatus: (item: NotificationItem, weeks: number) => void;
  className?: string;
}) {
  const count = notifications.length;
  const groups = groupByCategory(notifications);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn("relative", className)}
            aria-label={
              count > 0 ? `${count} notification${count === 1 ? "" : "s"}` : "Notifications"
            }
          />
        }
      >
        <BellIcon />
        {count > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
          >
            {count}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="max-h-96 overflow-y-auto">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Notifications
        </p>
        {count === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            Nothing needs attention right now.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.category} className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.category}
                </p>
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    isExtending={isExtendingStatus}
                    onSelectMember={onSelectMember}
                    onExtendStatus={onExtendStatus}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
