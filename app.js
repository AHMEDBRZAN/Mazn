'use strict';
/* فاتورة المورد ← ملف استيراد سراج — معالجة محلية كاملة */
const $ = id => document.getElementById(id);
const pick = (o, k) => { for (const key of Object.keys(o)) if (key.trim() === k) return o[key]; return undefined; };
const round2 = v => Math.round(v * 100) / 100;
const round3 = v => Math.round(v * 1000) / 1000;

/* ---------- ترميز/فك سجلات سراج الثنائية ---------- */
function b64ToBytes(b64){ const s = atob(String(b64).replace(/\s/g,'')); const a = new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a; }
function bytesToB64(a){ let s=''; for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000)); return btoa(s); }
function decodeV(bytes, vary){ const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); let o=0; const m={}; for(const idx of vary){ const len=dv.getUint32(o,true); o+=4; m[idx]=bytes.slice(o,o+len); o+=len; } return m; }
function rawFloat(raw){ if(!raw||raw.length<8) return 0; return new DataView(raw.buffer,raw.byteOffset,raw.byteLength).getFloat64(0,true); }
function rawStr(raw){ if(!raw) return ''; let s=''; for(let i=0;i+1<raw.length;i+=2) s+=String.fromCharCode(raw[i]|(raw[i+1]<<8)); return s; }
function encFloat(v){ const b=new Uint8Array(8); new DataView(b.buffer).setFloat64(0,Number(v)||0,true); return b; }
function encodeV(m, vary){ let total=0; for(const i of vary) total+=4+(m[i]?m[i].length:0); const out=new Uint8Array(total); const dv=new DataView(out.buffer); let o=0; for(const i of vary){ const raw=m[i]||new Uint8Array(0); dv.setUint32(o,raw.length,true); o+=4; out.set(raw,o); o+=raw.length; } return out; }

/* ---------- تطبيع النص العربي ---------- */
const dig = s => String(s).replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x0660).replace(/[۰-۹]/g,d=>d.charCodeAt(0)-0x06F0);
function norm(s){
  s = dig(String(s||'').toLowerCase());
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g,'');
  s = s.replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي');
  s = s.replace(/[^\u0621-\u064Aa-z0-9.\s]/g,' ').replace(/\s+/g,' ').trim();
  return s;
}
const toks = s => norm(s).split(' ').filter(Boolean).map(t=>t.replace(/^ال/,''));
const numsOf = s => (norm(s).match(/\d+(?:\.\d+)?/g)||[]).map(Number).sort((a,b)=>a-b);
const COLORS = ['ابيض','اسود','احمر','اخضر','ازرق','اصفر','رصاصي','تبني','جوزي','شمباني','ذهبي','فضي','نحاسي','صاجي','برتقالي','بنفسجي','وردي','سمائي','فستقي','مشمشي','باذنجاني','ماروني','نيلي','بصلي','تركوازي','شذري','عاج','بيج','كريمي','لولوي','زيتوني','حشيشي','فسفوري','ملون','ملونه','غامق','فاتح','طافي','لامع'];
const ALLCOLORS = /(جميع\s*(ال)?الوان|كل\s*(ال)?الوان|الوان\s*(متعدده|مختلفه)|مكس\s*الوان|جميع\s*الاصناف|الوان)/;
const baseToks = s => toks(s).filter(t=>!/^\d/.test(t) && !COLORS.includes(t) && !['مكس','رقم','كود','لون'].includes(t));
function jac(a,b,idf){ const A=new Set(a),B=new Set(b); let inter=0,uni=0; const U=new Set([...A,...B]); for(const t of U){ const w=(idf&&idf[t])||1; uni+=w; if(A.has(t)&&B.has(t)) inter+=w; } return uni?inter/uni:0; }

/* ---------- الحالة ---------- */
const S = { cat:null, company:'', images:[], lines:[], grand:null, disc:0, tax:0, manual:false, pool:[], idf:{}, exportData:null };

