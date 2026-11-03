const KINDS = ["All","Stock","ETF","Pre-IPO","Crypto","Basket"];
const LABEL = {All:"All",Stock:"Stocks",ETF:"ETFs","Pre-IPO":"Pre-IPO",Crypto:"Crypto",Basket:"Baskets"};
const GRAD = 150000, LAUNCH = 20000;
const state = {q:"",kind:"All",open:false,fee:false,news:false,sort:"score",openRow:null};
try{ Object.assign(state, JSON.parse(localStorage.getItem("pairscope")||"{}"), {openRow:null}); }catch(e){}
const save=()=>{ try{ const {openRow,...rest}=state; localStorage.setItem("pairscope",JSON.stringify(rest)); }catch(e){} };

const fmt$ = v => v>=1e6 ? "$"+(v/1e6).toFixed(2)+"M" : "$"+(v/1e3).toFixed(1)+"K";
const fmtPct = v => (v>0?"+":"")+Number(v).toFixed(1)+"%";
const esc = s => String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const safeUrl = u => /^https?:\/\//i.test(u||"") ? u : "";
function ago(iso){
  const m = Math.round((Date.now()-Date.parse(iso))/60000);
  if(!isFinite(m)) return "unknown";
  if(m<1) return "just now"; if(m<60) return m+" min ago";
  const h=Math.round(m/60); if(h<48) return h+" hr ago"; return Math.round(h/24)+" days ago";
}
function scoreHTML(s){
  const cls = s>=70?"hot":s>=40?"warmr":"";
  return `<span class="score ${cls}"><span class="bar"><i style="width:${s}%"></i></span><b>${s}</b></span>`;
}

let DATA = [];
let COINS = [];

async function load(){
  try{
    const res = await fetch("data/pairscope.json?t="+Date.now(), {cache:"no-store"});
    if(!res.ok) throw new Error(res.status);
    const j = await res.json();
    DATA = j.assets || [];
    COINS = j.coins || [];
    header(j); picks(); render(); coinPicks(); renderCoins();
  }catch(e){
    document.getElementById("tb").innerHTML = `<tr><td colspan="7" class="loading">Could not load the latest scan. Refresh the page to try again.</td></tr>`;
    document.getElementById("ctb").innerHTML = `<tr><td colspan="8" class="loading">Could not load the latest scan. Refresh the page to try again.</td></tr>`;
  }
}

function header(j){
  const age = (Date.now()-Date.parse(j.generatedAt))/3600000;
  const fresh = document.getElementById("fresh");
  fresh.textContent = j.seed ? "Seed snapshot" : age > 3 ? "Data is stale" : "Live · hourly";
  fresh.className = (j.seed || age > 3) ? "stale" : "";
  document.getElementById("updated").textContent = "Updated " + ago(j.generatedAt);
  const s = j.sources || {};
  document.getElementById("srcs").textContent = s.prices?.failed ? `${s.prices.failed} prices stale` : "All sources ok";
  const st = j.stats || {};
  document.getElementById("stats").innerHTML =
    `<span><b>${st.assets}</b>pairing assets</span><span><b>${st.open}</b>with no coins yet</span><span><b>${st.coins}</b>coins launched on Float</span><span><b>${st.graduatedCoins ?? st.withGraduated}</b>graduated coins</span>`;
}

function picks(){
  const p = DATA.filter(r=>!r.coins && r.kind!=="Crypto").slice(0,3);
  document.getElementById("picks").innerHTML = p.map(r=>`
    <article class="pick">
      <div class="pick-top">
        <div><div class="tk">${esc(r.ticker)}</div><div class="nm">${esc(r.name)}</div></div>
        ${scoreHTML(r.score)}
      </div>
      <div class="meta">
        <span>2026 <b class="ytd ${r.ytd>=0?'up':'down'}">${r.ytd==null?'n/a':fmtPct(r.ytd)}</b></span>
        <span>Coins <b>0</b></span>
        <span>${r.issuers.map(esc).join(" · ")}${r.fee?` · ${r.fee}% fee`:''}</span>
      </div>
      <div class="why">${r.news?.top ? esc(r.news.top.title) : "No coins yet on an asset with a strong year."}</div>
    </article>`).join("");
}

