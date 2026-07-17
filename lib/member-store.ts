export type Member = {
  id: string;
  displayName: string;
  provider: string;
  serviceDays: string;
  updatedAt: string;
};

export type MemberFormValues = Omit<Member, "id" | "updatedAt">;

export const emptyMemberForm: MemberFormValues = {
  displayName: "",
  provider: "",
  serviceDays: "",
};

export const seedMembers: Member[] = [
  {
    id: "seed-1",
    displayName: "Kim, Mina",
    provider: "VCM",
    serviceDays: "Mon, Wed, Fri",
    updatedAt: "2026-07-16T09:00:00.000Z",
  },
  {
    id: "seed-2",
    displayName: "Park, Daniel J.",
    provider: "Senior Whole Health",
    serviceDays: "Tue, Thu",
    updatedAt: "2026-07-16T09:10:00.000Z",
  },
];

export const storageKey = "sophia-members-v2";

export function createMember(values: MemberFormValues): Member {
  return {
    ...values,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
}

export function updateMember(existing: Member, values: MemberFormValues): Member {
  return {
    ...existing,
    ...values,
    updatedAt: new Date().toISOString(),
  };
}
