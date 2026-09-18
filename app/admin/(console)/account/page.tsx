import { requireAdmin } from "@/lib/admin/require-admin";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";

export default async function AdminAccountPage() {
  const user = await requireAdmin();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">アカウント設定</h1>
        <p className="mt-1 text-sm text-slate-500">{user.email}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">パスワード変更</h2>
        <p className="mt-1 text-xs text-slate-500">
          初期パスワードのまま運用している場合は、ここで変更してください。
        </p>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
