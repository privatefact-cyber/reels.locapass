"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Applicant {
  id: string;
  name: string;
  phone: string;
  dob: string | null;
  status: string;
  created_at?: string;
  age?: number;
  last_check_match_level?: string | null;
  last_check_hit_count?: number | null;
}

const MATCH_LEVEL_LABEL: Record<string, string> = {
  flagged: "該当あり",
  caution: "注意",
  none: "該当なし",
};

const MATCH_LEVEL_BADGE: Record<string, string> = {
  flagged: "bg-red-100 text-red-700",
  caution: "bg-yellow-100 text-yellow-700",
  none: "bg-slate-100 text-slate-600",
};

const STATUS_BADGE: Record<string, string> = {
  "未対応": "bg-slate-100 text-slate-700",
  "面接中": "bg-slate-100 text-blue-700",
  "採用": "bg-green-100 text-green-700",
  "見送り": "bg-slate-100 text-slate-600",
};

interface ApplicantListMasterDetailProps {
  applicants: Applicant[];
}

export function ApplicantListMasterDetail({ applicants }: ApplicantListMasterDetailProps) {
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | "">("");

  const selectedApplicant = applicants.find((a) => a.id === selectedApplicantId);
  const filteredApplicants = statusFilter
    ? applicants.filter((a) => a.status === statusFilter)
    : applicants;

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="flex h-full gap-6">
      {/* Master: Applicant List */}
      <div
        className={`w-full flex-shrink-0 transition-all ${
          selectedApplicant ? "hidden lg:block lg:w-1/3" : "block"
        }`}
      >
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter("")}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                statusFilter === ""
                  ? "bg-slate-700 text-main"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              全て
            </button>
            {["未対応", "面接中", "採用", "見送り"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  statusFilter === status
                    ? "bg-slate-700 text-main"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr className="h-12">
                    <th className="text-left px-4 font-semibold text-slate-700">応募日時</th>
                    <th className="text-left px-4 font-semibold text-slate-700">名前</th>
                    <th className="text-left px-4 font-semibold text-slate-700">年齢</th>
                    <th className="text-left px-4 font-semibold text-slate-700">ステータス</th>
                    <th className="text-center px-4 font-semibold text-slate-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredApplicants.map((applicant) => {
                    const isSelected = applicant.id === selectedApplicantId;
                    const age = calculateAge(applicant.dob);
                    return (
                      <tr
                        key={applicant.id}
                        onClick={() => setSelectedApplicantId(applicant.id)}
                        className={`h-14 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-slate-100 hover:bg-slate-100"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {applicant.created_at
                            ? format(new Date(applicant.created_at), "MM/dd HH:mm", { locale: ja })
                            : "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {applicant.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {age != null ? `${age}歳` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                              STATUS_BADGE[applicant.status] || STATUS_BADGE["未対応"]
                            }`}
                          >
                            {applicant.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApplicantId(applicant.id);
                            }}
                            className="text-slate-700 hover:text-slate-800 font-semibold text-xs"
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
            {filteredApplicants.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                該当する応募者がいません
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail: Info Panel */}
      {selectedApplicant && (
        <div className="flex flex-1 flex-col gap-4">
          <button
            onClick={() => setSelectedApplicantId(null)}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold text-sm"
          >
            ← 一覧に戻る
          </button>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{selectedApplicant.name}</h2>
              <p className="text-sm text-slate-500 mt-1">応募日: {selectedApplicant.created_at
                ? format(new Date(selectedApplicant.created_at), "yyyy年MM月dd日 HH:mm", { locale: ja })
                : "-"}</p>
            </div>

            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-700 text-sm">基本情報</h3>
              <div className="rounded-lg bg-slate-50 p-4 space-y-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">電話番号</p>
                  <p className="text-slate-600 mt-1">{selectedApplicant.phone}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">生年月日</p>
                  <p className="text-slate-600 mt-1">
                    {selectedApplicant.dob
                      ? `${selectedApplicant.dob} (${calculateAge(selectedApplicant.dob)}歳)`
                      : "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Background Check */}
            {selectedApplicant.last_check_match_level && (
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-700 text-sm">与信照会結果</h3>
                <div className="rounded-lg bg-slate-50 p-4">
                  <span
                    className={`inline-block px-3 py-1.5 rounded-full text-sm font-semibold ${
                      MATCH_LEVEL_BADGE[selectedApplicant.last_check_match_level] ||
                      MATCH_LEVEL_BADGE["none"]
                    }`}
                  >
                    {MATCH_LEVEL_LABEL[selectedApplicant.last_check_match_level] ||
                      selectedApplicant.last_check_match_level}
                    {selectedApplicant.last_check_hit_count &&
                      selectedApplicant.last_check_hit_count > 0 &&
                      ` (${selectedApplicant.last_check_hit_count}件)`}
                  </span>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-700 text-sm">ステータス</h3>
              <div className="rounded-lg bg-slate-50 p-4">
                <span
                  className={`inline-block px-3 py-1.5 rounded-full text-sm font-semibold ${
                    STATUS_BADGE[selectedApplicant.status] || STATUS_BADGE["未対応"]
                  }`}
                >
                  {selectedApplicant.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ※ ステータスの変更は詳細ページで行ってください
              </p>
            </div>

            {/* Action Button */}
            <button className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-main font-semibold rounded-lg transition-colors">
              詳細を編集
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
