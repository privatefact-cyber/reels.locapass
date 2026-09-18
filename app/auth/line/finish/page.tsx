import { Suspense } from "react";
import { LineFinishClient } from "@/components/LineFinishClient";

export default function LineFinishPage() {
  return (
    <Suspense>
      <LineFinishClient />
    </Suspense>
  );
}
