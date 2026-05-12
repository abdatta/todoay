"use client";

import { useSearchParams } from "next/navigation";
import ThreadPage from "@/components/ThreadPage";

export default function ThreadRoutePage() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId") ?? "";

  return <ThreadPage threadId={threadId} />;
}
