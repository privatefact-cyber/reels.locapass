import { Suspense } from "react";
import { MypageLoginForm } from "@/components/MypageLoginForm";

export default function MypageLoginPage() {
  return (
    <Suspense>
      <MypageLoginForm />
    </Suspense>
  );
}
