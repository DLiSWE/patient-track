import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { getProviderLabel, type Member } from "@/lib/member-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function NewMembersCard({
  description,
  emptyMessage = "No new members this month",
  getDate = (member) => member.createdAt,
  members,
  onPageChange,
  page,
  pageSize,
  title = "New members",
}: {
  description?: string;
  emptyMessage?: string;
  getDate?: (member: Member) => string;
  members: Member[];
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  title?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(members.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleMembers = members.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? `${members.length} joined this month`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {visibleMembers.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.provider ? getProviderLabel(member.provider) : "No provider"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(getDate(member)).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={safePage === 0}
              onClick={() => onPageChange(Math.max(0, safePage - 1))}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => onPageChange(Math.min(pageCount - 1, safePage + 1))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
