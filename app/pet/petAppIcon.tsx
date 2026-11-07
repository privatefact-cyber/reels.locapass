/**
 * ロカわんのアプリアイコン(ホーム画面に追加したとき・タブのアイコン)。
 * ピーチ色の背景に、垂れ耳のワンコの顔。画像ファイルは持たず、next/og で描いてPNGにする(app/pet/icon.tsx・apple-icon.tsx)。
 * iPhoneは角を自動で丸めるので、背景は四角いまま全面を塗る。
 */
export function PetAppIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "linear-gradient(160deg, #FFD3B0 0%, #FFAD80 45%, #FF8E5E 100%)",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        {/* 背景の肉球(うっすら) */}
        <g fill="#FFFFFF" fillOpacity="0.22">
          <ellipse cx="72" cy="84" rx="20" ry="17" />
          <circle cx="50" cy="60" r="8" />
          <circle cx="66" cy="50" r="8" />
          <circle cx="82" cy="50" r="8" />
          <circle cx="96" cy="60" r="8" />
          <ellipse cx="440" cy="448" rx="20" ry="17" />
          <circle cx="418" cy="424" r="8" />
          <circle cx="434" cy="414" r="8" />
          <circle cx="450" cy="414" r="8" />
          <circle cx="464" cy="424" r="8" />
        </g>
        {/* 垂れ耳 */}
        <ellipse cx="128" cy="236" rx="62" ry="118" fill="#9A6340" transform="rotate(24 128 236)" />
        <ellipse cx="384" cy="236" rx="62" ry="118" fill="#9A6340" transform="rotate(-24 384 236)" />
        <ellipse cx="136" cy="250" rx="34" ry="84" fill="#B87A52" transform="rotate(24 136 250)" />
        <ellipse cx="376" cy="250" rx="34" ry="84" fill="#B87A52" transform="rotate(-24 376 250)" />
        {/* 顔 */}
        <ellipse cx="256" cy="292" rx="158" ry="150" fill="#FFF6EA" />
        {/* 片目のまわりのぶち */}
        <ellipse cx="318" cy="250" rx="58" ry="62" fill="#F2B37E" />
        {/* 目 */}
        <ellipse cx="196" cy="262" rx="22" ry="25" fill="#3B2A22" />
        <ellipse cx="316" cy="262" rx="22" ry="25" fill="#3B2A22" />
        <circle cx="204" cy="252" r="8" fill="#FFFFFF" />
        <circle cx="324" cy="252" r="8" fill="#FFFFFF" />
        <circle cx="190" cy="272" r="3.5" fill="#FFFFFF" />
        <circle cx="310" cy="272" r="3.5" fill="#FFFFFF" />
        {/* ほっぺ */}
        <ellipse cx="160" cy="334" rx="26" ry="15" fill="#FF9FB2" fillOpacity="0.75" />
        <ellipse cx="352" cy="334" rx="26" ry="15" fill="#FF9FB2" fillOpacity="0.75" />
        {/* 口まわり */}
        <ellipse cx="256" cy="352" rx="78" ry="58" fill="#FFFFFF" />
        {/* 鼻 */}
        <ellipse cx="256" cy="318" rx="30" ry="21" fill="#3B2A22" />
        <ellipse cx="246" cy="311" rx="9" ry="5" fill="#FFFFFF" fillOpacity="0.55" />
        {/* 口 */}
        <path d="M256 338 Q256 362 232 366" fill="none" stroke="#3B2A22" strokeWidth="7" strokeLinecap="round" />
        <path d="M256 338 Q256 362 280 366" fill="none" stroke="#3B2A22" strokeWidth="7" strokeLinecap="round" />
        {/* べろ */}
        <path d="M242 366 Q256 404 270 366 Z" fill="#FF7A93" />
      </svg>
    </div>
  );
}