/* ---------- تحميل الكتالوج ---------- */
async function loadCatalog(){
  try{
    const res = await fetch('catalog.json'); if(!res.ok) throw new Error(res.status);
    const arr = await res.json();
    const h = arr[0];
    const fields = pick(h,'fields').map(f=>[String(f[0]).trim(), f[1]]);
    const vary = pick(h,'vary');
    const items = arr.slice(1).map(r=>{
      const v = b64ToBytes(pick(r,'v'));
      const m = decodeV(v, vary);
      const it = { c:String(pick(r,'c')||'').trim(), n:String(pick(r,'n')||'').trim(), g:String(pick(r,'g')||'').trim(), k:String(pick(r,'k')||'').trim(), u:String(pick(r,'u')||'').trim(), m };
      it.name = rawStr(m[58])||it.n; it.code = rawStr(m[57])||it.c; it.barcode = rawStr(m[36]); it.unit = rawStr(m[52])||it.u;
      it.buy = rawFloat(m[71]); it.toks = toks(it.name); it.base = baseToks(it.name); it.nums = numsOf(it.name);
      return it;
    });
    const comps = {};
    for(const it of items){ if(it.k) comps[it.k]=(comps[it.k]||0)+1; }
    for(const it of items){ if(it.k==='غير محدد' && it.g && /شركة|فاوري|بي واي/.test(it.g)) comps[it.g]=(comps[it.g]||0)+0; }
    S.cat = { header:h, fields, vary, items };
    const sel = $('companySel'); sel.innerHTML = '<option value="">— اختر الشركة أولاً —</option>';
    Object.keys(comps).sort((a,b)=>comps[b]-comps[a]||a.localeCompare(b,'ar')).forEach(c=>{
      const o=document.createElement('option'); o.value=c; o.textContent=`${c} (${comps[c]||''})`; sel.appendChild(o);
    });
    sel.disabled=false;
    $('catalogStatus').className='banner ok'; $('catalogStatus').textContent=`تم تحميل الكتالوج: ${items.length} صنف، ${Object.keys(comps).length} شركة.`;
  }catch(e){
    $('catalogStatus').className='banner danger';
    $('catalogStatus').textContent='تعذر تحميل catalog.json — تأكد من رفعه بجانب index.html في المستودع.';
  }
}

/* ---------- الصور ---------- */
function refreshReadBtn(){ $('btnRead').disabled = !(S.company && S.images.length && S.cat); }
function renderThumbs(){
  const t=$('thumbs'); t.innerHTML='';
  S.images.forEach((im,i)=>{
    const d=document.createElement('div'); d.className='th';
    d.innerHTML=`<img src="${im.url}" alt=""><button data-i="${i}">×</button>`;
    d.querySelector('button').onclick=()=>{ URL.revokeObjectURL(im.url); S.images.splice(i,1); renderThumbs(); refreshReadBtn(); };
    t.appendChild(d);
  });
}
function loadImg(url){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; }); }
function prepCanvas(img, maxSide, mode){
  const sc=Math.min(1, maxSide/Math.max(img.width,img.height));
  const w=Math.round(img.width*sc), h=Math.round(img.height*sc);
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const cx=cv.getContext('2d'); cx.drawImage(img,0,0,w,h);
  const d=cx.getImageData(0,0,w,h), p=d.data, hist=new Array(256).fill(0);
  for(let i=0;i<p.length;i+=4){ const g=Math.round(.299*p[i]+.587*p[i+1]+.114*p[i+2]); p[i]=p[i+1]=p[i+2]=g; hist[g]++; }
  const n=w*h;
  if(mode==='contrast'){
    let lo=0,hi=255,acc=0; for(let g=0;g<256;g++){acc+=hist[g]; if(acc>n*.02){lo=g;break;}}
    acc=0; for(let g=0;g<256;g++){acc+=hist[g]; if(acc>n*.98){hi=g;break;}}
    if(hi<=lo){lo=0;hi=255;}
    for(let i=0;i<p.length;i+=4){ const v=Math.max(0,Math.min(255,Math.round((p[i]-lo)*255/(hi-lo)))); p[i]=p[i+1]=p[i+2]=v; }
  }else{ // otsu
    let sum=0; for(let g=0;g<256;g++) sum+=g*hist[g];
    let sb=0,wb=0,mx=0,th=127;
    for(let g=0;g<256;g++){ wb+=hist[g]; if(!wb)continue; const wf=n-wb; if(!wf)break; sb+=g*hist[g];
      const mb=sb/wb, mf=(sum-sb)/wf, v=wb*wf*(mb-mf)*(mb-mf); if(v>mx){mx=v;th=g;} }
    for(let i=0;i<p.length;i+=4){ const v=p[i]>th?255:0; p[i]=p[i+1]=p[i+2]=v; }
  }
  cx.putImageData(d,0,0); return cv;
}