// controls
const kindEl=document.getElementById("kind");
kindEl.innerHTML = KINDS.map(k=>`<button type="button" data-k="${k}" aria-pressed="${state.kind===k}">${LABEL[k]}</button>`).join("");
kindEl.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;state.kind=b.dataset.k;
  kindEl.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));save();render();});
const q=document.getElementById("q"); q.value=state.q;
q.addEventListener("input",()=>{state.q=q.value.trim().toLowerCase();save();render();});
for(const [id,key] of [["t-open","open"],["t-fee","fee"],["t-news","news"]]){
  const el=document.getElementById(id); el.setAttribute("aria-pressed",state[key]);
  el.addEventListener("click",()=>{state[key]=!state[key];el.setAttribute("aria-pressed",state[key]);save();render();});
}
const sortEl=document.getElementById("sort"); sortEl.value=state.sort;
sortEl.addEventListener("change",()=>{state.sort=sortEl.value;save();render();});

const tb=document.getElementById("tb");
tb.addEventListener("click",e=>{ if(e.target.closest("a")) return; const tr=e.target.closest("tr.row"); if(tr) toggle(tr.dataset.t); });
tb.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("tr.row")){e.preventDefault();toggle(e.target.dataset.t);}});
function toggle(t){state.openRow = state.openRow===t?null:t; render(); const tr=tb.querySelector(`tr.row[data-t="${CSS.escape(t)}"]`); tr&&tr.focus();}

function render(){
  if(!DATA.length) return;
  let rows = DATA.filter(r=>{
    if(state.kind!=="All" && r.kind!==state.kind) return false;
    if(state.open && r.coins>0) return false;
    if(state.fee && r.fee>0) return false;
    if(state.news && !(r.news?.count24h>=3)) return false;
    if(state.q && !(r.ticker.toLowerCase().includes(state.q)||r.name.toLowerCase().includes(state.q))) return false;
    return true;
  });
  const by = {
    score:(a,b)=>b.score-a.score||((b.ytd??-1e9)-(a.ytd??-1e9)),
    ytd:(a,b)=>(b.ytd??-1e9)-(a.ytd??-1e9),
    coins:(a,b)=>(a.coins||0)-(b.coins||0)||b.score-a.score,
    top:(a,b)=>(b.topFdv||0)-(a.topFdv||0)
  }[state.sort];
  rows.sort(by);
  document.getElementById("count").textContent = `${rows.length} of ${DATA.length} shown · tap a row for the score breakdown`;
  if(!rows.length){tb.innerHTML=`<tr><td colspan="7" class="empty">No assets match these filters. Clear a filter or search to see more.</td></tr>`;return;}
  tb.innerHTML = rows.map((r,i)=>{
    const chips = r.issuers.map(x=>`<span class="chip">${esc(x)}</span>`).join("") + (r.fee?`<span class="chip fee">${r.fee}% fee</span>`:"");
    const coins = !r.coins ? `<span class="open">OPEN</span>` : `<b>${r.coins}</b>${r.graduated?`<small>${r.graduated} graduated</small>`:""}`;
    let top = `<span class="dash">—</span>`;
    if(r.coins>0){
      const w = Math.min(100, r.topFdv/GRAD*100);
      top = `<div class="topcoin"><div class="l"><span>${esc(r.top)}</span><span class="num">${fmt$(r.topFdv)}</span></div>
        <div class="meter" aria-label="${fmt$(r.topFdv)} of about $150K graduation"><i class="${r.topFdv>=GRAD?'grad':''}" style="width:${w}%"></i><em style="left:${LAUNCH/GRAD*100}%"></em></div></div>`;
    }
    const y = r.ytd==null ? `<span class="dash">n/a</span>`
      : `<span class="ytd ${r.ytd>=0?'up':'down'}${r.priceStale?' stale':''}">${fmtPct(r.ytd)}${r.m1!=null?`<small>1M ${fmtPct(r.m1)}</small>`:''}</span>`;
    let news = `<span class="dash">—</span>`;
    if(r.news?.top){
      const u = safeUrl(r.news.top.url);
      const t = esc(r.news.top.title);
      news = `<span class="news on">${u?`<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`:t}<small>${esc(r.news.top.source)}${r.news.count24h && !r.news.seeded?` · ${r.news.count24h} stories today`:''}</small></span>`;
    }
    const open = state.openRow===r.ticker, p=r.pts||{};
    const detail = open ? `<tr class="detail"><td colspan="7"><div class="bd">
        <span>Momentum <b>+${p.momentum}</b></span><span>Open lane <b>+${p.open}</b></span><span>News <b>+${p.news}</b></span>
        <span>Proven demand <b>+${p.demand}</b></span><span class="${p.fee<0?'neg':''}">Transfer fee <b>${p.fee}</b></span>
        <span>Type <b>${esc(LABEL[r.kind]||r.kind)}</b></span>${r.price!=null?`<span>Price <b>$${r.price}</b></span>`:''}</div></td></tr>` : "";
    return `<tr class="row" tabindex="0" data-t="${esc(r.ticker)}" aria-expanded="${open}">
      <td class="rank">${i+1}</td>
      <td><div class="asset"><div class="t">${esc(r.ticker)} ${chips}</div><div class="n">${esc(r.name)}</div></div></td>
      <td class="r coins">${coins}</td>
      <td>${top}</td>
      <td class="r">${y}</td>
      <td>${news}</td>
      <td class="r">${scoreHTML(r.score)}</td></tr>${detail}`;
  }).join("");
}

