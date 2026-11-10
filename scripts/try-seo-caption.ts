// lib/reels/seoCaption.ts の動作確認用(本番には影響しない)。実行: npx tsx scripts/try-seo-caption.ts
import { areaFromAddress, composeIntro, composePhotoIntro, reelCaptionFor } from "../lib/reels/seoCaption";

const shop = { shopName: "らーめん潤", address: "東京都大田区蒲田5-1-1 ○○ビル2F", category: "レストラン・食事", cuisines: ["ラーメン・つけ麺"] };
console.log("area:", areaFromAddress(shop.address), "|", areaFromAddress("〒310-0011 茨城県水戸市三の丸1-2-3"), "|", areaFromAddress("渋谷区道玄坂2-1"));
for (let i = 0; i < 5; i++) console.log(i, composeIntro({ ...shop, menuHints: ["岩のりラーメン"], seed: `reel-${i}` }));
console.log("--- 生ログ(ハッシュタグ)");
console.log(reelCaptionFor({ ...shop, seed: "a", raw: "YouTubeで紹介された らーめん潤 #ラーメン #岩のりラーメン" }));
console.log("--- AI要約+生ログ");
console.log(reelCaptionFor({ ...shop, seed: "b", raw: "岩のりをたっぷり使った看板のラーメンが人気のお店です。\nYouTubeで紹介された らーめん潤 #ラーメン" }));
console.log("--- 店舗が書いた文章(そのまま)");
console.log(reelCaptionFor({ ...shop, seed: "c", raw: "本日限定の煮干しつけ麺、始めました!" }));
console.log("--- 空");
console.log(reelCaptionFor({ ...shop, seed: "d", raw: "" }));
console.log("--- 美容・エリア不明・タグなし");
console.log(reelCaptionFor({ shopName: "Hair Deco", address: null, category: "美容・暮らし", seed: "e", raw: "YouTubeで紹介された 東京 鹿児島スパイラルパーマ #髪質改善 #hairmakedeco #美容室" }));
console.log("--- カフェ");
console.log(reelCaptionFor({ shopName: "ホテル天空カフェ", address: "東京都千代田区丸の内1-1", category: "カフェ・スイーツ", seed: "f", raw: "YouTubeで紹介された ホテル38階にある天空カフェ☁️ #東京グルメ #東京カフェ" }));
console.log("--- 店名なし");
console.log(reelCaptionFor({ shopName: null, seed: "g", raw: "YouTubeで紹介された 美味しいお店のご紹介です #グルメ" }));
console.log("--- スナップ");
for (let i = 0; i < 3; i++) console.log(composePhotoIntro({ spotName: "海沿いの遊歩道", address: "茨城県大洗町磯浜町", seed: `p${i}` }));
