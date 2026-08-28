import { MemberManager, type ActiveView } from "@/components/member-manager";

const allowedViews = new Set<ActiveView>([
  "members",
  "services",
  "claims",
  "summary",
  "audit",
  "admin",
]);

function getInitialView(view: string | undefined): ActiveView {
  if (view && allowedViews.has(view as ActiveView)) {
    return view as ActiveView;
  }

  return "members";
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;

  return <MemberManager initialView={getInitialView(params.view)} />;
}
