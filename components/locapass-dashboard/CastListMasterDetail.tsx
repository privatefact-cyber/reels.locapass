"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface CastMember {
  id: string;
  name: string;
  age: number | null;
  pr_text: string | null;
  created_at?: string;
  media?: Array<{ url: string }>;
  followerCount?: number;
}

interface CastListMasterDetailProps {
  castMembers: CastMember[];
  /** キャスト詳細ページの親パス(例: /dashboard/shop/[shopId]/cast)。本家の /dashboard/cast に相当。 */
  detailBasePath: string;
}

export function CastListMasterDetail({ castMembers, detailBasePath }: CastListMasterDetailProps) {
  const [selectedCastId, setSelectedCastId] = useState<string | null>(null);

  const selectedCast = castMembers.find((c) => c.id === selectedCastId);

  return (
    <div className="flex h-full gap-6">
      {/* Master: Cast List Table */}
      <div
        className={`w-full flex-shrink-0 transition-all ${
          selectedCast ? "hidden lg:block lg:w-1/3" : "block"
        }`}
      >
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr className="h-12">
                  <th className="text-left px-4 font-semibold text-slate-700">写真</th>
                  <th className="text-left px-4 font-semibold text-slate-700">源氏名</th>
                  <th className="text-left px-4 font-semibold text-slate-700">年齢</th>
                  <th className="text-left px-4 font-semibold text-slate-700">フォロワー</th>
                  <th className="text-left px-4 font-semibold text-slate-700">更新日</th>
                  <th className="text-center px-4 font-semibold text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {castMembers.map((cast) => {
                  const isSelected = cast.id === selectedCastId;
                  const photoUrl = cast.media?.[0]?.url;
                  return (
                    <tr
                      key={cast.id}
                      onClick={() => setSelectedCastId(cast.id)}
                      className={`h-14 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-slate-100 hover:bg-slate-100"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt={cast.name}
                            className="h-10 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-8 rounded bg-slate-200" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{cast.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {cast.age != null ? `${cast.age}歳` : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cast.followerCount ?? 0}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {cast.created_at
                          ? format(new Date(cast.created_at), "MM/dd", { locale: ja })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCastId(cast.id);
                          }}
                          className="text-slate-700 hover:text-blue-700 font-semibold text-xs"
                        >
                          編集
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail: Edit Panel */}
      {selectedCast && (
        <div className="flex flex-1 flex-col gap-4">
          <button
            onClick={() => setSelectedCastId(null)}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold text-sm"
          >
            ← パートナー一覧に戻る
          </button>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                {selectedCast.name} の管理
              </h2>
            </div>

            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-700 text-sm">基本情報</h3>
              <div className="rounded-lg bg-slate-50 p-4 space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-900">源氏名:</span> {selectedCast.name}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">年齢:</span>{" "}
                  {selectedCast.age != null ? `${selectedCast.age}歳` : "-"}
                </p>
                {selectedCast.pr_text && (
                  <p>
                    <span className="font-semibold text-slate-900">PR文:</span>
                    <br />
                    <span className="text-slate-600">{selectedCast.pr_text}</span>
                  </p>
                )}
              </div>
              <Link
                href={`${detailBasePath}/${selectedCast.id}`}
                className="inline-block mt-3 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-main text-sm font-semibold rounded-lg transition-colors"
              >
                詳細を編集
              </Link>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-700 text-sm">クイックアクション</h3>
              <div className="grid gap-2">
                <Link
                  href={`${detailBasePath}/${selectedCast.id}#schedule`}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold rounded-lg transition-colors text-center"
                >
                  出勤スケジュール
                </Link>
                <Link
                  href={`${detailBasePath}/${selectedCast.id}#diary`}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold rounded-lg transition-colors text-center"
                >
                  日記・投稿
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