/* ---------- القراءة المزدوجة ---------- */
function setProg(pct,txt){ $('progressWrap').hidden=false; $('progressBar').style.width=Math.round(pct*100)+'%'; $('progressText').textContent=txt; }
async function readInvoice(){
  $('btnRead').disabled=true; $('stopPanel').hidden=true; $('warnPanel').hidden=true; $('reviewWrap').hidden=true;
  const passes=[{max:1800,mode:'contrast',psm:'6'},{max:2200,mode:'otsu',psm:'4'}];
  const results=[[],[]];
  try{
    for(let pi=0;pi<2;pi++){
      const worker=await Tesseract.createWorker('ara+eng',1,{logger:m=>{
        if(m.status==='recognizing text') setProg((pi + (S.images.length? m.progress:0))/2, `القراءة ${pi+1} من 2 — ${Math.round(m.progress*100)}%`);
      }});
      await worker.setParameters({tessedit_pageseg_mode:passes[pi].psm, preserve_interword_spaces:'1'});
      for(let ii=0;ii<S.images.length;ii++){
        setProg(pi/2,`القراءة ${pi+1} من 2 — صفحة ${ii+1}/${S.images.length}…`);
        const img=await loadImg(S.images[ii].url);
        const cv=prepCanvas(img,passes[pi].max,passes[pi].mode);
        const {data}=await worker.recognize(cv);
        results[pi].push({text:data.text||'',conf:data.confidence||0});
      }
      await worker.terminate();
    }
    setProg(1,'اكتملت القراءتان — جارٍ الفحص…');
    reconcile(results);
  }catch(e){
    showStop(['تعذر تشغيل محرك القراءة (تأكد من الاتصال بالإنترنت أول مرة لتحميل نموذج العربية). '+e.message]);
  }
  $('btnRead').disabled=false; refreshReadBtn();
}