// ---------- Top coins view ----------
const cstate = {q:"",status:"All",active:false,news:false,sort:"volume"};
try{ Object.assign(cstate, JSON.parse(localStorage.getItem("pairscope-coins")||"{}")); }catch(e){}
const csave=()=>{ try{ localStorage.setItem("pairscope-coins",JSON.stringify(cstate)); }catch(e){} };
const FLOAT_COIN = mint => `https://www.floatlaunch.xyz/tokens/${encodeURIComponent(mint)}`;
const fmtN = v => v==null ? "—" : v>=1e6 ? (v/1e6).toFixed(2)+"M" : v>=1e4 ? (v/1e3).toFixed(1)+"K" : Math.round(v).toLocaleString();
const fmtUsd = v => v==null ? "—" : v>=1000 ? fmt$(v) : "$"+Number(v).toFixed(v<10?2:0);

function meterHTML(c){
  const w = c.graduated ? 100 : Math.min(100, c.fdv/GRAD*100);
  return `<div class="topcoin"><div class="l"><span class="num">${fmt$(c.fdv)}</span><span class="status">${c.graduated?'<b>Graduated</b>':`${c.gradPct}% to graduation`}</span></div>
    <div class="meter" aria-label="${fmt$(c.fdv)}${c.graduated?', graduated':`, ${c.gradPct}% of the way to graduation`}"><i class="${c.graduated?'grad':''}" style="width:${w}%"></i><em style="left:${LAUNCH/GRAD*100}%"></em></div></div>`;
}
function anchorHTML(c){
  const y = c.anchorYtd==null ? "" : `<span class="ytd ${c.anchorYtd>=0?'up':'down'}" style="font-size:12px">${fmtPct(c.anchorYtd)}</span>`;
  const n = c.anchorNews>=3 ? ` · in the news` : "";
  return `<span class="chip">${esc(c.anchor)}</span><span class="sub">${esc(c.anchorName)}${y?` · ${y}`:''}${n}</span>`;
}
function coinLink(c){
  return c.mint ? `<a href="${FLOAT_COIN(c.mint)}" target="_blank" rel="noopener">${esc(c.ticker)}</a>` : esc(c.ticker);
}

function coinPicks(){
  const p = COINS.filter(c=>!c.graduated && c.volume24h>0).sort((a,b)=>b.fdv-a.fdv).slice(0,3);
  document.getElementById("cpicks").innerHTML = p.length ? p.map(c=>`
    <article class="pick">
      <div class="pick-top">
        <div class="coin"><div class="tk">${coinLink(c)}</div><div class="nm">Paired with ${esc(c.anchorName)}</div></div>
        <span class="act ${esc(c.activity)}">${esc(c.activity)}</span>
      </div>
      ${meterHTML(c)}
      <div class="meta">
        <span>24h vol <b>${fmtUsd(c.volume24h)}</b></span>
        <span>Holders <b>${fmtN(c.holders)}</b></span>
        <span>Paid 7d <b>${fmtUsd(c.paid7d)}</b></span>
      </div>
    </article>`).join("") : `<div class="count">No coins on the bonding curve traded today.</div>`;
}

