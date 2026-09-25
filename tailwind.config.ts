import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Cormorant Garamond'", "serif"],
        // トップのFEATURED枠(黒×ゴールドの誌面風演出)専用の和文明朝体。他画面のゴシック体とは分けて使う。
        mincho: ["'Shippori Mincho'", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#e0245e",
          dark: "#b91c4a",
        },
        gold: {
          DEFAULT: "#d4af6a",
          light: "#e8cf9a",
          dark: "#a97e3f",
        },
        // サイト全体の配色テーマ(値は app/globals.css の [data-theme] ごとのCSS変数)。
        // <html data-theme> を切り替えるだけで色が一括で変わる。default は従来の色と同じ値。
        page: "rgb(var(--color-bg-base) / <alpha-value>)",
        surface: "rgb(var(--color-bg-surface) / <alpha-value>)",
        main: "rgb(var(--color-text-main) / <alpha-value>)",
        muted: "rgb(var(--color-text-muted) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          light: "rgb(var(--color-accent-light) / <alpha-value>)",
          dark: "rgb(var(--color-accent-dark) / <alpha-value>)",
        },
        // 枠線はテーマごとに濃さの倍率(--color-border-scale)を掛ける。default は1倍=従来どおり。
        line: "rgb(var(--color-border) / calc(<alpha-value> * var(--color-border-scale)))",
        glow: "rgb(var(--color-glow) / <alpha-value>)",
        // アクセント色(金・ローズ等)の上に載る文字色
        "on-accent": "rgb(var(--color-on-accent) / <alpha-value>)",
        // キーボタン(アクセス・予約・送信等)。テーマごとに色が変わる(クリスマスはルビー)
        cta: { DEFAULT: "rgb(var(--cta-500) / <alpha-value>)", light: "rgb(var(--cta-400) / <alpha-value>)", deep: "rgb(var(--cta-600) / <alpha-value>)", hover: "rgb(var(--cta-300) / <alpha-value>)" },
        "on-cta": "rgb(var(--color-on-cta) / <alpha-value>)",
        "cta-gold": { DEFAULT: "rgb(var(--cta-gold) / <alpha-value>)", light: "rgb(var(--cta-gold-light) / <alpha-value>)", dark: "rgb(var(--cta-gold-dark) / <alpha-value>)" },
        "on-cta-gold": "rgb(var(--color-on-cta-gold) / <alpha-value>)",
        // ヘッダーの背景色と、背景の光暈(3色グラデーション)
        header: {
          DEFAULT: "rgb(var(--color-header) / <alpha-value>)",
          "glow-1": "rgb(var(--color-header-glow-1) / <alpha-value>)",
          "glow-2": "rgb(var(--color-header-glow-2) / <alpha-value>)",
          "glow-3": "rgb(var(--color-header-glow-3) / <alpha-value>)",
        },
        // 旧 neutral / zinc / amber の段階ごとの置き換え先
        tone: { 50: "rgb(var(--tone-50) / <alpha-value>)", 100: "rgb(var(--tone-100) / <alpha-value>)", 200: "rgb(var(--tone-200) / <alpha-value>)", 300: "rgb(var(--tone-300) / <alpha-value>)", 400: "rgb(var(--tone-400) / <alpha-value>)", 500: "rgb(var(--tone-500) / <alpha-value>)", 600: "rgb(var(--tone-600) / <alpha-value>)", 700: "rgb(var(--tone-700) / <alpha-value>)", 800: "rgb(var(--tone-800) / <alpha-value>)", 900: "rgb(var(--tone-900) / <alpha-value>)", 950: "rgb(var(--tone-950) / <alpha-value>)" },
        panel: { 400: "rgb(var(--panel-400) / <alpha-value>)", 500: "rgb(var(--panel-500) / <alpha-value>)", 600: "rgb(var(--panel-600) / <alpha-value>)", 700: "rgb(var(--panel-700) / <alpha-value>)", 800: "rgb(var(--panel-800) / <alpha-value>)", 900: "rgb(var(--panel-900) / <alpha-value>)", 950: "rgb(var(--panel-950) / <alpha-value>)" },
        hl: { 50: "rgb(var(--hl-50) / <alpha-value>)", 100: "rgb(var(--hl-100) / <alpha-value>)", 200: "rgb(var(--hl-200) / <alpha-value>)", 300: "rgb(var(--hl-300) / <alpha-value>)", 400: "rgb(var(--hl-400) / <alpha-value>)", 500: "rgb(var(--hl-500) / <alpha-value>)", 600: "rgb(var(--hl-600) / <alpha-value>)", 700: "rgb(var(--hl-700) / <alpha-value>)", 800: "rgb(var(--hl-800) / <alpha-value>)", 900: "rgb(var(--hl-900) / <alpha-value>)", 950: "rgb(var(--hl-950) / <alpha-value>)" },
      },
      keyframes: {
        // AIチャットボタンの「呼吸する光」。2色目(--color-glow-2)は default では透明、クリスマスはシャンパンの外光。ゴールドの光彩が淡くじんわり浮かんで消える(派手な点滅にしない)。
        "ai-glow": {
          "0%, 100%": { boxShadow: "0 0 6px 0 rgb(var(--color-glow) / calc(0.12 * var(--color-glow-scale))), 0 0 10px 1px rgb(var(--color-glow-2) / calc(0.1 * var(--color-glow-2-scale))), 0 10px 15px -3px rgba(0, 0, 0, 0.4)" },
          "50%": { boxShadow: "0 0 18px 3px rgb(var(--color-glow) / calc(0.35 * var(--color-glow-scale))), 0 0 30px 8px rgb(var(--color-glow-2) / calc(0.3 * var(--color-glow-2-scale))), 0 10px 15px -3px rgba(0, 0, 0, 0.4)" },
        },
        "ai-glow-icon": {
          "0%, 100%": { opacity: "0.75", filter: "drop-shadow(0 0 2px rgb(var(--color-glow) / calc(0.25 * var(--color-glow-scale))))" },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 8px rgb(var(--color-glow) / calc(0.6 * var(--color-glow-scale))))" },
        },
      },
      animation: {
        "ai-glow": "ai-glow 3.6s ease-in-out infinite",
        "ai-glow-icon": "ai-glow-icon 3.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