/* ---------- تحليل الأسطر ---------- */
function cleanNum(tok){
  tok=dig(tok).replace(/\s/g,'').replace(/٬/g,',').replace(/٫/g,'.');
  if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(tok)) tok=tok.replace(/,/g,'');
  else if(/^-?\d+,\d{1,2}$/.test(tok)) tok=tok.replace(',','.');
  else tok=tok.replace(/,/g,'');
  const v=parseFloat(tok); return isFinite(v)?v:null;
}
function parsePass(pages){
  const rows=[]; let grand=null,disc=0,tax=0,conf=0;
  for(const pg of pages){ conf=Math.max(conf,0); conf+=pg.conf; }
  conf = pages.length? conf/pages.length : 0;
  const text=pages.map(p=>p.text).join('\n');
  for(let raw of text.split(/\r?\n/)){
    let line=dig(raw).trim(); if(!line) continue;
    const low=norm(line);
    const numRe=/\d[\d.,٬٫]*/g; let m; const tokens=[];
    while((m=numRe.exec(line))){
      const s=m.index, e=s+m[0].length;
      const before=line[s-1]||'', after=line[e]||'';
      const embedded=/[A-Za-z\u0621-\u064A%]/.test(before)||/[A-Za-z\u0621-\u064A%]/.test(after);
      const v=cleanNum(m[0]); if(v!=null) tokens.push({v,s,e,embedded});
    }
    const stand=tokens.filter(t=>!t.embedded);
    if(/مجموع|اجمالي|اجمالى|صافي|مطلوب|grand|total/.test(low) && stand.length){ grand=stand[stand.length-1].v; continue; }
    if(/خصم|حسم|تخفيض/.test(low) && stand.length){ disc=stand[stand.length-1].v; continue; }
    if(/ضريب|vat/.test(low) && stand.length){ tax=stand[stand.length-1].v; continue; }
    if(stand.length<2) continue;
    const n=stand.length; let best=null;
    const cand=[];
    if(n>=3) cand.push({q:stand[n-3].v,p:stand[n-2].v,t:stand[n-1].v,used:3,cut:stand[n-3].s});
    if(n>=2) cand.push({q:stand[n-2].v,p:stand[n-1].v,t:null,used:2,cut:stand[n-2].s});
    for(const c of cand){
      if(!(c.q>0)||!(c.p>0)||c.q>1e6) continue;
      if(c.t!=null){ const tol=Math.max(1,Math.abs(c.t)*.004); if(Math.abs(c.q*c.p-c.t)<=tol){ best={...c,score:1}; break; } }
      else if(!best){ best={...c,t:round2(c.q*c.p),score:.6}; }
    }
    if(!best) continue;
    let name=line.slice(0,best.cut).replace(/^\s*\d{1,3}\s*[-–—.)]?\s+/,'').replace(/[\s|،,:.\-]+$/,'').trim();
    if(!name) continue;
    rows.push({name, qty:best.q, price:best.p, total:round2(best.t), arith:best.score===1});
  }
  return {rows,grand,disc,tax,conf};
}
function numsEq(a,b){ return Math.abs(a.qty-b.qty)<1e-6 && Math.abs(a.price-b.price)<1e-6 && (a.total==null||b.total==null||Math.abs(a.total-b.total)<1e-6); }
function reconcile(results){
  const A=parsePass(results[0]), B=parsePass(results[1]);
  const fatal=[], warn=[];
  if(Math.min(A.conf,B.conf)<50) fatal.push(`ثقة القراءة منخفضة (${Math.round(Math.min(A.conf,B.conf))}%) — أعد التصوير بإضاءة أفضل.`);
  if(!A.rows.length) fatal.push('لم تُقرأ أي مواد من الفاتورة.');
  const used=new Set(); const merged=[]; let mismatch=0;
  for(const a of A.rows){
    let bi=-1,bs=0;
    B.rows.forEach((b,j)=>{ if(used.has(j))return; const s=jac(toks(a.name),toks(b.name)); if(s>bs){bs=s;bi=j;} });
    if(bi>=0&&bs>=.7){ used.add(bi); const b=B.rows[bi];
      if(numsEq(a,b)) merged.push({...a,agree:true});
      else { mismatch++; merged.push({...a,agree:false}); warn.push(`اختلاف أرقام بين القراءتين في: «${a.name}»`); }
    } else { merged.push({...a,agree:false}); warn.push(`ظهر في قراءة واحدة فقط: «${a.name}»`); }
  }
  if(A.rows.length>=3 && mismatch/A.rows.length>.34) fatal.push('أكثر من ثلث الأسطر مختلفة بين القراءتين المستقلتين.');
  if(A.grand!=null&&B.grand!=null&&Math.abs(A.grand-B.grand)>Math.max(25,A.grand*.002)) fatal.push('المجموع الكلي مختلف بين القراءتين.');
  S.lines=merged; S.grand=A.grand!=null?A.grand:B.grand; S.disc=A.disc||B.disc||0; S.tax=A.tax||B.tax||0; S.manual=false;
  if(fatal.length){ showStop(fatal); return; }
  $('s2').classList.remove('locked');
  if(warn.length){ $('warnPanel').hidden=false; $('warnReasons').innerHTML=warn.map(w=>`<li>${w}</li>`).join(''); }
  renderReview();
  $('s2').scrollIntoView({behavior:'smooth'});
}
function showStop(reasons){
  $('s2').classList.remove('locked'); $('stopPanel').hidden=false; $('reviewWrap').hidden=true;
  $('stopReasons').innerHTML=reasons.map(r=>`<li>${r}</li>`).join('');
  $('s2').scrollIntoView({behavior:'smooth'});
}

