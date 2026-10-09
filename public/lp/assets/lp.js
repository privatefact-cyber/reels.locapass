/* LOCAPASS LP 共通スクリプト */
/* ★ 送信先の設定(どちらか一方を入れてください)
   endpoint : フォーム内容を JSON で POST する API の URL(例: "/api/lp-inquiry")
   email    : endpoint が空のとき、メールアプリを開いて送る宛先(mailto) */
window.LP_CONFIG = window.LP_CONFIG || { endpoint: "", email: "contact@locapass.net" };

document.documentElement.classList.add("js");

// スクロールで順番に表示
(function () {
  var els = document.querySelectorAll(".rv");
  if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(function (e) { io.observe(e); });
})();

// スマホ用の追従CTA(ヒーローを過ぎたら表示、フォーム表示中は隠す)
(function () {
  var fab = document.querySelector(".fab"), hero = document.querySelector(".hero"), form = document.getElementById("contact");
  if (!fab || !hero || !("IntersectionObserver" in window)) return;
  var heroOut = false, formIn = false;
  function upd() { fab.classList.toggle("on", heroOut && !formIn); }
  new IntersectionObserver(function (es) { heroOut = !es[0].isIntersecting; upd(); }).observe(hero);
  if (form) new IntersectionObserver(function (es) { formIn = es[0].isIntersecting; upd(); }, { threshold: 0.15 }).observe(form);
})();

// 問い合わせフォーム送信
document.querySelectorAll("form[data-lp-form]").forEach(function (form) {
  var msg = form.querySelector(".msg"), btn = form.querySelector("button[type=submit]");
  function show(cls, text) { msg.className = "msg " + cls; msg.textContent = text; }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!form.reportValidity()) return; // 必須項目・形式チェック
    if (form.querySelector(".hp input").value) return; // bot対策(ハニーポット)
    var data = { type: form.getAttribute("data-lp-form"), page: location.href, sentAt: new Date().toISOString() };
    new FormData(form).forEach(function (v, k) { if (k !== "website") data[k] = v; });
    var cfg = window.LP_CONFIG;

    if (cfg.endpoint) {
      btn.disabled = true; btn.textContent = "送信中…";
      fetch(cfg.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); })
        .then(function () { form.reset(); show("ok", "お問い合わせを受け付けました。担当者より2営業日以内を目安にご連絡いたします。"); })
        .catch(function () { show("ng", "送信に失敗しました。お手数ですが、時間をおいて再度お試しください。"); })
        .finally(function () { btn.disabled = false; btn.textContent = btn.getAttribute("data-label"); });
    } else if (cfg.email) {
      var title = data.type === "agency" ? "【LOCAPASS】販売代理店のお問い合わせ" : "【LOCAPASS】掲載店のお問い合わせ";
      var body = Object.keys(data).filter(function (k) { return ["type", "page", "sentAt"].indexOf(k) < 0; })
        .map(function (k) { var l = form.querySelector('[name="' + k + '"]'); var lab = l && l.getAttribute("data-label") || k; return lab + ":" + data[k]; }).join("\n");
      location.href = "mailto:" + cfg.email + "?subject=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
      show("ok", "メールアプリが開きます。内容をご確認のうえ、そのまま送信してください。");
    } else {
      show("ng", "【準備中】送信先が未設定です。assets/lp.js の LP_CONFIG に endpoint か email を設定してください。");
    }
  });
});

// インバウンド向け 言語切替デモ(shop.html)
(function () {
  var box = document.getElementById("ccText"); if (!box) return;
  var T = { ja: "焼きたてです。どうぞ、ごゆっくり。", en: "Freshly baked. Please, take your time.", zh: "刚出炉的,请慢慢享用。", ar: "خبز طازج. تفضلوا بكل راحة." };
  var btns = document.querySelectorAll(".langs button");
  function set(l) {
    btns.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-l") === l); });
    box.style.opacity = 0;
    setTimeout(function () { box.textContent = T[l]; box.lang = l; box.dir = l === "ar" ? "rtl" : "ltr"; box.style.opacity = 1; }, 160);
  }
  var order = ["ja", "en", "zh", "ar"], i = 0, timer;
  function auto() { timer = setInterval(function () { i = (i + 1) % order.length; set(order[i]); }, 3200); }
  btns.forEach(function (b) { b.addEventListener("click", function () { clearInterval(timer); i = order.indexOf(b.getAttribute("data-l")); set(order[i]); }); });
  auto();
})();
