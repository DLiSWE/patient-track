import type { ReactNode } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CrownIcon,
  HistoryIcon,
  ShieldCheckIcon,
} from "lucide-react";

import type { AppProfile } from "@/lib/admin-store";
import type { AuditEvent } from "@/lib/audit-store";
import type { SecurityEvent } from "@/lib/security-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const onlineWindowMinutes = 5;

export type AdminPanelProps = {
  adminAuditEvents: AuditEvent[];
  adminAuditPage: number;
  adminAuditPageCount: number;
  currentProfile: AppProfile | null;
  isLoading: boolean;
  onAdminAuditPageChange: (page: number) => void;
  onRefresh: () => void;
  onSecurityEventPageChange: (page: number) => void;
  onlineProfiles: AppProfile[];
  securityEventPage: number;
  securityEventPageCount: number;
  securityEvents: SecurityEvent[];
};

export function AdminPanel({
  adminAuditEvents,
  adminAuditPage,
  adminAuditPageCount,
  currentProfile,
  isLoading,
  onAdminAuditPageChange,
  onRefresh,
  onSecurityEventPageChange,
  onlineProfiles,
  securityEventPage,
  securityEventPageCount,
  securityEvents,
}: AdminPanelProps) {
  const onlineCount = onlineProfiles.length;
  const superAdminCount = onlineProfiles.filter(
    (profile) => profile.role === "super_admin"
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        <AdminMetric
          icon={<CrownIcon className="size-4" />}
          label="Current role"
          value={currentProfile?.role === "super_admin" ? "Super admin" : "Admin"}
          tone="gold"
        />
        <AdminMetric
          icon={<ActivityIcon className="size-4" />}
          label="Online now"
          value={String(onlineCount)}
          tone="green"
        />
        <AdminMetric
          icon={<AlertTriangleIcon className="size-4" />}
          label="Security alerts"
          value={String(securityEvents.length)}
          tone="red"
        />
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Online users</CardTitle>
            <CardDescription>
              Users with activity in the last {onlineWindowMinutes} minutes.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" disabled={isLoading} onClick={onRefresh}>
            <ActivityIcon data-icon="inline-start" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {onlineProfiles.length === 0 ? (
            <EmptyAdminState message="No active users found right now." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {onlineProfiles.map((profile) => (
                    <TableRow key={profile.userId}>
                      <TableCell>
                        <div className="flex min-w-52 flex-col">
                          <span className="font-medium">
                            {profile.displayName || profile.email || "Unknown user"}
                          </span>
                          {profile.email ? (
                            <span className="text-xs text-muted-foreground">
                              {profile.email}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={profile.role} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {profile.lastSeenAt ? formatDateTime(profile.lastSeenAt) : "Unknown"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Security events</CardTitle>
            <CardDescription>Recent sign-in lockouts and warning details.</CardDescription>
          </div>
          <AdminPager
            disabled={isLoading}
            page={securityEventPage}
            pageCount={securityEventPageCount}
            onPageChange={onSecurityEventPageChange}
          />
        </CardHeader>
        <CardContent>
          {securityEvents.length === 0 ? (
            <EmptyAdminState message="No security events found." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Attempted email</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Locked until</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>User agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {securityEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">
                        {event.attemptedEmail || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge className="border-red-300/30 bg-red-300/10 text-red-100" variant="outline">
                          {event.attemptCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(event.lockedUntil)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                        {event.userAgent || "Not captured"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Admin activity</CardTitle>
            <CardDescription>High-impact changes pulled from the audit log.</CardDescription>
          </div>
          <AdminPager
            disabled={isLoading}
            page={adminAuditPage}
            pageCount={adminAuditPageCount}
            onPageChange={onAdminAuditPageChange}
          />
        </CardHeader>
        <CardContent>
          {adminAuditEvents.length === 0 ? (
            <EmptyAdminState message="No sensitive admin actions found." />
          ) : (
            <div className="grid gap-2">
              {adminAuditEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border bg-card/60 p-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {event.action.replaceAll("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{event.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actorEmail || "Unknown user"}
                      </p>
                    </div>
                    <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  {Object.keys(event.metadata).length > 0 ? (
                    <pre className="mt-3 max-h-36 overflow-auto rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "gold" | "green" | "blue" | "red";
}) {
  const toneClass =
    tone === "gold"
      ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
      : tone === "green"
        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
        : tone === "red"
          ? "border-red-300/30 bg-red-300/10 text-red-100"
          : "border-sky-300/30 bg-sky-300/10 text-sky-100";

  return (
    <Card className={toneClass}>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 items-center justify-center rounded-md border border-current/25 bg-background/20">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-current/70">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminPager({
  disabled,
  page,
  pageCount,
  onPageChange,
}: {
  disabled: boolean;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Page {page + 1} of {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={disabled || page <= 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={disabled || page >= pageCount - 1}
        onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

function EmptyAdminState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="outline" className="capitalize">
      {role.replaceAll("_", " ")}
    </Badge>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/New_York",
  });
}