/* ---------- المراجعة ---------- */
function renderReview(){
  $('reviewWrap').hidden=false;
  const tb=$('reviewTable').querySelector('tbody'); tb.innerHTML='';
  S.lines.forEach((ln,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input data-i="${i}" data-f="name" value="${ln.name.replace(/"/g,'&quot;')}"></td>
      <td><input class="num" data-i="${i}" data-f="qty" inputmode="decimal" value="${ln.qty}"></td>
      <td><input class="num" data-i="${i}" data-f="price" inputmode="decimal" value="${ln.price}"></td>
      <td><input class="num" data-i="${i}" data-f="total" inputmode="decimal" value="${ln.total}"></td>
      <td class="calc"></td><td class="match hint">—</td>
      <td><button class="btn ghost" data-del="${i}">×</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input').forEach(inp=>inp.oninput=()=>{
    const i=+inp.dataset.i,f=inp.dataset.f;
    S.lines[i][f]= f==='name'? inp.value : (parseFloat(dig(inp.value))||0);
    updateReview();
  });
  tb.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ S.lines.splice(+b.dataset.del,1); renderReview(); });
  $('grandInput').value=S.grand!=null?S.grand:''; $('discInput').value=S.disc; $('taxInput').value=S.tax;
  updateReview();
}
function updateReview(){
  const tb=$('reviewTable').querySelector('tbody');
  let sum=0, rowsOk=true;
  S.lines.forEach((ln,i)=>{
    const tr=tb.children[i]; if(!tr)return;
    const ok=ln.qty>0&&ln.price>=0&&Math.abs(ln.qty*ln.price-ln.total)<=Math.max(1,ln.total*.004);
    tr.querySelector('.calc').innerHTML= ok?'<span class="badge ok">✓</span>':'<span class="badge bad">✗</span>';
    if(!ok||!ln.name.trim()) rowsOk=false;
    sum+=ln.total;
  });
  S.disc=parseFloat(dig($('discInput').value))||0; S.tax=parseFloat(dig($('taxInput').value))||0;
  const g=parseFloat(dig($('grandInput').value)); S.grand=isFinite(g)?g:null;
  const badge=$('diffBadge');
  let arithOk=true;
  if(S.grand!=null){
    const expected=S.grand+S.disc-S.tax, diff=round2(sum-expected);
    const ok=Math.abs(diff)<=Math.max(50,S.grand*.002);
    badge.className='badge '+(ok?'ok':'bad'); badge.textContent=`مجموع الأسطر ${round2(sum)} — الفرق ${diff}`;
    arithOk=ok;
  } else { badge.className='badge bad'; badge.textContent='أدخل مجموع الفاتورة من الورقة'; arithOk=false; }
  $('btnToLink').disabled=!(rowsOk&&arithOk&&$('confirmChk').checked&&S.lines.length);
}

