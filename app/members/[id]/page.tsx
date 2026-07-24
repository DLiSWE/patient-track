import { MemberManager } from "@/components/member-manager";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <MemberManager initialSelectedMemberId={id} initialView="member" />;
}
