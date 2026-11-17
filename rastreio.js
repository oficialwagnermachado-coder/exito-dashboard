/* Êxito Dashboard — rastreio de origem de pedidos (Tray)
 * 1) Em qualquer página: guarda UTMs, ad_id e fbclid por 30 dias (primeiro e último toque).
 *    Visita sem UTM não apaga a origem do anúncio.
 * 2) Na página de pedido concluído: manda "pedido X veio de Y" para o Êxito Dashboard.
 * Sem dado pessoal: só número do pedido, número da loja e as etiquetas do link.
 */
(function () {
  "use strict";
  var FN = "https://ruozjclkwawhmovgvyrp.supabase.co/functions/v1/tray-origem";
  var CHAVE = "exito_origem", DIAS = 30, DEBUG = /exito_debug=1/.test(location.search);
  var log = function () { if (DEBUG && window.console) console.log.apply(console, ["[exito]"].concat([].slice.call(arguments))); };

  var script = document.currentScript;
  function lojaId() {
    try { var m = script && script.src.match(/[?&]loja=(\d+)/); if (m) return m[1]; } catch (e) {}
    try { if (window.store && window.store.id) return String(window.store.id); } catch (e) {}
    return null;
  }

  // ---------- guardar (localStorage + cookie, para o caso do checkout em outro subdomínio) ----------
  function ler() {
    var v = null;
    try { v = localStorage.getItem(CHAVE); } catch (e) {}
    if (!v) { var m = document.cookie.match(new RegExp("(?:^|; )" + CHAVE + "=([^;]*)")); if (m) v = decodeURIComponent(m[1]); }
    try { var o = JSON.parse(v); if (o && o.exp > Date.now()) return o; } catch (e) {}
    return null;
  }
  function gravar(o) {
    var s = JSON.stringify(o);
    try { localStorage.setItem(CHAVE, s); } catch (e) {}
    // Cookie só no endereço da própria loja (domínios da plataforma são compartilhados entre lojas).
    try { document.cookie = CHAVE + "=" + encodeURIComponent(s) + "; path=/; max-age=" + DIAS * 86400 + "; SameSite=Lax"; } catch (e) {}
  }

  var q = new URLSearchParams(location.search);
  var campos = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ad_id", "fbclid"];
  var novo = {}, tem = false;
  campos.forEach(function (c) { var v = q.get(c); if (v) { novo[c] = v.slice(0, 200); tem = true; } });
  var atual = ler();
  if (tem) {
    novo.ts = new Date().toISOString();
    novo.landing = (location.origin + location.pathname).slice(0, 300);
    gravar({ primeiro: (atual && atual.primeiro) || novo, ultimo: novo, exp: Date.now() + DIAS * 86400000 });
    log("origem guardada", novo);
  }

  // ---------- achar o número do pedido concluído ----------
  function pedidoDoDataLayer() {
    var dl = window.dataLayer || [];
    for (var i = dl.length - 1; i >= 0; i--) {
      var x = dl[i] || {};
      var id = x.transactionId || x.transaction_id || x.orderId ||
        (x.ecommerce && (x.ecommerce.transaction_id ||
          (x.ecommerce.purchase && x.ecommerce.purchase.actionField && x.ecommerce.purchase.actionField.id)));
      if (id && /^\d+$/.test(String(id))) return String(id);
    }
    return null;
  }
  function pedidoDaPagina() {
    var cat = "";
    try { cat = String(((window.dataLayer || [])[0] || {}).pageCategory || ""); } catch (e) {}
    var url = location.href;
    var ehFinal = /finaliz|sucesso|success|confirm|obrigad|pedido-?realizado|order-?placed/i.test(cat + " " + url);
    if (!ehFinal) return null;
    var m = url.match(/[?&](?:pedido|order_id|order|id_pedido)=(\d+)/i);
    if (m) return m[1];
    var t = (document.body && document.body.innerText) || "";
    m = t.match(/pedido\s*(?:n[ºo°.]*|número|numero|#)?\s*:?\s*#?(\d{3,12})/i);
    return m ? m[1] : null;
  }

  var enviados = {};
  function tentar() {
    var pedido = pedidoDoDataLayer() || pedidoDaPagina();
    var loja = lojaId();
    if (!pedido || !loja || enviados[pedido]) return;
    var o = ler();
    try { if (localStorage.getItem("exito_enviado_" + pedido)) return; } catch (e) {}
    if (!o) { log("pedido", pedido, "sem origem guardada"); return; }
    enviados[pedido] = 1;
    var corpo = JSON.stringify({ store_id: loja, pedido_id: pedido, primeiro_toque: o.primeiro, ultimo_toque: o.ultimo });
    var ok = false;
    try { ok = navigator.sendBeacon && navigator.sendBeacon(FN, new Blob([corpo], { type: "text/plain" })); } catch (e) {}
    if (!ok) { try { fetch(FN, { method: "POST", body: corpo, mode: "no-cors", keepalive: true }); } catch (e) {} }
    try { localStorage.setItem("exito_enviado_" + pedido, "1"); } catch (e) {}
    log("origem enviada", pedido, o.ultimo);
  }

  tentar();
  if (document.readyState !== "complete") window.addEventListener("load", tentar);
  setTimeout(tentar, 2500); setTimeout(tentar, 6000);
})();