/* ---------- المطابقة ---------- */
function buildPool(){
  S.pool=S.cat.items.filter(it=>it.k===S.company||(it.k==='غير محدد'&&it.g===S.company));
  const df={}; for(const it of S.pool) for(const t of new Set(it.toks)) df[t]=(df[t]||0)+1;
  S.idf={}; const N=S.pool.length||1; for(const t in df) S.idf[t]=Math.log(1+N/df[t]);
}
function matchLine(ln){
  const paperAll=ALLCOLORS.test(norm(ln.name));
  const pT=toks(ln.name), pN=numsOf(ln.name), pB=baseToks(ln.name);
  let scored=S.pool.map(it=>{
    let sc;
    if(pT.includes(it.code)&&it.code.length>=3) sc=1;
    else{
      const j=jac(pT,it.toks,S.idf);
      const eq=JSON.stringify(pN)===JSON.stringify(it.nums);
      const sub=pN.every(x=>it.nums.includes(x));
      sc= eq? .5+.5*j : sub? Math.min(.55,.3+.4*j) : Math.min(.35,.2*j);
    }
    return {it,sc};
  }).sort((a,b)=>b.sc-a.sc);
  if(paperAll){
    const cands=scored.filter(x=>pN.every(n=>x.it.nums.includes(n))&&jac(pB,x.it.base,S.idf)>=.5).map(x=>x.it);
    return {mode:'dist',cands};
  }
  const best=scored[0], second=scored[1];
  if(best&&best.sc>=.86&&(!second||best.sc-second.sc>=.08||second.sc<.6)) return {mode:'auto',item:best.it};
  const cands=scored.filter(x=>x.sc>=.45).slice(0,8).map(x=>x.it);
  return {mode:'dist',cands};
}
function renderLink(){
  buildPool();
  const wrap=$('linkWrap'); wrap.innerHTML='';
  let need=0;
  S.lines.forEach((ln,i)=>{
    const r=matchLine(ln); ln.match=r;
    const tr=$('reviewTable').querySelector('tbody').children[i];
    if(r.mode==='auto'){ ln.dist=null; if(tr) tr.querySelector('.match').innerHTML=`<span class="badge ok">${r.item.name}</span>`; return; }
    need++;
    if(tr) tr.querySelector('.match').innerHTML='<span class="badge bad">يحتاج ربط</span>';
    ln.dist={shares:{},excluded:false};
    const card=document.createElement('div'); card.className='linkCard'; card.dataset.i=i;
    card.innerHTML=`<h3>${ln.name}</h3>
      <div class="meta">كمية الورقة: <b dir="ltr">${ln.qty}</b> — السعر: <b dir="ltr">${ln.price}</b> — الإجمالي: <b dir="ltr">${ln.total}</b></div>
      <div class="row"><button class="btn ghost eq">توزيع بالتساوي</button>
      <label class="meta"><input type="checkbox" class="exc"> استبعاد هذا السطر من الملف</label></div>
      <div class="cands"></div>
      <input type="text" class="search" placeholder="ابحث عن صنف آخر من نفس الشركة لإضافته…">
      <div class="remain bad"></div>`;
    wrap.appendChild(card);
    const candsBox=card.querySelector('.cands');
    const addCand=it=>{
      if(candsBox.querySelector(`[data-code="${it.code}"]`))return;
      const row=document.createElement('div'); row.className='cand'; row.dataset.code=it.code;
      row.innerHTML=`<div class="nm">${it.name}<div class="cd">${it.code}</div></div><input type="text" inputmode="decimal" value="0">`;
      const inp=row.querySelector('input');
      inp.oninput=()=>{ ln.dist.shares[it.code]=parseFloat(dig(inp.value))||0; ln.dist.item=ln.dist.item||{}; ln.dist.item[it.code]=it; checkCard(card,ln); };
      ln.dist.item=ln.dist.item||{}; ln.dist.item[it.code]=it; ln.dist.shares[it.code]=0;
      candsBox.appendChild(row);
    };
    r.cands.forEach(addCand);
    card.querySelector('.eq').onclick=()=>{
      const rows=[...candsBox.querySelectorAll('.cand')]; if(!rows.length)return;
      const each=round3(ln.qty/rows.length); let acc=0;
      rows.forEach((row,j)=>{ const v=j===rows.length-1?round3(ln.qty-acc):each; acc=round3(acc+v);
        row.querySelector('input').value=v; ln.dist.shares[row.dataset.code]=v; });
      checkCard(card,ln);
    };
    card.querySelector('.exc').onchange=e=>{ ln.dist.excluded=e.target.checked; checkCard(card,ln); };
    card.querySelector('.search').oninput=e=>{
      const q=toks(e.target.value); if(q.length<1)return;
      S.pool.map(it=>({it,s:jac(q,it.toks,S.idf)})).sort((a,b)=>b.s-a.s).slice(0,5).forEach(x=>{ if(x.s>.3)addCand(x.it); });
    };
    checkCard(card,ln);
  });
  $('s3').classList.remove('locked');
  if(!need){ $('linkWrap').innerHTML='<div class="banner ok">كل المواد طوبقت تلقائياً بيقين ✓</div>'; $('btnToExport').disabled=false; }
  else $('btnToExport').disabled=true;
  $('s3').scrollIntoView({behavior:'smooth'});
}
function checkCard(card,ln){
  const sum=round3(Object.values(ln.dist.shares).reduce((a,b)=>a+b,0));
  const rem=round3(ln.qty-sum);
  const el=card.querySelector('.remain');
  const ok=ln.dist.excluded||(Math.abs(rem)<1e-6&&sum>0);
  el.className='remain '+(ok?'ok':'bad');
  el.textContent=ln.dist.excluded?'مستبعد ✓':(ok?'المجموع مطابق لكمية الورقة ✓':`المتبقي: ${rem}`);
  ln.resolved=ok;
  $('btnToExport').disabled=!S.lines.every(l=>l.match.mode==='auto'||l.resolved);
}

