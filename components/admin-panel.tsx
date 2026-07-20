import type { ReactNode } from "react";
import { ActivityIcon, CrownIcon, ShieldCheckIcon } from "lucide-react";

import type { AppProfile } from "@/lib/admin-store";
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

type AdminPanelProps = {
  currentProfile: AppProfile | null;
  onlineProfiles: AppProfile[];
  isLoading: boolean;
  onRefresh: () => void;
};

export function AdminPanel({
  currentProfile,
  onlineProfiles,
  isLoading,
  onRefresh,
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
          icon={<ShieldCheckIcon className="size-4" />}
          label="Super admins online"
          value={String(superAdminCount)}
          tone="blue"
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
            <div className="rounded-lg border bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
              No active users found right now.
            </div>
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
                        <Badge variant="outline" className="capitalize">
                          {profile.role.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {profile.lastSeenAt
                          ? new Date(profile.lastSeenAt).toLocaleString()
                          : "Unknown"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
  tone: "gold" | "green" | "blue";
}) {
  const toneClass =
    tone === "gold"
      ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
      : tone === "green"
        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
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
