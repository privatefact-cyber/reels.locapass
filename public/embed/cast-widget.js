/*
 * Luxela 出勤表ウィジェット
 *
 * 埋め込み側(店舗の公式サイト)には以下のように置いてもらうだけでよい。
 * サイト構造・CSSには一切干渉せず、ページ遷移も発生させない(クリックは同一ページ内モーダル表示のみ)。
 *
 *   <div class="luxela-cast-widget" data-shop="AB12CD"></div>
 *   <script src="https://luxela.jp/embed/cast-widget.js" defer></script>
 */
(function () {
  "use strict";

  // 自分自身の<script src>からオリジンを取得する。ステージング等でもURLを変えるだけで動くようにするため。
  var currentScript = document.currentScript;
  var ORIGIN = currentScript ? new URL(currentScript.src).origin : "https://luxela.jp";

  var STYLE_ID = "luxela-cast-widget-style";
  var CSS =
    ".luxela-cw{display:flex;flex-wrap:wrap;gap:12px;font-family:sans-serif}" +
    ".luxela-cw__item{width:96px;cursor:pointer;text-align:center;background:none;border:0;padding:0}" +
    ".luxela-cw__avatar{width:96px;height:96px;border-radius:8px;object-fit:cover;background:#eee;display:block}" +
    ".luxela-cw__name{margin-top:4px;font-size:12px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".luxela-cw__time{font-size:11px;color:#888}" +
    ".luxela-cw__empty{font-size:13px;color:#999}" +
    ".luxela-cw-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".luxela-cw-modal{background:#fff;border-radius:12px;max-width:320px;width:100%;overflow:hidden;position:relative;font-family:sans-serif}" +
    ".luxela-cw-modal__close{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:16px;line-height:1;cursor:pointer}" +
    ".luxela-cw-modal__avatar{width:100%;height:280px;object-fit:cover;background:#eee;display:block}" +
    ".luxela-cw-modal__body{padding:16px}" +
    ".luxela-cw-modal__name{font-size:18px;font-weight:bold;margin:0 0 4px}" +
    ".luxela-cw-modal__time{font-size:13px;color:#666;margin:0 0 8px}" +
    ".luxela-cw-modal__pr{font-size:13px;color:#333;white-space:pre-wrap;margin:0}";

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function closeModal() {
    var backdrop = document.querySelector(".luxela-cw-modal-backdrop");
    if (backdrop) backdrop.remove();
  }

  function openModal(cast) {
    closeModal();
    var backdrop = document.createElement("div");
    backdrop.className = "luxela-cw-modal-backdrop";
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
    });

    var modal = document.createElement("div");
    modal.className = "luxela-cw-modal";

    var closeBtn = document.createElement("button");
    closeBtn.className = "luxela-cw-modal__close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModal);
    modal.appendChild(closeBtn);

    if (cast.avatarUrl) {
      var img = document.createElement("img");
      img.className = "luxela-cw-modal__avatar";
      img.src = cast.avatarUrl;
      img.alt = cast.name;
      modal.appendChild(img);
    }

    var body = document.createElement("div");
    body.className = "luxela-cw-modal__body";

    var name = document.createElement("p");
    name.className = "luxela-cw-modal__name";
    name.textContent = cast.name + (cast.age ? "（" + cast.age + "）" : "");
    body.appendChild(name);

    if (cast.startTime) {
      var time = document.createElement("p");
      time.className = "luxela-cw-modal__time";
      time.textContent = "本日 " + cast.startTime.slice(0, 5) + (cast.endTime ? "〜" + cast.endTime.slice(0, 5) : "〜");
      body.appendChild(time);
    }

    if (cast.prText) {
      var pr = document.createElement("p");
      pr.className = "luxela-cw-modal__pr";
      pr.textContent = cast.prText;
      body.appendChild(pr);
    }

    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  function renderWidget(container, data) {
    container.innerHTML = "";
    container.classList.add("luxela-cw");

    if (!data.casts || data.casts.length === 0) {
      var empty = document.createElement("div");
      empty.className = "luxela-cw__empty";
      empty.textContent = "本日の出勤情報はまだありません";
      container.appendChild(empty);
      return;
    }

    data.casts.forEach(function (cast) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "luxela-cw__item";
      item.addEventListener("click", function () {
        openModal(cast);
      });

      var img = document.createElement("img");
      img.className = "luxela-cw__avatar";
      img.loading = "lazy";
      img.src = cast.avatarUrl || "";
      img.alt = cast.name;
      item.appendChild(img);

      var name = document.createElement("div");
      name.className = "luxela-cw__name";
      name.textContent = cast.name;
      item.appendChild(name);

      if (cast.startTime) {
        var time = document.createElement("div");
        time.className = "luxela-cw__time";
        time.textContent = cast.startTime.slice(0, 5) + "〜";
        item.appendChild(time);
      }

      container.appendChild(item);
    });
  }

  function loadWidget(container) {
    var shopCode = container.getAttribute("data-shop");
    if (!shopCode) return;

    fetch(ORIGIN + "/api/embed/cast?shop=" + encodeURIComponent(shopCode))
      .then(function (res) {
        if (!res.ok) throw new Error("failed to fetch cast widget data");
        return res.json();
      })
      .then(function (data) {
        renderWidget(container, data);
      })
      .catch(function () {
        container.textContent = "";
      });
  }

  function init() {
    injectStyleOnce();
    var containers = document.querySelectorAll(".luxela-cast-widget");
    containers.forEach(loadWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
