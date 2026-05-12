import { Suspense } from "react";
import ThreadRoutePage from "@/components/ThreadRoutePage";

export default function ThreadRoute() {
  return (
    <Suspense fallback={<div className="loading-screen">Loading Todoay...</div>}>
      <ThreadRoutePage />
    </Suspense>
  );
}
