"use client";

import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/map/geocode";

/** 住所が無い施設(OpenStreetMapは住所が入っていないことが多い)に、位置からおおよその住所を出す */
export function AddressFromPoint({ lat, lng }: { lat: number; lng: number }) {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    reverseGeocode(lat, lng).then((a) => setAddress(a));
  }, [lat, lng]);
  return <>{address ? `${address}付近` : "住所を確認中…"}</>;
}
