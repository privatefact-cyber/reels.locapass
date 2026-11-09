/*
 * LOCAPASS 店舗ウィジェット(「LOCAPASS認証」バッジ + 最新リール)
 *
 * 店舗の公式サイトに、以下を置くだけで使える。サイトの構造・CSSには干渉せず、リンクは新しいタブで開く。
 *
 *   <div class="locapass-shop-widget" data-shop="AB12CD"></div>
 *   <script src="https://locapass.net/embed/shop-widget.js" defer></script>
 *
 * data-shop は、店舗ダッシュボードの「店舗コード」。
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  var ORIGIN = currentScript ? new URL(currentScript.src).origin : "https://locapass.net";
  var STYLE_ID = "locapass-shop-widget-style";
  var CSS =
    ".lpw{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:480px;border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fff;color:#111}" +
    ".lpw__head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}" +
    ".lpw__badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:linear-gradient(90deg,#F6C33B,#F59E0B);color:#fff;font-size:11px;font-weight:800;text-decoration:none}" +
    ".lpw__name{font-size:13px;font-weight:700;color:#111;text-decoration:none}" +
    ".lpw__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}" +
    ".lpw__item{display:block;aspect-ratio:1/1;border-radius:8px;overflow:hidden;background:#eee;position:relative}" +
    ".lpw__item img{width:100%;height:100%;object-fit:cover;display:block}" +
    ".lpw__play{position:absolute;right:6px;bottom:6px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center}" +
    ".lpw__more{display:block;margin-top:10px;font-size:12px;color:#b45309;text-decoration:none;font-weight:700}";

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function safeUrl(u) {
    return typeof u === "string" && /^https:\/\//i.test(u) ? u : "";
  }

  function link(className, href, text) {
    var a = document.createElement("a");
    a.className = className;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    if (text) a.textContent = text;
    return a;
  }

  function render(el, data) {
    el.textContent = "";
    var root = document.createElement("div");
    root.className = "lpw";

    var head = document.createElement("div");
    head.className = "lpw__head";
    head.appendChild(link("lpw__badge", safeUrl(data.shop.pageUrl), "✔ LOCAPASS認証"));
    head.appendChild(link("lpw__name", safeUrl(data.shop.pageUrl), data.shop.name));
    root.appendChild(head);

    if (data.reels.length > 0) {
      var grid = document.createElement("div");
      grid.className = "lpw__grid";
      data.reels.forEach(function (reel) {
        var href = safeUrl(reel.url);
        var thumb = safeUrl(reel.thumbnailUrl);
        if (!href || !thumb) return;
        var item = link("lpw__item", href);
        item.setAttribute("aria-label", reel.caption || data.shop.name);
        var img = document.createElement("img");
        img.src = thumb;
        img.alt = reel.caption || data.shop.name;
        img.loading = "lazy";
        item.appendChild(img);
        var play = document.createElement("span");
        play.className = "lpw__play";
        play.textContent = "▶";
        item.appendChild(play);
        grid.appendChild(item);
      });
      root.appendChild(grid);
    }

    root.appendChild(link("lpw__more", safeUrl(data.shop.url), "LOCAPASSで動画をもっと見る →"));
    el.appendChild(root);
  }

  function init() {
    injectStyleOnce();
    var targets = document.querySelectorAll(".locapass-shop-widget[data-shop]");
    Array.prototype.forEach.call(targets, function (el) {
      var code = el.getAttribute("data-shop");
      if (!code) return;
      fetch(ORIGIN + "/api/embed/shop?shop=" + encodeURIComponent(code))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) { if (data && data.shop) render(el, data); })
        .catch(function () { /* 失敗しても、埋め込み先のページには何も出さない */ });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
