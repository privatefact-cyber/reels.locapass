// ロカわんのiOSアプリ専用のLINE戻り先(Universal Linkでアプリが直接開く)。
// 処理は通常の戻り先と同じ。redirect_uri はリクエストのパスから組み立てるので、そのまま共有できる。
export { GET } from "../callback/route";
