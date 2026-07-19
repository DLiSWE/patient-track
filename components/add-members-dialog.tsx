"use client";

import { FormEvent, useState } from "react";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  getProviderLabel,
  normalizeServiceDays,
  providerOptions,
} from "@/lib/member-store";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

type BulkMemberRow = {
  key: string;
  displayName: string;
  provider: string;
  serviceDays: string;
};

function createEmptyRow(): BulkMemberRow {
  return { key: crypto.randomUUID(), displayName: "", provider: "", serviceDays: "" };
}

export function AddMembersDialog({
  initialRowCount = 1,
  isSaving,
  onOpenChange,
  onSubmit,
  open,
}: {
  initialRowCount?: number;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    rows: { displayName: string; provider: string; serviceDays: string }[]
  ) => Promise<boolean>;
  open: boolean;
}) {
  const [rows, setRows] = useState<BulkMemberRow[]>(() =>
    createEmptyRows(initialRowCount)
  );

  function resetState() {
    setRows(createEmptyRows(initialRowCount));
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, createEmptyRow()]);
  }

  function removeRow(key: string) {
    setRows((currentRows) =>
      currentRows.length > 1 ? currentRows.filter((row) => row.key !== key) : currentRows
    );
  }

  function updateRow(key: string, changes: Partial<BulkMemberRow>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.key === key ? { ...row, ...changes } : row))
    );
  }

  const startedRows = rows.filter(
    (row) => row.displayName.trim() || row.provider.trim() || row.serviceDays.trim()
  );
  const validRows = startedRows.filter(
    (row) =>
      row.displayName.trim() &&
      row.provider.trim() &&
      normalizeServiceDays(row.serviceDays)
  );
  const hasIncompleteRows = startedRows.length !== validRows.length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validRows.length === 0) {
      return;
    }

    const succeeded = await onSubmit(
      validRows.map((row) => ({
        displayName: row.displayName,
        provider: row.provider,
        serviceDays: row.serviceDays,
      }))
    );

    if (succeeded) {
      resetState();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetState();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add multiple members</DialogTitle>
          <DialogDescription>
            Add a row for each member, with their own provider and service days.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <div key={row.key} className="flex items-end gap-2 rounded-lg border p-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                  <Field label={`Member ${index + 1} name`} htmlFor={`bulk-name-${row.key}`}>
                    <Input
                      id={`bulk-name-${row.key}`}
                      autoComplete="off"
                      autoCorrect="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      placeholder="Last, First M."
                      value={row.displayName}
                      onChange={(event) =>
                        updateRow(row.key, { displayName: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Provider" htmlFor={`bulk-provider-${row.key}`}>
                    <Select
                      value={row.provider}
                      onValueChange={(value) => updateRow(row.key, { provider: value ?? "" })}
                    >
                      <SelectTrigger id={`bulk-provider-${row.key}`} className="w-full">
                        <span className="truncate text-left">
                          {row.provider ? getProviderLabel(row.provider) : "Select provider"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {providerOptions.map((provider) => (
                            <SelectItem key={provider.value} value={provider.value}>
                              {provider.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Service days" htmlFor={`bulk-service-days-${row.key}`}>
                    <Input
                      id={`bulk-service-days-${row.key}`}
                      autoComplete="off"
                      autoCorrect="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      placeholder="MTWTHF"
                      value={row.serviceDays}
                      onChange={(event) =>
                        updateRow(row.key, { serviceDays: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove member ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addRow}>
            <PlusIcon data-icon="inline-start" />
            Add another member
          </Button>
          {hasIncompleteRows ? (
            <p className="text-sm text-destructive">
              Complete name, provider, and service days for each started row.
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={isSaving || validRows.length === 0 || hasIncompleteRows}
            >
              {isSaving ? (
                <Loader2Icon data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              Add {validRows.length} member{validRows.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function createEmptyRows(count: number) {
  return Array.from({ length: Math.max(1, Math.min(25, count)) }, createEmptyRow);
}