const cstatusEl=document.getElementById("cstatus");
cstatusEl.innerHTML = ["All","Bonding","Graduated"].map(k=>`<button type="button" data-k="${k}" aria-pressed="${cstate.status===k}">${k==="Bonding"?"On the curve":k}</button>`).join("");
cstatusEl.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;cstate.status=b.dataset.k;
  cstatusEl.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));csave();renderCoins();});
const cq=document.getElementById("cq"); cq.value=cstate.q;
cq.addEventListener("input",()=>{cstate.q=cq.value.trim().toLowerCase();csave();renderCoins();});
for(const [id,key] of [["ct-active","active"],["ct-news","news"]]){
  const el=document.getElementById(id); el.setAttribute("aria-pressed",cstate[key]);
  el.addEventListener("click",()=>{cstate[key]=!cstate[key];el.setAttribute("aria-pressed",cstate[key]);csave();renderCoins();});
}
const csortEl=document.getElementById("csort"); csortEl.value=cstate.sort;
csortEl.addEventListener("change",()=>{cstate.sort=csortEl.value;csave();renderCoins();});

function renderCoins(){
  const ctb=document.getElementById("ctb");
  if(!COINS.length){ ctb.innerHTML=`<tr><td colspan="8" class="empty">Coin data appears after the next hourly scan.</td></tr>`; return; }
  let rows = COINS.filter(c=>{
    if(cstate.status==="Bonding" && c.graduated) return false;
    if(cstate.status==="Graduated" && !c.graduated) return false;
    if(cstate.active && !(c.volume24h>0)) return false;
    if(cstate.news && !(c.anchorNews>=3)) return false;
    if(cstate.q && !(c.ticker.toLowerCase().includes(cstate.q)||c.anchor.toLowerCase().includes(cstate.q)||String(c.anchorName).toLowerCase().includes(cstate.q))) return false;
    return true;
  });
  const by = {
    volume:(a,b)=>b.volume24h-a.volume24h||b.fdv-a.fdv,
    fdv:(a,b)=>b.fdv-a.fdv,
    grad:(a,b)=>(a.graduated-b.graduated)||b.fdv-a.fdv,
    holders:(a,b)=>(b.holders??-1)-(a.holders??-1),
    paid:(a,b)=>(b.paid7d??-1)-(a.paid7d??-1),
    stock:(a,b)=>(b.anchorYtd??-1e9)-(a.anchorYtd??-1e9)||b.volume24h-a.volume24h
  }[cstate.sort];
  rows.sort(by);
  document.getElementById("ccount").textContent = `${rows.length} of ${COINS.length} coins shown`;
  if(!rows.length){ ctb.innerHTML=`<tr><td colspan="8" class="empty">No coins match these filters. Clear a filter or search to see more.</td></tr>`; return; }
  ctb.innerHTML = rows.slice(0,300).map((c,i)=>`<tr>
    <td class="rank">${i+1}</td>
    <td class="coin">${coinLink(c)}</td>
    <td>${meterHTML(c)}</td>
    <td class="r num">${fmtUsd(c.volume24h)}</td>
    <td class="r num">${fmtN(c.holders)}</td>
    <td class="r num">${fmtUsd(c.paid7d)}</td>
    <td>${anchorHTML(c)}</td>
    <td><span class="act ${esc(c.activity)}">${esc(c.activity)}</span></td></tr>`).join("");
}

// ---------- views ----------
function route(){
  const coins = location.hash === "#coins";
  document.getElementById("view-pairs").hidden = coins;
  document.getElementById("view-coins").hidden = !coins;
  document.getElementById("tab-pairs").setAttribute("aria-selected", !coins);
  document.getElementById("tab-coins").setAttribute("aria-selected", coins);
}
window.addEventListener("hashchange", route);
route();

load();
setInterval(load, 10*60*1000);
