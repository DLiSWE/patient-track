"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  RefreshCcwIcon,
  SearchIcon,
  ShieldIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "lucide-react";

import {
  AuditEntityType,
  AuditEvent,
  fetchAuditEvents,
} from "@/lib/audit-store";
import { supabase } from "@/lib/supabase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const auditTypeOptions = ["All", "member", "service", "claim", "security"] as const;
const auditPageSize = 10;

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<(typeof auditTypeOptions)[number]>("All");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await fetchAuditEvents(supabase, 150);

    if (result.error) {
      setErrorMessage(result.error.message);
      setEvents([]);
    } else {
      setErrorMessage(null);
      setEvents(result.data);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      if (typeFilter !== "All" && event.entityType !== typeFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        event.action,
        event.summary,
        event.actorEmail,
        event.entityType,
        JSON.stringify(event.metadata),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [events, query, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<AuditEntityType, number> = {
      claim: 0,
      member: 0,
      security: 0,
      service: 0,
    };

    for (const event of events) {
      counts[event.entityType] += 1;
    }

    return counts;
  }, [events]);

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / auditPageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleEvents = filteredEvents.slice(
    safePage * auditPageSize,
    safePage * auditPageSize + auditPageSize
  );

  function exportAuditLog() {
    const rows = filteredEvents.map((event) => ({
      action: event.action,
      actorEmail: event.actorEmail ?? "",
      createdAt: event.createdAt,
      entityId: event.entityId ?? "",
      entityType: event.entityType,
      metadata: JSON.stringify(event.metadata),
      summary: event.summary,
    }));

    downloadCsv("audit-log.csv", rows);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AuditStat label="Members" value={typeCounts.member} entityType="member" />
        <AuditStat label="Services" value={typeCounts.service} entityType="service" />
        <AuditStat label="Claims" value={typeCounts.claim} entityType="claim" />
        <AuditStat label="Security" value={typeCounts.security} entityType="security" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Recent changes made by signed-in users across members, services, and claims.
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportAuditLog}
              disabled={filteredEvents.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              Export
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={loadEvents}>
              <RefreshCcwIcon data-icon="inline-start" />
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search audit log"
                className="pl-9"
                placeholder="Search action, user, or member"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value as (typeof auditTypeOptions)[number]);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-full">
                <span className="truncate text-left">
                  {typeFilter === "All" ? "All activity" : typeFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {auditTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "All" ? "All activity" : option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircleIcon data-icon="inline-start" />
              <AlertTitle>Audit log unavailable</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon data-icon="inline-start" />
              Loading audit log
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
              <h3 className="font-medium">No audit events found</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Actions will appear here after the audit table is added in Supabase.
              </p>
            </div>
          ) : (
            <>
              <div className="relative flex flex-col gap-3">
                {visibleEvents.map((event) => (
                  <AuditEventRow key={event.id} event={event} />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Page {safePage + 1} of {pageCount} · {filteredEvents.length} events
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={safePage === 0}
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditStat({
  entityType,
  label,
  value,
}: {
  entityType: AuditEntityType;
  label: string;
  value: number;
}) {
  const style = getAuditStyle(entityType);

  return (
    <div className={cn("rounded-lg border p-3", style.soft)}>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <style.Icon className={cn("size-4", style.icon)} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const style = getAuditStyle(event.entityType);
  const metadataEntries = Object.entries(event.metadata).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
      <div className={cn("flex size-10 items-center justify-center rounded-full", style.soft)}>
        <style.Icon className={cn("size-5", style.icon)} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={style.badge}>{event.entityType}</Badge>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {formatActionLabel(event.action)}
          </span>
        </div>
        <p className="mt-1 font-medium">{event.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {event.actorEmail || "Unknown user"} · {new Date(event.createdAt).toLocaleString()}
        </p>
        {metadataEntries.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {metadataEntries.slice(0, 6).map(([key, value]) => (
              <Badge key={key} variant="secondary" className="max-w-full">
                <span className="truncate">
                  {formatActionLabel(key)}: {formatMetadataValue(value)}
                </span>
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-xs text-muted-foreground md:text-right">
        {formatRelativeAuditTime(event.createdAt)}
      </span>
    </div>
  );
}

function getAuditStyle(entityType: AuditEntityType) {
  const styles = {
    claim: {
      Icon: FileTextIcon,
      badge:
        "border-sky-500/40 bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
      icon: "text-sky-600 dark:text-sky-300",
      soft: "border-sky-500/30 bg-sky-500/10",
    },
    member: {
      Icon: UserRoundIcon,
      badge:
        "border-emerald-500/40 bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
      icon: "text-emerald-600 dark:text-emerald-300",
      soft: "border-emerald-500/30 bg-emerald-500/10",
    },
    security: {
      Icon: ShieldIcon,
      badge:
        "border-amber-500/40 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
      icon: "text-amber-600 dark:text-amber-300",
      soft: "border-amber-500/30 bg-amber-500/10",
    },
    service: {
      Icon: StethoscopeIcon,
      badge:
        "border-violet-500/40 bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
      icon: "text-violet-600 dark:text-violet-300",
      soft: "border-violet-500/30 bg-violet-500/10",
    },
  } satisfies Record<AuditEntityType, unknown>;

  return styles[entityType];
}

function formatActionLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatMetadataValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ["message"];
  const csvRows = rows.length > 0 ? rows : [{ message: "No rows for this export" }];
  const csv = [
    headers.join(","),
    ...csvRows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function formatRelativeAuditTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}
