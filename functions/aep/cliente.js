export function onRequestGet() {
  return new Response(`<!doctype html><html lang="es" data-theme="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>GAMMS AEP Cliente</title><style>
    :root{color-scheme:light dark;--bg:#f6f7f6;--card:#fff;--text:#101815;--muted:#66736d;--line:#dde5e0;--brand:#0f7a5a;--good:#0f9f6e}
    @media(prefers-color-scheme:dark){:root{--bg:#06100d;--card:#0e1b17;--text:#f2fff9;--muted:#9bb0a8;--line:#1f332d;--brand:#54e0ad;--good:#79f2c7}}
    [data-theme=light]{--bg:#f6f7f6;--card:#fff;--text:#101815;--muted:#66736d;--line:#dde5e0;--brand:#0f7a5a;--good:#0f9f6e}
    [data-theme=dark]{--bg:#06100d;--card:#0e1b17;--text:#f2fff9;--muted:#9bb0a8;--line:#1f332d;--brand:#54e0ad;--good:#79f2c7}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:760px;margin:0 auto;padding:22px 16px 40px}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px}.brand{font-size:26px;font-weight:900}.hello{color:var(--muted);margin-top:5px}.theme{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:999px;padding:9px 12px;font-weight:800}.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(0,0,0,.06)}.identity{background:linear-gradient(135deg,var(--card),rgba(84,224,173,.16))}.label{color:var(--muted);font-size:13px}.big{font-size:20px;font-weight:900}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric{padding:14px;border-radius:18px;background:rgba(127,127,127,.08)}.metric strong{display:block;font-size:20px}.progress-row,.coupon-row{display:grid;gap:10px}.dots{font-size:22px;color:var(--brand);letter-spacing:5px}.coupon{border-color:rgba(15,159,110,.45);background:rgba(15,159,110,.12)}button{border:0;border-radius:14px;background:var(--brand);color:#04110c;font-weight:900;padding:12px 14px;min-height:44px}table{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}th,td{padding:10px 4px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-size:12px}.table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.empty{color:var(--muted);padding:10px 0}.by{color:var(--muted);text-align:center;margin-top:24px;font-size:12px}.claim{margin-top:12px;text-align:center}.claim svg{width:min(210px,72vw);height:min(210px,72vw);background:#fff;border-radius:12px;padding:8px}.code{font:900 20px ui-monospace,SFMono-Regular,Consolas,monospace;margin-top:8px;overflow-wrap:anywhere}
    @media(max-width:500px){main{padding:16px 12px 32px}.top{align-items:center}.brand{font-size:22px}.grid{grid-template-columns:1fr}.card{padding:15px;border-radius:18px}button{width:100%}}
  </style></head><body><main><div class="top"><div><div class="brand">GAMMS AEP</div><div class="hello" id="hello">Cargando...</div></div><button class="theme" id="themeBtn" type="button">Tema</button></div><section class="card identity"><div class="label">Identidad</div><div class="big" id="identity">Cliente</div></section><section class="grid"><div class="metric"><span class="label">Compras</span><strong id="mPurchases">0</strong></div><div class="metric"><span class="label">Ahorrado</span><strong id="mSaved">C$0.00</strong></div><div class="metric"><span class="label">Cupones</span><strong id="mRewards">0</strong></div></section><section class="card"><h2>Promociones</h2><div id="progress" class="progress-row"></div></section><section class="card"><h2>Mis cupones</h2><div id="coupons" class="coupon-row"></div></section><section class="card"><h2>Historial de compras</h2><div id="purchases"></div></section><section class="card"><h2>Historial de recompensas</h2><div id="rewards"></div></section><section class="card"><h2>Mi QR</h2><p class="empty">Si necesitas imprimir o mostrar tu QR permanente, pide al staff reemitirlo de forma explicita. No rotamos identidad silenciosamente.</p><button type="button" id="refreshBtn">Actualizar</button></section><div class="by">By <strong>GAMMS GROUP</strong></div></main><script>
    const fmt = new Intl.NumberFormat("es-NI",{style:"currency",currency:"NIO"});
    const money = cents => fmt.format((Number(cents)||0)/100);
    const date = value => value ? new Date(value).toLocaleDateString("es-NI",{day:"2-digit",month:"2-digit"}) : "";
    const discount = value => Number(value) === 100 ? "GRATIS" : (Number(value) > 0 ? Number(value) + "% OFF" : "Normal");
    const themeBtn = document.getElementById("themeBtn");
    const savedTheme = localStorage.getItem("gamms_customer_theme") || "system";
    function applyTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem("gamms_customer_theme",theme);themeBtn.textContent=theme==="dark"?"Dark":theme==="light"?"Light":"System"}
    themeBtn.addEventListener("click",()=>applyTheme(document.documentElement.dataset.theme==="system"?"dark":document.documentElement.dataset.theme==="dark"?"light":"system"));
    applyTheme(savedTheme);
    async function showClaim(productId,rewardId){
      const body = rewardId ? {rewardId} : (productId ? {productId} : {});
      const res = await fetch("/aep/api/rewards/claim",{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body)});
      const data = await res.json();
      if(!res.ok) return alert(data.code || "No se pudo generar el cupon.");
      const target = document.getElementById("claim-"+(rewardId||productId)) || document.getElementById("coupons");
      target.innerHTML = '<div class="claim">'+(data.claim.qrSvg||"")+'<div class="code">'+(data.claim.code||"")+'</div></div>';
    }
    async function load(){
      let res;
      try{res = await fetch("/aep/api/customer/dashboard",{headers:{accept:"application/json"}})}catch{hello.textContent="Sin conexion o servidor no disponible. Intenta nuevamente.";return}
      const data = await res.json();
      if(!res.ok){hello.textContent="Escanea tu QR de cliente para entrar.";return}
      hello.textContent = "Hola, " + (data.customer.displayName || data.customer.customerLabel);
      identity.textContent = (data.customer.displayName || "Cliente") + " - " + data.customer.customerLabel;
      mPurchases.textContent = data.summary.totalPurchases;
      mSaved.textContent = money(data.summary.totalDiscountSavedCents);
      mRewards.textContent = data.summary.availableRewards;
      progress.innerHTML = data.promotionProgress.length ? data.promotionProgress.map(p => '<div class="card"><div class="big">'+p.productName+'</div><div class="dots">'+Array.from({length:p.everyN},(_,i)=>i<p.currentProgress?'●':'○').join("")+'</div><div class="label">'+p.currentProgress+' de '+p.everyN+' compras</div><p>Proxima recompensa: <strong>'+discount(p.discountPercent)+'</strong></p></div>').join("") : '<p class="empty">Aun no hay progreso de promociones.</p>';
      coupons.innerHTML = (data.availableCoupons||[]).length ? data.availableCoupons.map(c => '<div class="card coupon"><div class="big">'+c.productName+'</div><p>Descuento: <strong>'+discount(c.discountPercent)+'</strong></p><p>Estado: <strong>Disponible</strong></p>'+(c.cycleNumber?'<p>Ciclo #'+c.cycleNumber+'</p>':'')+'<p class="label">Obtenido: '+date(c.unlockedAt)+'</p><button onclick="showClaim('+c.productId+','+c.id+')">Mostrar al vendedor</button><div id="claim-'+c.id+'"></div></div>').join("") : '<p class="empty">No tienes cupones disponibles.</p>';
      purchases.innerHTML = data.purchases.length ? '<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Precio</th><th>Desc.</th><th>Total</th></tr></thead><tbody>'+data.purchases.map(p=>'<tr><td>'+date(p.createdAt)+'</td><td>'+p.productName+'</td><td>'+money(p.regularPriceCents)+'</td><td>'+discount(p.discountPercent)+'</td><td>'+money(p.finalPriceCents)+'</td></tr>').join("")+'</tbody></table></div>' : '<p class="empty">Sin compras todavia.</p>';
      rewards.innerHTML = data.rewards.length ? '<div class="table-scroll"><table><thead><tr><th>Producto</th><th>Premio</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>'+data.rewards.map(r=>'<tr><td>'+r.productName+'</td><td>'+discount(r.discountPercent)+'</td><td>'+r.status+'</td><td>'+date(r.redeemedAt||r.createdAt)+'</td></tr>').join("")+'</tbody></table></div>' : '<p class="empty">Sin recompensas todavia.</p>';
    }
    refreshBtn.addEventListener("click",load); load();
  </script></body></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer"
    }
  });
}
