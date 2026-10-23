import type { Metadata } from "next";

// 店長・管理者専用のログイン。ホーム画面に追加したときの名前をわかりやすくする(検索には出さない)。
export const metadata: Metadata = {
  title: "LOCAPASS 店長ログイン",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "LOCAPASS 店長ログイン" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
