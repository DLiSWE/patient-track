"use client";

import { BellIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HoldEndingAlert } from "@/lib/notifications";
import { cn } from "@/lib/utils";

function formatDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function holdEndingLabel(alert: HoldEndingAlert) {
  if (alert.daysUntilEnd > 0) {
    return `Hold ends in ${alert.daysUntilEnd}d (${formatDate(alert.lastHoldDate)})`;
  }
  if (alert.daysUntilEnd === 0) {
    return `Hold ends today (${formatDate(alert.lastHoldDate)})`;
  }
  return `Hold ended ${Math.abs(alert.daysUntilEnd)}d ago (${formatDate(alert.lastHoldDate)})`;
}

export function NotificationsBell({
  holdEndingAlerts,
  onSelectMember,
  className,
}: {
  holdEndingAlerts: HoldEndingAlert[];
  onSelectMember: (memberId: string) => void;
  className?: string;
}) {
  const count = holdEndingAlerts.length;

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
      <PopoverContent>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Notifications
        </p>
        {count === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            Nothing needs attention right now.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {holdEndingAlerts.map((alert) => (
              <PopoverClose
                key={alert.memberId}
                render={
                  <button
                    type="button"
                    className="flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted"
                  />
                }
                onClick={() => onSelectMember(alert.memberId)}
              >
                <span className="truncate text-sm font-medium">
                  {alert.memberName}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    alert.daysUntilEnd <= 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {holdEndingLabel(alert)}
                </span>
              </PopoverClose>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