/* ---------- التصدير ---------- */
function buildExport(){
  const extra=[13,16,17,18,19,30];
  const newVary=[...new Set([...S.cat.vary,...extra])].sort((a,b)=>a-b);
  const records=[]; let count=0,sum=0,excluded=0;
  for(const ln of S.lines){
    let entries=[];
    if(ln.match.mode==='auto') entries=[{it:ln.match.item,qty:ln.qty}];
    else if(ln.dist.excluded){ excluded++; continue; }
    else entries=Object.entries(ln.dist.shares).filter(([c,q])=>q>0).map(([c,q])=>({it:ln.dist.item[c],qty:q}));
    let acc=0;
    entries.forEach((en,j)=>{
      let total=round2(en.qty*ln.price);
      if(j===entries.length-1&&ln.total) total=round2(ln.total-acc);
      acc=round2(acc+total);
      const m={}; for(const k in ln.match.mode==='auto'?en.it.m:en.it.m) m[k]=en.it.m[k];
      m[13]=encFloat(en.qty); m[16]=encFloat(ln.price); m[17]=encFloat(0); m[18]=encFloat(0); m[19]=encFloat(total); m[30]=encFloat(total);
      records.push({c:en.it.c,n:en.it.n,g:en.it.g,k:en.it.k,u:en.it.u,v:bytesToB64(encodeV(m,newVary))});
      count++; sum=round2(sum+total);
    });
  }
  const h=S.cat.header;
  const out=[{hdr:pick(h,'hdr'),fields:pick(h,'fields'),base:pick(h,'base'),vary:newVary},...records];
  const d=new Date(), pad=n=>String(n).padStart(2,'0');
  const stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const fname=`seraj_${S.company.replace(/[^\w\u0621-\u064A]+/g,'_')}_${stamp}.json`;
  S.exportData={json:JSON.stringify(out),fname,records,count,sum,excluded};
  $('summary').textContent=`${count} سطر استيراد — الإجمالي ${round2(sum)} — مستبعد ${excluded} — الشركة: ${S.company}`;
  $('fileName').textContent=fname;
  $('s4').classList.remove('locked'); $('s4').scrollIntoView({behavior:'smooth'});
}
function download(name,content,type){
  const blob=new Blob([content],{type}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function csv(){
  const rows=[['code','name','unit','qty','price','total','barcode','company']];
  const out=JSON.parse(S.exportData.json);
  for(const r of out.slice(1)){
    const m=decodeV(b64ToBytes(r.v),out[0].vary);
    rows.push([r.c,r.n,r.u,rawFloat(m[13]),rawFloat(m[16]),rawFloat(m[19]),rawStr(m[36]),r.k]);
  }
  return '\uFEFF'+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
}

/* ---------- الأحداث ---------- */
window.addEventListener('DOMContentLoaded',()=>{
  loadCatalog();
  $('companySel').onchange=e=>{ S.company=e.target.value; refreshReadBtn(); };
  $('btnPick').onclick=()=>$('fileInput').click();
  $('fileInput').onchange=e=>{ for(const f of e.target.files) S.images.push({file:f,url:URL.createObjectURL(f)}); e.target.value=''; renderThumbs(); refreshReadBtn(); };
  $('btnClear').onclick=()=>{ S.images.forEach(im=>URL.revokeObjectURL(im.url)); S.images=[]; renderThumbs(); refreshReadBtn(); };
  $('btnRead').onclick=readInvoice;
  $('btnRetry').onclick=()=>{ $('stopPanel').hidden=true; readInvoice(); };
  $('btnManual').onclick=()=>{ S.manual=true; S.lines=[{name:'',qty:0,price:0,total:0}]; S.grand=null;S.disc=0;S.tax=0; $('stopPanel').hidden=true; renderReview(); };
  $('btnAddRow').onclick=()=>{ S.lines.push({name:'',qty:0,price:0,total:0}); renderReview(); };
  ['grandInput','discInput','taxInput'].forEach(id=>$(id).oninput=updateReview);
  $('confirmChk').onchange=updateReview;
  $('btnToLink').onclick=renderLink;
  $('btnToExport').onclick=buildExport;
  $('btnJson').onclick=()=>download(S.exportData.fname,S.exportData.json,'application/json');
  $('btnCsv').onclick=()=>download(S.exportData.fname.replace('.json','.csv'),csv(),'text/csv');
  $('btnCopy').onclick=async()=>{ try{ await navigator.clipboard.writeText(S.exportData.json); $('btnCopy').textContent='تم النسخ ✓'; setTimeout(()=>$('btnCopy').textContent='نسخ JSON',1500);}catch(e){alert('تعذر النسخ');} };
});
