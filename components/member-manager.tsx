"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AlertCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  Member,
  MemberFormValues,
  createMember,
  emptyMemberForm,
  seedMembers,
  storageKey,
  updateMember,
} from "@/lib/member-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function MemberManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState<MemberFormValues>(emptyMemberForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  useEffect(() => {
    const savedMembers = window.localStorage.getItem(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(savedMembers ? JSON.parse(savedMembers) : seedMembers);
  }, []);

  useEffect(() => {
    if (members.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(members));
    }
  }, [members]);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return members;
    }

    return members.filter((member) =>
      [member.displayName, member.provider, member.serviceDays]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [members, query]);

  const providerCount = useMemo(
    () => new Set(members.map((member) => member.provider).filter(Boolean)).size,
    [members]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedForm = {
      displayName: form.displayName.trim(),
      provider: form.provider.trim(),
      serviceDays: form.serviceDays.trim(),
    };

    if (!cleanedForm.displayName) {
      return;
    }

    if (editingId) {
      setMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.id === editingId ? updateMember(member, cleanedForm) : member
        )
      );
    } else {
      setMembers((currentMembers) => [createMember(cleanedForm), ...currentMembers]);
    }

    resetForm();
  }

  function editMember(member: Member) {
    setEditingId(member.id);
    setForm({
      displayName: member.displayName,
      provider: member.provider,
      serviceDays: member.serviceDays,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyMemberForm);
  }

  function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setMembers((currentMembers) =>
      currentMembers.filter((member) => member.id !== deleteTarget.id)
    );

    if (editingId === deleteTarget.id) {
      resetForm();
    }

    setDeleteTarget(null);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-7 bg-sidebar px-6 py-7 text-sidebar-foreground lg:px-8">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-sidebar-foreground/70">
              Sophia Members
            </p>
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                Member directory
              </h1>
              <p className="text-sm leading-6 text-sidebar-foreground/70">
                Store only the operational basics: member name, provider, and
                service days.
              </p>
            </div>
          </div>

          <Alert className="bg-sidebar-accent text-sidebar-accent-foreground">
            <AlertCircleIcon data-icon="inline-start" />
            <AlertTitle>Keep out</AlertTitle>
            <AlertDescription className="text-sidebar-accent-foreground/70">
              DOBs, insurance IDs, authorization numbers, claim notes, diagnoses.
            </AlertDescription>
          </Alert>

          <div className="mt-auto flex flex-col gap-3">
            <Metric label="Members" value={members.length} />
            <Metric label="Providers" value={providerCount} />
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-7">
          <div className="mx-auto flex max-w-6xl flex-col gap-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight">Members</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredMembers.length} shown
                </p>
              </div>

              <Input
                aria-label="Search members"
                className="sm:w-80"
                placeholder="Search name, provider, days"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </header>

            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="xl:sticky xl:top-5">
                <CardHeader>
                  <CardTitle>{editingId ? "Update member" : "Add member"}</CardTitle>
                  <CardDescription>
                    These are the only fields this app saves.
                  </CardDescription>
                  {editingId ? (
                    <CardAction>
                      <Button variant="ghost" size="sm" onClick={resetForm}>
                        Cancel
                      </Button>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                    <Field label="Member name" htmlFor="display-name">
                      <Input
                        id="display-name"
                        placeholder="Last, First M."
                        value={form.displayName}
                        onChange={(event) =>
                          setForm({ ...form, displayName: event.target.value })
                        }
                        required
                      />
                    </Field>

                    <Field label="Provider" htmlFor="provider">
                      <Input
                        id="provider"
                        placeholder="VCM, SWH, Anthem"
                        value={form.provider}
                        onChange={(event) =>
                          setForm({ ...form, provider: event.target.value })
                        }
                      />
                    </Field>

                    <Field label="Service days" htmlFor="service-days">
                      <Input
                        id="service-days"
                        placeholder="Mon, Wed, Fri"
                        value={form.serviceDays}
                        onChange={(event) =>
                          setForm({ ...form, serviceDays: event.target.value })
                        }
                      />
                    </Field>

                    <Button type="submit">
                      <PlusIcon data-icon="inline-start" />
                      {editingId ? "Save changes" : "Add member"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Directory</CardTitle>
                  <CardDescription>
                    Lightweight shared list for schedule coordination.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredMembers.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
                      <h3 className="font-medium">No members found</h3>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Adjust the search or add a new member from the form.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Service days</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMembers.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">
                              {member.displayName}
                            </TableCell>
                            <TableCell>{member.provider || "Not set"}</TableCell>
                            <TableCell>{member.serviceDays || "Not set"}</TableCell>
                            <TableCell>
                              {new Date(member.updatedAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => editMember(member)}
                                >
                                  <PencilIcon data-icon="inline-start" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeleteTarget(member)}
                                >
                                  <Trash2Icon data-icon="inline-start" />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the local record for {deleteTarget?.displayName}. This
              cannot be undone in this browser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep member</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-t border-sidebar-border pt-3">
      <span className="text-sm text-sidebar-foreground/70">{label}</span>
      <strong className="text-2xl">{value}</strong>
    </div>
  );
}
