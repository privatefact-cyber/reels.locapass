"use client";

import { useState } from "react";
import { CastIdScanModal, type ScannedIdFields } from "./CastIdScanModal";

function calcAge(birthDate: string): number | null {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function CastIdentityFields({
  defaultLegalName = "",
  defaultLegalNameKana = "",
  defaultBirthDate = "",
  defaultAddress = "",
  defaultPhone = "",
}: {
  defaultLegalName?: string;
  defaultLegalNameKana?: string;
  defaultBirthDate?: string;
  defaultAddress?: string;
  defaultPhone?: string;
}) {
  const [legalName, setLegalName] = useState(defaultLegalName);
  const [legalNameKana, setLegalNameKana] = useState(defaultLegalNameKana);
  const [birthDate, setBirthDate] = useState(defaultBirthDate);
  const [address, setAddress] = useState(defaultAddress);
  const [phone, setPhone] = useState(defaultPhone);

  const age = birthDate ? calcAge(birthDate) : null;
  const isMinor = age !== null && age < 18;

  function handleScanResult(fields: ScannedIdFields) {
    if (fields.legal_name) setLegalName(fields.legal_name);
    if (fields.legal_name_kana) setLegalNameKana(fields.legal_name_kana);
    if (fields.birth_date) setBirthDate(fields.birth_date);
    if (fields.address) setAddress(fields.address);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">本人確認情報(従業者名簿用)</h3>
        <CastIdScanModal onResult={handleScanResult} />
      </div>

      {isMinor && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          ⚠ 生年月日から18歳未満の可能性があります。採用前に必ず年齢を確認してください。
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="legal_name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="本名(氏名)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          name="legal_name_kana"
          value={legalNameKana}
          onChange={(e) => setLegalNameKana(e.target.value)}
          placeholder="フリガナ"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          name="birth_date"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="電話番号"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="住所"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:col-span-2"
        />
      </div>
    </div>
  );
}
