'use strict';
/* فاتورة المورد ← ملف استيراد سراج — محرك قراءة مع تدوير تلقائي، دمج صفحات، وأعمدة من العناوين */
const $=id=>document.getElementById(id);
const pick=(o,k)=>{for(const key of Object.keys(o))if(key.trim()===k)return o[key];};
const r2=v=>Math.round(v*100)/100, r3=v=>Math.round(v*1000)/1000;
const fmt=v=>Number(v).toLocaleString('en-US');
function toast(msg,kind){const t=document.createElement('div');t.className='toast '+(kind||'');t.textContent=msg;$('toasts').appendChild(t);setTimeout(()=>t.remove(),3200);}

/* ---------- ترميز سجلات سراج ---------- */
function b64ToBytes(b){const s=atob(String(b).replace(/\s/g,''));const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
function bytesToB64(a){let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return btoa(s);}
function decodeV(bytes,vary){const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let o=0;const m={};for(const i of vary){const n=dv.getUint32(o,true);o+=4;m[i]=bytes.slice(o,o+n);o+=n;}return m;}
function rawFloat(r){return r&&r.length>=8?new DataView(r.buffer,r.byteOffset,r.byteLength).getFloat64(0,true):0;}
function rawStr(r){if(!r)return'';let s='';for(let i=0;i+1<r.length;i+=2)s+=String.fromCharCode(r[i]|(r[i+1]<<8));return s;}
function encFloat(v){const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,Number(v)||0,true);return b;}
function encodeV(m,vary){let t=0;for(const i of vary)t+=4+(m[i]?m[i].length:0);const out=new Uint8Array(t);const dv=new DataView(out.buffer);let o=0;for(const i of vary){const r=m[i]||new Uint8Array(0);dv.setUint32(o,r.length,true);o+=4;out.set(r,o);o+=r.length;}return out;}

/* ---------- تطبيع العربية ---------- */
const dig=s=>String(s).replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x0660).replace(/[۰-۹]/g,d=>d.charCodeAt(0)-0x06F0);
function norm(s){s=dig(String(s||'').toLowerCase());s=s.replace(/[\u064B-\u065F\u0670\u0640]/g,'');s=s.replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي');return s.replace(/[^\u0621-\u064Aa-z0-9.\s]/g,' ').replace(/\s+/g,' ').trim();}
const toks=s=>norm(s).split(' ').filter(Boolean).map(t=>t.replace(/^ال/,''));
const numsOf=s=>(norm(s).match(/\d+(?:\.\d+)?/g)||[]).map(Number).sort((a,b)=>a-b);
const COLORS=['ابيض','اسود','احمر','اخضر','ازرق','اصفر','رصاصي','تبني','جوزي','شمباني','ذهبي','فضي','نحاسي','صاجي','برتقالي','بنفسجي','وردي','سمائي','فستقي','مشمشي','باذنجاني','ماروني','نيلي','بصلي','تركوازي','شذري','عاج','بيج','كريمي','لولوي','زيتوني','حشيشي','فسفوري','ملون','ملونه','غامق','فاتح','طافي','لامع'];
const ALLCOLORS=/(جميع\s*(ال)?الوان|كل\s*(ال)?الوان|الوان\s*(متعدده|مختلفه)|مكس\s*الوان|جميع\s*الاصناف|الوان)/;
const baseToks=s=>toks(s).filter(t=>!/^\d/.test(t)&&!COLORS.includes(t)&&!['مكس','رقم','كود','لون'].includes(t));
function jac(a,b,idf){const A=new Set(a),B=new Set(b);let i=0,u=0;for(const t of new Set([...A,...B])){const w=(idf&&idf[t])||1;u+=w;if(A.has(t)&&B.has(t))i+=w;}return u?i/u:0;}

/* ---------- الحالة ---------- */
const S={cat:null,company:'',images:[],orient:[],lines:[],grand:null,disc:0,net:null,manual:false,pool:[],idf:{},exportData:null,audit:null,compList:[],
  cfg:{scale:2400,passes:3,conf:50,rotate:'auto',adaptive:true,digits:true,catalog:true,solve:true,loose:true}};

/* ---------- الكتالوج ---------- */
async function loadCatalog(){
  try{
    const res=await fetch('catalog.json');if(!res.ok)throw new Error(res.status);
    const arr=await res.json();const h=arr[0];
    const fields=pick(h,'fields').map(f=>[String(f[0]).trim(),f[1]]);
    const vary=pick(h,'vary');
    const items=arr.slice(1).map(r=>{
      const m=decodeV(b64ToBytes(pick(r,'v')),vary);
      const it={c:String(pick(r,'c')||'').trim(),n:String(pick(r,'n')||'').trim(),g:String(pick(r,'g')||'').trim(),k:String(pick(r,'k')||'').trim(),u:String(pick(r,'u')||'').trim(),m};
      it.name=rawStr(m[58])||it.n;it.code=rawStr(m[57])||it.c;it.barcode=rawStr(m[36]);it.unit=rawStr(m[52])||it.u;
      it.buy=rawFloat(m[71]);it.last=rawFloat(m[80]);it.toks=toks(it.name);it.base=baseToks(it.name);it.nums=numsOf(it.name);
      return it;
    });
    S.cat={header:h,fields,vary,items,codeSet:new Set(items.map(i=>i.code)),barSet:new Set(items.map(i=>i.barcode).filter(Boolean))};
    const G={},K={};
    for(const it of items){if(it.g)G[it.g]=(G[it.g]||0)+1;if(it.k)K[it.k]=(K[it.k]||0)+1;}
    S.compList=[...Object.entries(G).map(([n,c])=>({mode:'g',n,c})),...Object.entries(K).map(([n,c])=>({mode:'k',n,c}))];
    buildCompanyOptions('');
    $('companySel').disabled=false;
    $('catalogStatus').className='banner ok reveal in';
    $('catalogStatus').textContent=`تم تحميل الكتالوج: ${items.length} صنف — ${Object.keys(G).length} مجموعة، ${Object.keys(K).length} شركة.`;
  }catch(e){$('catalogStatus').className='banner danger reveal in';$('catalogStatus').textContent='تعذر تحميل catalog.json — تأكد من رفعه بجانب index.html.';}
}
function buildCompanyOptions(q){
  const sel=$('companySel');const cur=sel.value;const nq=norm(q);
  sel.innerHTML='<option value="">— اختر الشركة أولاً —</option>';
  const mk=(label,list)=>{if(!list.length)return;const og=document.createElement('optgroup');og.label=label;
    list.sort((a,b)=>b.c-a.c||a.n.localeCompare(b.n,'ar')).forEach(e=>{const o=document.createElement('option');o.value=e.mode+'::'+e.n;o.textContent=`${e.n} (${e.c} صنفاً)`;og.appendChild(o);});sel.appendChild(og);};
  const f=e=>!nq||norm(e.n).includes(nq);
  mk('المجموعات (كما في سراج)',S.compList.filter(e=>e.mode==='g'&&f(e)));
  mk('الشركات (المورد)',S.compList.filter(e=>e.mode==='k'&&f(e)));
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
}

/* ---------- الصور ---------- */
function refreshReadBtn(){$('btnRead').disabled=!(S.company&&S.images.length&&S.cat);}
function renderThumbs(){const t=$('thumbs');t.innerHTML='';S.images.forEach((im,i)=>{const d=document.createElement('div');d.className='th';d.innerHTML=`<img src="${im.url}" alt=""><button data-i="${i}">×</button>`;d.querySelector('button').onclick=e=>{e.stopPropagation();URL.revokeObjectURL(im.url);S.images.splice(i,1);S.orient.splice(i,1);renderThumbs();refreshReadBtn();};d.onclick=()=>{$('lbImg').src=im.url;$('lightbox').hidden=false;};t.appendChild(d);});}
const loadImg=url=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=url;});

/* ---------- المعالجة المسبقة والتدوير ---------- */
function baseCanvas(img,maxSide){const sc=Math.min(2.5,Math.max(1,maxSide/Math.max(img.width,img.height)));const w=Math.round(img.width*sc),h=Math.round(img.height*sc);const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);return cv;}
function rotateCanvas(cv,deg){deg=((deg%360)+360)%360;if(!deg)return cv;const w=cv.width,h=cv.height;const out=document.createElement('canvas');const cx=out.getContext('2d');
  if(deg===180){out.width=w;out.height=h;cx.translate(w,h);cx.rotate(Math.PI);}
  else if(deg===90){out.width=h;out.height=w;cx.translate(h,0);cx.rotate(Math.PI/2);}
  else{out.width=h;out.height=w;cx.translate(0,w);cx.rotate(-Math.PI/2);}
  cx.drawImage(cv,0,0);return out;}
function grayOf(cv){const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height);const g=new Uint8Array(cv.width*cv.height);for(let i=0,j=0;i<d.data.length;i+=4,j++)g[j]=Math.round(.299*d.data[i]+.587*d.data[i+1]+.114*d.data[i+2]);return g;}
function putGray(cv,g,fn){const cx=cv.getContext('2d');const d=cx.createImageData(cv.width,cv.height);for(let i=0,j=0;i<d.data.length;i+=4,j++){const v=fn?fn(g[j],j):g[j];d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}cx.putImageData(d,0,0);return cv;}
function prepContrast(cv){const g=grayOf(cv);const hist=new Array(256).fill(0);for(const v of g)hist[v]++;const n=g.length;let lo=0,hi=255,a=0;for(let x=0;x<256;x++){a+=hist[x];if(a>n*.02){lo=x;break;}}a=0;for(let x=0;x<256;x++){a+=hist[x];if(a>n*.98){hi=x;break;}}if(hi<=lo){lo=0;hi=255;}return putGray(cv,g,v=>Math.max(0,Math.min(255,Math.round((v-lo)*255/(hi-lo)))));}
function prepOtsu(cv){const g=grayOf(cv);const hist=new Array(256).fill(0);for(const v of g)hist[v]++;let sum=0;for(let x=0;x<256;x++)sum+=x*hist[x];let sb=0,wb=0,mx=0,th=127;const n=g.length;for(let x=0;x<256;x++){wb+=hist[x];if(!wb)continue;const wf=n-wb;if(!wf)break;sb+=x*hist[x];const d=sb/wb-(sum-sb)/wf,v=wb*wf*d*d;if(v>mx){mx=v;th=x;}}return putGray(cv,g,v=>v>th?255:0);}
function prepAdaptive(cv){const w=cv.width,h=cv.height,g=grayOf(cv);const W=w+1;const integ=new Float64Array(W*(h+1));for(let y=1;y<=h;y++){let row=0;for(let x=1;x<=w;x++){row+=g[(y-1)*w+x-1];integ[y*W+x]=integ[(y-1)*W+x]+row;}}const r=Math.max(8,Math.round(Math.max(w,h)/70))|1,rad=r>>1,C=9;return putGray(cv,(v,j)=>{const y=(j/w)|0,x=j%w;const y0=Math.max(0,y-rad),y1=Math.min(h-1,y+rad),x0=Math.max(0,x-rad),x1=Math.min(w-1,x+rad);const area=(x1-x0+1)*(y1-y0+1);const s=integ[(y1+1)*W+x1+1]-integ[y0*W+x1+1]-integ[(y1+1)*W+x0]+integ[y0*W+x0];return v>s/area-C?255:0;});}

/* كشف الاتجاه: إسقاط الحبر + مسبار OCR سريع */
function projectionCandidates(cv){
  const g=grayOf(cv);const w=cv.width,h=cv.height;
  const rs=new Float64Array(h),cs=new Float64Array(w);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ink=g[y*w+x]<128?1:0;rs[y]+=ink;cs[x]+=ink;}
  const cvv=a=>{let m=0;for(const v of a)m+=v;m/=a.length;let s=0;for(const v of a)s+=(v-m)*(v-m);return m?Math.sqrt(s/a.length)/m:0;};
  const vr=cvv(rs),vc=cvv(cs);
  if(vr>vc*1.12)return[0,180];
  if(vc>vr*1.12)return[90,270];
  return[0,90,180,270];
}
async function detectOrientation(img,idx){
  if(S.cfg.rotate!=='auto')return +S.cfg.rotate;
  const small=prepOtsu(baseCanvas(img,900));
  const cands=projectionCandidates(small);
  if(cands.length===1)return cands[0];
  const probe=await Tesseract.createWorker('ara+eng',1,{logger:()=>{}});
  await probe.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1'});
  let best=cands[0],bs=-1;
  for(const deg of cands){
    const cv=rotateCanvas(small,deg);
    const {data}=await probe.recognize(cv,{},{blocks:true,text:true});
    const c=confOf(data);const wc=(data.text||'').split(/\s+/).filter(Boolean).length;
    const sc=c*Math.sqrt(Math.min(wc,60));
    if(sc>bs){bs=sc;best=deg;}
  }
  await probe.terminate();
  return best;
}

/* ---------- الثقة من الكلمات ---------- */
function confOf(data){
  const ws=[];
  if(data.blocks)for(const b of data.blocks)for(const p of (b.paragraphs||[]))for(const l of (p.lines||[]))for(const w of (l.words||[]))ws.push(w);
  if(ws.length){let s=0,n=0;for(const w of ws){const t=(w.text||'').length;s+=(w.confidence||0)*t;n+=t;}return n?s/n:0;}
  return data.confidence||0;
}
function extractLines(data,passId,page,W,H,pageConf){
  const out=[];
  const push=(words,text,conf)=>{if(!text||!text.trim())return;
    const ws=(words||[]).map(w=>({t:dig(w.text||'').trim(),c:w.confidence||conf||pageConf,x0:w.bbox?w.bbox.x0:0,x1:w.bbox?w.bbox.x1:0,y0:w.bbox?w.bbox.y0:0,y1:w.bbox?w.bbox.y1:0})).filter(w=>w.t);
    const lc=ws.length?ws.reduce((a,w)=>a+w.c,0)/ws.length:(conf||pageConf);
    const cy=ws.length?ws.reduce((a,w)=>a+(w.y0+w.y1)/2,0)/ws.length:0;
    const hh=ws.length?Math.max(...ws.map(w=>w.y1-w.y0)):16;
    out.push({pass:passId,page,text:dig(text).trim(),conf:lc,words:ws,cy,h:hh,W,H});};
  if(data.blocks&&data.blocks.length){for(const b of data.blocks)for(const p of (b.paragraphs||[]))for(const l of (p.lines||[]))push(l.words,l.text,l.confidence);}
  else{let y=0;for(const t of (data.text||'').split(/\r?\n/)){push([],t,data.confidence);const L=out[out.length-1];if(L){L.cy=y+8;L.h=16;y+=20;}}}
  return out;
}

/* ---------- محرك القراءة ---------- */
function passConfigs(){
  const c=S.cfg;const list=[
    {id:'A',name:'تباين مضبوط',lang:'ara+eng',psm:'6',prep:prepContrast},
    {id:'B',name:'ثنائي Otsu',lang:'ara+eng',psm:'4',prep:prepOtsu}];
  if(c.passes>=3)list.push(c.adaptive?{id:'C',name:'إضاءة موضعية',lang:'ara+eng',psm:'6',prep:prepAdaptive}:{id:'C',name:'تباين PSM3',lang:'ara+eng',psm:'3',prep:prepContrast});
  if(c.digits)list.push({id:'D',name:'أرقام مخصّصة',lang:'eng',psm:'6',prep:prepContrast,white:'0123456789.,'});
  return list;
}
function setProg(p,txt){$('progressBar').style.width=Math.round(p*100)+'%';$('progressText').textContent=txt;}
async function runRead(){
  $('btnRead').disabled=true;$('stopPanel').hidden=true;$('warnPanel').hidden=true;$('reviewWrap').hidden=true;$('prog').hidden=false;
  const cfgs=passConfigs();
  $('passList').innerHTML='<li id="pl_OR" class="run">كشف اتجاه الصور وتدويرها</li>'+cfgs.map(c=>`<li id="pl_${c.id}">قراءة ${c.id} — ${c.name}</li>`).join('');
  const all=[];const confs={};const pageText={};
  try{
    for(let i=0;i<S.images.length;i++){
      setProg(0,`كشف اتجاه الصورة ${i+1}/${S.images.length}…`);
      const img=await loadImg(S.images[i].url);
      S.orient[i]=await detectOrientation(img,i);
    }
    $('pl_OR').className='done';
    const totalSteps=cfgs.length*S.images.length;let step=0;
    for(const cfg of cfgs){
      $('pl_'+cfg.id).className='run';
      const worker=await Tesseract.createWorker(cfg.lang,1,{logger:m=>{if(m.status==='recognizing text')setProg((step+m.progress)/totalSteps,`قراءة ${cfg.id} — ${Math.round(m.progress*100)}%`);}});
      const params={tessedit_pageseg_mode:cfg.psm,preserve_interword_spaces:'1',user_defined_dpi:'300'};
      if(cfg.white)params.tessedit_char_whitelist=cfg.white;
      await worker.setParameters(params);
      let cs=0;
      for(let pi=0;pi<S.images.length;pi++){
        setProg(step/totalSteps,`قراءة ${cfg.id} — صورة ${pi+1}/${S.images.length} (${S.orient[pi]}°)`);
        const img=await loadImg(S.images[pi].url);
        const cv=cfg.prep(rotateCanvas(baseCanvas(img,S.cfg.scale),S.orient[pi]));
        const {data}=await worker.recognize(cv,{},{blocks:true,text:true});
        const pc=confOf(data);
        all.push(...extractLines(data,cfg.id+pi,pi,cv.width,cv.height,pc));
        pageText[pi]=(pageText[pi]||'')+'\n'+(data.text||'');
        cs+=pc;step++;
      }
      confs[cfg.id]=S.images.length?cs/S.images.length:0;
      await worker.terminate();$('pl_'+cfg.id).className='done';
    }
    setProg(1,'اكتملت القراءات — جارٍ التدقيق والمطابقة…');
    assemble(all,confs,cfgs,pageText);
  }catch(e){showStop(['تعذر تشغيل محرك القراءة (يلزم إنترنت أول مرة لتحميل نموذج العربية). '+e.message]);}
  $('prog').hidden=true;refreshReadBtn();
}

/* ---------- تحليل الأرقام والأعمدة ---------- */
function cleanNum(tok){tok=dig(tok).replace(/\s/g,'').replace(/٬/g,',').replace(/٫/g,'.');if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(tok))tok=tok.replace(/,/g,'');else if(/^-?\d+,\d{1,2}$/.test(tok))tok=tok.replace(',','.');else tok=tok.replace(/,/g,'');const v=parseFloat(tok);return isFinite(v)?v:null;}
function tokensOf(line){
  const out=[];const re=/\d[\d.,٬٫]*/g;let m;const s=line.text;
  while((m=re.exec(s))){const st=m.index,en=st+m[0].length;const b=s[st-1]||'',a=s[en]||'';
    const embedded=/[A-Za-z\u0621-\u064A%]/.test(b)||/[A-Za-z\u0621-\u064A%]/.test(a);
    const v=cleanNum(m[0]);if(v==null)continue;
    let cx=null;if(line.words.length){const w=line.words.find(w=>w.t&&dig(w.t).replace(/[^\d]/g,'')===m[0].replace(/[^\d]/g,''));if(w)cx=(w.x0+w.x1)/2;}
    out.push({v,s:st,e:en,embedded,str:m[0].replace(/[^\d]/g,''),cx});}
  return out;
}
const HEADER_KW=[['disc',/حسم|خصم|discount/],['price',/سعر|price|ثمن/],['total',/اجمالي|اجمالى|المبلغ|total/],['qty',/كميه|الكميه|عدد|qty/],['carton',/كارتون|كرتون|carton/],['unit',/وحده|الوحده|unit/],['name',/الماده|اسم|الصنف|بيان|description/]];
function buildCols(lines){
  for(const L of lines){
    if(!L.words.length)continue;
    const cols=[];
    for(const w of L.words){const nw=norm(w.t);if(!nw)continue;
      for(const[role,re]of HEADER_KW){if(re.test(nw)){cols.push({role,cx:(w.x0+w.x1)/2});break;}}}
    const has=r=>cols.some(c=>c.role===r);
    if(has('qty')&&has('price')&&has('total'))return{cols,y:L.cy};
  }
  return null;
}
function solveTriple(stand){
  const n=stand.length;let best=null,bs=-1;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++){
    const q=stand[i].v,p=stand[j].v,t=stand[k].v;
    if(!(q>0)||!(p>0)||q>1e5||t<=0)continue;
    if(Math.abs(q*p-t)>Math.max(1,t*.004))continue;
    let sc=10+(Number.isInteger(q)?2:0)+(t===Math.max(...stand.map(x=>x.v))?2:0)+(k===n-1||stand[n-1].v===0?1:0);
    if(sc>bs){bs=sc;best={q,p,t,used:[stand[i],stand[j],stand[k]]};}
  }
  if(!best&&n>=2){for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const q=stand[i].v,p=stand[j].v;if(q>0&&p>0&&q<=1e5){const t=r2(q*p);const sc=5+(Number.isInteger(q)?1:0);if(sc>bs){bs=sc;best={q,p,t,used:[stand[i],stand[j]]};}}}}
  return best;
}
function parseLine(L,cols){
  const tk=tokensOf(L);const stand=tk.filter(t=>!t.embedded);
  const low=norm(L.text);
  const lastV=stand.length?stand[stand.length-1].v:null;
  if(/مجموع\s*الحسميات|مجموع\s*الخصم|اجمالي\s*الحسم/.test(low)&&lastV!=null)return{kind:'disc',v:lastV};
  if(/صافي\s*القائمه|الصافي|صافي/.test(low)&&lastV!=null)return{kind:'net',v:lastV};
  if(/الرصيد|السابق|الحالي/.test(low))return{kind:'ignore'};
  if(/المجموع|مجموع\s*الفاتوره|اجمالي\s*الفاتوره|grand|total/.test(low)&&lastV!=null)return{kind:'grand',v:lastV};
  if(stand.length<2)return null;
  let q=null,p=null,t=null,disc=0,used=[];
  if(cols&&cols.cols){
    const cs=cols.cols.filter(c=>['qty','price','total','disc','carton'].includes(c.role));
    const gaps=[];const sx=cs.map(c=>c.cx).sort((a,b)=>a-b);for(let i=1;i<sx.length;i++)gaps.push(sx[i]-sx[i-1]);
    const tol=(gaps.length?Math.min(...gaps):L.W*.08)*.45;
    const got={};
    for(const t2 of stand){if(t2.cx==null)continue;let bi=null,bd=1e9;for(const c of cs){const d=Math.abs(t2.cx-c.cx);if(d<bd){bd=d;bi=c;}}
      if(bd<=tol&&bi){if(got[bi.role]==null){got[bi.role]=t2;used.push(t2);}}}
    if(got.qty&&got.price){q=got.qty.v;p=got.price.v;t=got.total?got.total.v:r2(q*p);disc=got.disc?got.disc.v:0;}
  }
  if(q==null){const b=solveTriple(stand);if(!b)return null;q=b.q;p=b.p;t=b.t;used=b.used;disc=0;}
  const usedSet=new Set(used);
  let name=L.text;
  for(const u of usedSet)name=name.slice(0,u.s)+' '+name.slice(u.e);
  name=name.replace(/^\s*\d{1,3}\s*[-–—.)]?\s+/,'').replace(/[\s|،,:.\-]+$/,'').replace(/\s+/g,' ').trim();
  if(!name)return null;
  let code=null,bar=null;
  const pool=S.cat;
  const snap=(t2,set,minL,maxL)=>{const s=t2.str;if(s.length<minL||s.length>maxL)return null;if(set.has(s))return s;
    if(!S.cfg.catalog)return null;let hit=null,n=0;for(const c of set){if(c.length!==s.length)continue;let d=0;for(let i=0;i<s.length;i++)if(c[i]!==s[i])d++;if(d===1){hit=c;n++;}}
    return n===1?hit:null;};
  for(const t2 of stand){if(usedSet.has(t2))continue;
    if(!code&&t2.str.length>=4&&t2.str.length<=7){const v=snap(t2,pool.codeSet,4,7);if(v){code=v;continue;}}
    if(!bar&&t2.str.length>=8&&t2.str.length<=13){const v=snap(t2,pool.barSet,8,13);if(v)bar=v;}}
  return{kind:'row',name,q,p,t:r2(t),disc,code,bar,conf:L.conf,pass:L.pass,cy:L.cy,h:L.h,page:L.page};
}

/* ---------- دمج الصفحات المكررة ---------- */
function groupPages(pageText,all){
  const n=S.images.length;const parent=[...Array(n).keys()];
  const find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
  const uni=(a,b)=>{parent[find(a)]=find(b);};
  const info=[];
  for(let i=0;i<n;i++){
    const txt=norm(pageText[i]||'');
    const inv=(txt.match(/رقم\s*الفاتوره\s*[:：]?\s*(\d+)/)||[])[1]||null;
    const rows=all.filter(L=>L.page===i&&L.pass.startsWith('A')).map(L=>parseLine(L,null)).filter(r=>r&&r.kind==='row');
    info.push({inv,sig:new Set(rows.map(r=>norm(r.name)+'|'+r.q+'|'+r.p)),count:rows.length});
  }
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const a=info[i],b=info[j];
    if(a.inv&&b.inv&&a.inv===b.inv){uni(i,j);continue;}
    if(a.sig.size&&b.sig.size){let inter=0;for(const s of a.sig)if(b.sig.has(s))inter++;
      if(inter/Math.min(a.sig.size,b.sig.size)>=.6)uni(i,j);}
  }
  const key=i=>find(i);
  const groups={};for(let i=0;i<n;i++)(groups[key(i)]=groups[key(i)]||[]).push(i);
  return{key,groups,info};
}

/* ---------- التجميع والتصويت ---------- */
function assemble(all,confs,cfgs,pageText){
  const{key,groups,info}=groupPages(pageText,all);
  const fatal=[],warn=[];
  const minConf=Math.min(...Object.values(confs));
  if(minConf<S.cfg.conf)fatal.push(`ثقة القراءة منخفضة (${Math.round(minConf)}%) — أعد التصوير بإضاءة أفضل أو ثبّت الاتجاه يدوياً.`);
  const colsMap={};
  for(const g of Object.keys(groups))for(const cfg of cfgs){
    const subset=all.filter(L=>key(L.page)===+g&&L.pass.startsWith(cfg.id));
    colsMap[g+'|'+cfg.id]=buildCols(subset);
  }
  const clusters=[];
  for(const L of all){
    const g=key(L.page);const th=Math.max(12,L.h*.65);
    let c=clusters.find(c=>c.g===g&&Math.abs(c.cy-L.cy)<th);
    if(!c){c={g,cy:L.cy,lines:[]};clusters.push(c);}
    c.lines.push(L);c.cy=(c.cy+L.cy)/2;
  }
  const grands=[],discs=[],nets=[];const rowClusters=[];
  for(const c of clusters){
    const readings=[];let isTot=false;
    for(const L of c.lines){
      const cfgId=L.pass.replace(/\d+$/,'');
      const pr=parseLine(L,colsMap[c.g+'|'+cfgId]);
      if(!pr)continue;
      if(pr.kind==='grand'){grands.push(pr.v);isTot=true;}
      else if(pr.kind==='disc'){discs.push(pr.v);isTot=true;}
      else if(pr.kind==='net'){nets.push(pr.v);isTot=true;}
      else if(pr.kind==='row')readings.push(pr);
    }
    if(readings.length)rowClusters.push(readings);
  }
  const vote=arr=>{if(!arr.length)return null;const m={};for(const v of arr)m[v]=(m[v]||0)+1;const e=Object.entries(m).sort((a,b)=>b[1]-a[1]);return{v:+e[0][0],n:e[0][1],ties:e.filter(x=>x[1]===e[0][1]).length};};
  const gv=vote(grands),dv=vote(discs),nv=vote(nets);
  S.grand=gv?gv.v:(nv&&dv?r2(nv.v+dv.v):null);
  S.disc=dv?dv.v:0;S.net=nv?nv.v:null;
  if(!rowClusters.length)fatal.push('لم تُقرأ أي مواد من الفاتورة.');
  if(gv&&gv.ties>1)fatal.push('المجموع الكلي مختلف بين القراءات.');
  S.lines=[];let doubt=0,fixed=0,ok=0;
  for(const rs of rowClusters){const ln=consensusRow(rs);S.lines.push(ln);
    if(ln.status==='doubt')doubt++;else if(ln.status==='fixed')fixed++;else ok++;}
  if(S.lines.length>=3&&doubt/S.lines.length>.34)fatal.push('أكثر من ثلث الأسطر غير محسومة بين القراءات.');
  const merged=Object.values(groups).filter(g=>g.length>1).length;
  S.audit={when:new Date().toISOString(),company:S.company,orient:S.orient.slice(),invoice:info.map(i=>i.inv),mergedPages:merged,
    passes:cfgs.map(c=>({id:c.id,name:c.name,conf:Math.round(confs[c.id]||0)})),grand:S.grand,disc:S.disc,net:S.net,
    lines:S.lines.map(l=>({paper:l.name,code:l.code,barcode:l.barcode,qty:l.qty,price:l.price,total:l.total,status:l.status,corrections:l.corrections,readings:l.readings}))};
  if(fatal.length){showStop(fatal);return;}
  $('s2').classList.remove('locked');setStep(2);
  $('auditSummary').hidden=false;
  $('auditSummary').innerHTML=`<span class="chip ok">مؤكد ${ok}</span><span class="chip fix">مصحّح ${fixed}</span><span class="chip bad">شك ${doubt}</span>`+
    (info[0]&&info[0].inv?`<span class="chip inf">فاتورة ${info[0].inv}</span>`:'')+
    (merged?`<span class="chip inf">دمج ${merged} صفحة مكررة</span>`:'')+
    `<span class="chip inf">اتجاه ${S.orient.join('°/')}°</span>`+
    cfgs.map(c=>`<span class="chip inf">${c.id}: ${Math.round(confs[c.id]||0)}%</span>`).join('');
  const warns=[];
  if(doubt)warns.push(`${doubt} سطر يحتاج تدقيقك اليدوي قبل المتابعة.`);
  if(S.grand==null)warns.push('لم يُعثر على المجموع الكلي — أدخله يدوياً من الورقة.');
  if(S.net!=null&&S.grand!=null&&Math.abs((S.grand-S.disc)-S.net)>Math.max(25,S.net*.002))warns.push('الصافي لا يساوي المجموع ناقص الحسميات — دقّق القيم.');
  if(warns.length){$('warnPanel').hidden=false;$('warnReasons').innerHTML=warns.map(w=>`<li>${w}</li>`).join('');}
  renderReview();$('s2').scrollIntoView({behavior:'smooth'});
  toast('اكتملت القراءة والتدقيق','ok');
}
const CONF={'0':'869','8':'063','6':'580','9':'478','1':'74','7':'12','4':'19','5':'683','3':'89','2':'7'};
function numVars(v){const s=String(v);const set=new Set([v]);if(!S.cfg.solve)return[...set];
  for(let i=0;i<s.length;i++){const ch=s[i];const alts=CONF[ch];if(!alts)continue;for(const a of alts.slice(0,3)){const s2=s.slice(0,i)+a+s.slice(i+1);const n=parseFloat(s2);if(isFinite(n)&&n>0)set.add(n);}}
  return[...set];}
function consensusRow(rs){
  const name=rs.slice().sort((a,b)=>b.conf-a.conf)[0].name;
  const code=rs.map(r=>r.code).find(Boolean)||null;
  const bar=rs.map(r=>r.bar).find(Boolean)||null;
  const corrections=[];
  const pickField=key=>{const vals=rs.map(r=>r[key]).filter(v=>v!=null);const cnt={};for(const v of vals)cnt[v]=(cnt[v]||0)+1;
    const sorted=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
    if(sorted.length&&sorted[0][1]>=2)return{v:+sorted[0][0],src:'consensus'};
    return{v:vals[0]!=null?vals[0]:null,src:'single'};};
  let q=pickField('q'),p=pickField('p'),t=pickField('t');
  const arith=(a,b,c)=>a>0&&b>0&&Math.abs(a*b-c)<=Math.max(1,Math.abs(c)*.004);
  let status='ok';
  if(q.src!=='consensus'||p.src!=='consensus'||t.src!=='consensus'||!arith(q.v,p.v,t.v)){
    let best=null,bestScore=-1,second=-1;
    const prior=preMatch(name);
    const Q=numVars(q.v||0),P=numVars(p.v||0),T=numVars(t.v||0);
    for(const a of Q)for(const b of P)for(const c of T){
      if(!arith(a,b,c))continue;
      let sc=10;
      if(a===q.v)sc+=3;if(b===p.v)sc+=3;if(c===t.v)sc+=3;
      if(Number.isInteger(a))sc+=1.5;
      if(prior&&prior.buy>0){const rel=Math.abs(b-prior.buy)/prior.buy;if(rel<.005)sc+=4;else if(rel<.02)sc+=2;}
      if(sc>bestScore){second=bestScore;bestScore=sc;best={a,b,c};}else if(sc>second)second=sc;
    }
    if(best&&(bestScore-second>=2||bestScore>=16)){
      if(best.a!==q.v)corrections.push(`الكمية ${q.v} ← ${best.a} (حل حسابي)`);
      if(best.b!==p.v)corrections.push(`السعر ${p.v} ← ${best.b} (حل حسابي${prior?' + سعر الكتالوج':''})`);
      if(best.c!==t.v)corrections.push(`الإجمالي ${t.v} ← ${best.c} (حل حسابي)`);
      q={v:best.a};p={v:best.b};t={v:best.c};status='fixed';
    }else if(arith(q.v,p.v,t.v)&&(q.src==='consensus'||p.src==='consensus'))status='ok';
    else status='doubt';
  }
  return{name,code,barcode:bar,qty:q.v||0,price:p.v||0,total:r2(t.v||0),status,corrections,
    readings:rs.map(r=>({pass:r.pass,name:r.name,q:r.q,p:r.p,t:r.t,conf:Math.round(r.conf)}))};
}
function preMatch(name){
  if(!S.cat)return null;const pT=toks(name),pN=numsOf(name);
  let best=null,bs=0;
  for(const it of S.cat.items){const j=jac(pT,it.toks);const eq=JSON.stringify(pN)===JSON.stringify(it.nums);const sc=eq?.5+.5*j:.3*j;if(sc>bs){bs=sc;best=it;}}
  return bs>=.6?best:null;
}

/* ---------- المراجعة ---------- */
function showStop(reasons){$('s2').classList.remove('locked');$('stopPanel').hidden=false;$('reviewWrap').hidden=true;$('auditSummary').hidden=true;$('stopReasons').innerHTML=reasons.map(r=>`<li>${r}</li>`).join('');$('s2').scrollIntoView({behavior:'smooth'});setStep(2);}
function stChip(ln,i){const map={ok:['ok','✓ مؤكد'],fixed:['fix','⚠ مصحّح'],doubt:['bad','✗ شك'],manual:['man','✎ يدوي']};const m=map[ln.status]||map.doubt;return`<button class="badge st ${m[0]}" data-det="${i}">${m[1]}</button>`;}
function renderReview(){
  $('reviewWrap').hidden=false;$('stopPanel').hidden=true;
  const tb=$('reviewTable').querySelector('tbody');tb.innerHTML='';
  S.lines.forEach((ln,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input data-i="${i}" data-f="name" value="${ln.name.replace(/"/g,'&quot;')}"></td>
      <td><input class="num" data-i="${i}" data-f="code" value="${ln.code||ln.barcode||''}" placeholder="—"></td>
      <td><input class="num" data-i="${i}" data-f="qty" inputmode="decimal" value="${ln.qty}"></td>
      <td><input class="num" data-i="${i}" data-f="price" inputmode="decimal" value="${ln.price}"></td>
      <td><input class="num" data-i="${i}" data-f="total" inputmode="decimal" value="${ln.total}"></td>
      <td class="calc"></td><td class="stc">${stChip(ln,i)}</td><td class="match hint">—</td>
      <td><button class="btn ghost" data-del="${i}">×</button></td>`;
    tb.appendChild(tr);
    const det=document.createElement('tr');det.className='detail';det.hidden=true;
    det.innerHTML=`<td colspan="9"><b>القراءات الأصلية:</b><table><tr><th>قراءة</th><th>المادة</th><th>كمية</th><th>سعر</th><th>إجمالي</th><th>ثقة</th></tr>${(ln.readings||[]).map(r=>`<tr><td>${r.pass}</td><td>${r.name}</td><td dir="ltr">${r.q}</td><td dir="ltr">${r.p}</td><td dir="ltr">${r.t}</td><td>${r.conf}%</td></tr>`).join('')}</table>${(ln.corrections||[]).length?'<b>التصحيحات:</b> '+ln.corrections.join(' — '):''}</td>`;
    tb.appendChild(det);
  });
  tb.querySelectorAll('input').forEach(inp=>inp.oninput=()=>{
    const i=+inp.dataset.i,f=inp.dataset.f;const ln=S.lines[i];
    if(f==='name')ln.name=inp.value;
    else if(f==='code'){const s=dig(inp.value).replace(/\D/g,'');ln.code=s.length<=7?s:null;ln.barcode=s.length>7?s:null;}
    else ln[f]=parseFloat(dig(inp.value))||0;
    if(ln.status==='doubt'||ln.status==='fixed')ln.status=ln.qty>0&&Math.abs(ln.qty*ln.price-ln.total)<=Math.max(1,ln.total*.004)?'manual':'doubt';
    else if(ln.status==='ok')ln.status='manual';
    const stc=tb.children[i*2].querySelector('.stc');stc.innerHTML=stChip(ln,i);bindDet(stc,i);
    updateReview();
  });
  tb.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{S.lines.splice(+b.dataset.del,1);renderReview();});
  tb.querySelectorAll('[data-det]').forEach(b=>bindDet(b,+b.dataset.det));
  $('grandInput').value=S.grand!=null?S.grand:'';$('discInput').value=S.disc;$('netInput').value=S.net!=null?S.net:'';
  updateReview();
}
function bindDet(b,i){b.onclick=()=>{const tb=$('reviewTable').querySelector('tbody');const det=tb.children[i*2+1];det.hidden=!det.hidden;};}
function updateReview(){
  const tb=$('reviewTable').querySelector('tbody');let sum=0,rowsOk=true;
  S.lines.forEach((ln,i)=>{const tr=tb.children[i*2];if(!tr)return;
    const ok=ln.qty>0&&ln.price>=0&&Math.abs(ln.qty*ln.price-ln.total)<=Math.max(1,ln.total*.004);
    tr.querySelector('.calc').innerHTML=ok?'<span class="badge ok">✓</span>':'<span class="badge bad">✗</span>';
    if(!ok||!ln.name.trim()||ln.status==='doubt')rowsOk=false;sum+=ln.total;});
  S.disc=parseFloat(dig($('discInput').value))||0;
  const nf=parseFloat(dig($('netInput').value));S.net=isFinite(nf)?nf:null;
  const g=parseFloat(dig($('grandInput').value));S.grand=isFinite(g)?g:null;
  const badge=$('diffBadge');let arithOk=true;
  if(S.grand!=null){const diff=r2(sum-S.grand);const ok=Math.abs(diff)<=Math.max(50,S.grand*.002);
    badge.className='badge '+(ok?'ok':'bad');badge.textContent=`مجموع الأسطر ${fmt(r2(sum))} — الفرق ${fmt(diff)}`;arithOk=ok;
    if(ok&&S.net!=null&&Math.abs((S.grand-S.disc)-S.net)>Math.max(25,S.net*.002)){badge.className='badge bad';badge.textContent='الصافي ≠ المجموع − الحسميات';arithOk=false;}
  }else{badge.className='badge bad';badge.textContent='أدخل مجموع الفاتورة من الورقة';arithOk=false;}
  $('btnToLink').disabled=!(rowsOk&&arithOk&&$('confirmChk').checked&&S.lines.length);
}

/* ---------- المطابقة ---------- */
function buildPool(){
  const[mode,name]=S.company.split('::');
  S.pool=S.cat.items.filter(it=>mode==='g'?it.g===name:(it.k===name||(S.cfg.loose&&it.k==='غير محدد'&&it.g===name)));
  const df={};for(const it of S.pool)for(const t of new Set(it.toks))df[t]=(df[t]||0)+1;
  S.idf={};const N=S.pool.length||1;for(const t in df)S.idf[t]=Math.log(1+N/df[t]);
}
function matchLine(ln){
  if(ln.barcode){const it=S.pool.find(i=>i.barcode===ln.barcode);if(it)return{mode:'auto',item:it,why:'باركود مطابق 100%'};}
  if(ln.code){const it=S.pool.find(i=>i.code===ln.code);if(it)return{mode:'auto',item:it,why:'معرّف مطابق 100%'};}
  const paperAll=ALLCOLORS.test(norm(ln.name));
  const pT=toks(ln.name),pN=numsOf(ln.name),pB=baseToks(ln.name);
  const scored=S.pool.map(it=>{let sc;
    if(pT.includes(it.code)&&it.code.length>=3)sc=1;
    else{const j=jac(pT,it.toks,S.idf);const eq=JSON.stringify(pN)===JSON.stringify(it.nums);const sub=pN.every(x=>it.nums.includes(x));
      sc=eq?.5+.5*j:sub?Math.min(.55,.3+.4*j):Math.min(.35,.2*j);
      if(it.buy>0&&ln.price>0&&Math.abs(ln.price-it.buy)/it.buy<.01)sc=Math.min(1,sc+.12);}
    return{it,sc};}).sort((a,b)=>b.sc-a.sc);
  if(paperAll){const cands=scored.filter(x=>pN.every(n=>x.it.nums.includes(n))&&jac(pB,x.it.base,S.idf)>=.5).map(x=>x.it);return{mode:'dist',cands};}
  const best=scored[0],second=scored[1];
  if(best&&best.sc>=.86&&(!second||best.sc-second.sc>=.08||second.sc<.6))return{mode:'auto',item:best.it,why:'اسم + أرقام + سعر'};
  return{mode:'dist',cands:scored.filter(x=>x.sc>=.45).slice(0,8).map(x=>x.it)};
}
function renderLink(){
  buildPool();const wrap=$('linkWrap');wrap.innerHTML='';let need=0;
  S.lines.forEach((ln,i)=>{
    const r=matchLine(ln);ln.match=r;
    const tr=$('reviewTable').querySelector('tbody').children[i*2];
    if(r.mode==='auto'){ln.dist=null;if(tr)tr.querySelector('.match').innerHTML=`<span class="badge ok" title="${r.why}">${r.item.name}</span>`;return;}
    need++;if(tr)tr.querySelector('.match').innerHTML='<span class="badge bad">يحتاج ربط</span>';
    ln.dist={shares:{},item:{},excluded:false};
    const card=document.createElement('div');card.className='linkCard';
    card.innerHTML=`<h3>${ln.name}</h3><div class="meta">كمية الورقة: <b dir="ltr">${ln.qty}</b> — السعر: <b dir="ltr">${fmt(ln.price)}</b> — الإجمالي: <b dir="ltr">${fmt(ln.total)}</b></div>
      <div class="row"><button class="btn ghost eq">توزيع بالتساوي</button><label class="meta"><input type="checkbox" class="exc"> استبعاد هذا السطر</label></div>
      <div class="cands"></div><input type="text" class="search" placeholder="ابحث عن صنف آخر من نفس الشركة…"><div class="remain bad"></div>`;
    wrap.appendChild(card);
    const box=card.querySelector('.cands');
    const addCand=it=>{if(box.querySelector(`[data-code="${it.code}"]`))return;
      const row=document.createElement('div');row.className='cand';row.dataset.code=it.code;
      row.innerHTML=`<div class="nm">${it.name}<div class="cd">${it.code}${it.barcode?' · '+it.barcode:''}</div></div><input type="text" inputmode="decimal" value="0">`;
      row.querySelector('input').oninput=e=>{ln.dist.shares[it.code]=parseFloat(dig(e.target.value))||0;checkCard(card,ln);};
      ln.dist.item[it.code]=it;ln.dist.shares[it.code]=0;box.appendChild(row);};
    r.cands.forEach(addCand);
    card.querySelector('.eq').onclick=()=>{const rows=[...box.querySelectorAll('.cand')];if(!rows.length)return;const each=r3(ln.qty/rows.length);let acc=0;
      rows.forEach((row,j)=>{const v=j===rows.length-1?r3(ln.qty-acc):each;acc=r3(acc+v);row.querySelector('input').value=v;ln.dist.shares[row.dataset.code]=v;});checkCard(card,ln);};
    card.querySelector('.exc').onchange=e=>{ln.dist.excluded=e.target.checked;checkCard(card,ln);};
    card.querySelector('.search').oninput=e=>{const q=toks(e.target.value);if(!q.length)return;
      S.pool.map(it=>({it,s:jac(q,it.toks,S.idf)})).sort((a,b)=>b.s-a.s).slice(0,5).forEach(x=>{if(x.s>.3)addCand(x.it);});};
    checkCard(card,ln);
  });
  $('s3').classList.remove('locked');setStep(3);
  if(!need){wrap.innerHTML='<div class="banner ok">كل المواد طوبقت بيقين ✓</div>';$('btnToExport').disabled=false;}
  else $('btnToExport').disabled=true;
  $('s3').scrollIntoView({behavior:'smooth'});
}
function checkCard(card,ln){
  const sum=r3(Object.values(ln.dist.shares).reduce((a,b)=>a+b,0));const rem=r3(ln.qty-sum);
  const ok=ln.dist.excluded||(Math.abs(rem)<1e-6&&sum>0);
  const el=card.querySelector('.remain');el.className='remain '+(ok?'ok':'bad');
  el.textContent=ln.dist.excluded?'مستبعد ✓':(ok?'المجموع مطابق لكمية الورقة ✓':`المتبقي: ${rem}`);
  ln.resolved=ok;
  $('btnToExport').disabled=!S.lines.every(l=>l.match.mode==='auto'||l.resolved);
}

/* ---------- التصدير ---------- */
function buildExport(){
  const extra=[13,16,17,18,19,30];
  const newVary=[...new Set([...S.cat.vary,...extra])].sort((a,b)=>a-b);
  const records=[];let count=0,sum=0,excluded=0;
  for(const ln of S.lines){
    let entries=[];
    if(ln.match.mode==='auto')entries=[{it:ln.match.item,qty:ln.qty}];
    else if(ln.dist.excluded){excluded++;continue;}
    else entries=Object.entries(ln.dist.shares).filter(([c,q])=>q>0).map(([c,q])=>({it:ln.dist.item[c],qty:q}));
    let acc=0;
    entries.forEach((en,j)=>{let total=r2(en.qty*ln.price);if(j===entries.length-1&&ln.total)total=r2(ln.total-acc);acc=r2(acc+total);
      const m={};for(const k in en.it.m)m[k]=en.it.m[k];
      m[13]=encFloat(en.qty);m[16]=encFloat(ln.price);m[17]=encFloat(0);m[18]=encFloat(0);m[19]=encFloat(total);m[30]=encFloat(total);
      records.push({c:en.it.c,n:en.it.n,g:en.it.g,k:en.it.k,u:en.it.u,v:bytesToB64(encodeV(m,newVary))});count++;sum=r2(sum+total);});
  }
  const h=S.cat.header;
  const out=[{hdr:pick(h,'hdr'),fields:pick(h,'fields'),base:pick(h,'base'),vary:newVary},...records];
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  const stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const fname=`seraj_${S.company.split('::')[1].replace(/[^\w\u0621-\u064A]+/g,'_')}_${stamp}.json`;
  S.exportData={json:JSON.stringify(out),fname,records,count,sum,excluded};
  if(S.audit){S.audit.export={count,sum,excluded};S.audit.lines=S.lines.map(l=>({paper:l.name,code:l.code,barcode:l.barcode,qty:l.qty,price:l.price,total:l.total,status:l.status,corrections:l.corrections,matched:l.match.mode==='auto'?l.match.item.code:'موزّع',readings:l.readings}));}
  $('summary').textContent=`${count} سطر استيراد — الإجمالي ${fmt(r2(sum))} — مستبعد ${excluded} — ${S.company.split('::')[1]}`;
  $('fileName').textContent=fname;
  $('s4').classList.remove('locked');setStep(4);$('s4').scrollIntoView({behavior:'smooth'});
}
function download(name,content,type){const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
function csv(){const rows=[['code','name','unit','qty','price','total','barcode','company']];const out=JSON.parse(S.exportData.json);
  for(const r of out.slice(1)){const m=decodeV(b64ToBytes(r.v),out[0].vary);rows.push([r.c,r.n,r.u,rawFloat(m[13]),rawFloat(m[16]),rawFloat(m[19]),rawStr(m[36]),r.k]);}
  return'\uFEFF'+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');}

/* ---------- الخطوات والأحداث ---------- */
function setStep(n){document.querySelectorAll('#stepDots li').forEach(li=>{const s=+li.dataset.s;li.classList.toggle('on',s===n);li.classList.toggle('done',s<n);});}
window.addEventListener('DOMContentLoaded',()=>{
  loadCatalog();
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.08});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  $('companySearch').oninput=e=>buildCompanyOptions(e.target.value);
  $('companySel').onchange=e=>{S.company=e.target.value;refreshReadBtn();};
  $('btnPick').onclick=()=>$('fileInput').click();
  $('fileInput').onchange=e=>{for(const f of e.target.files){S.images.push({file:f,url:URL.createObjectURL(f)});S.orient.push(0);}e.target.value='';renderThumbs();refreshReadBtn();};
  $('btnClear').onclick=()=>{S.images.forEach(im=>URL.revokeObjectURL(im.url));S.images=[];S.orient=[];renderThumbs();refreshReadBtn();};
  $('lbClose').onclick=()=>$('lightbox').hidden=true;
  $('lightbox').onclick=e=>{if(e.target.id==='lightbox')$('lightbox').hidden=true;};
  $('btnRead').onclick=runRead;
  $('btnRetry').onclick=()=>{$('stopPanel').hidden=true;runRead();};
  $('btnManual').onclick=()=>{S.manual=true;S.lines=[{name:'',code:null,barcode:null,qty:0,price:0,total:0,status:'manual',corrections:[],readings:[]}];S.grand=null;S.disc=0;S.net=null;$('stopPanel').hidden=true;$('auditSummary').hidden=true;renderReview();};
  $('btnAddRow').onclick=()=>{S.lines.push({name:'',code:null,barcode:null,qty:0,price:0,total:0,status:'manual',corrections:[],readings:[]});renderReview();};
  ['grandInput','discInput','netInput'].forEach(id=>$(id).oninput=updateReview);
  $('confirmChk').onchange=updateReview;
  $('btnToLink').onclick=renderLink;
  $('btnToExport').onclick=buildExport;
  $('btnJson').onclick=()=>{download(S.exportData.fname,S.exportData.json,'application/json');toast('تم تنزيل ملف سراج','ok');};
  $('btnCsv').onclick=()=>download(S.exportData.fname.replace('.json','.csv'),csv(),'text/csv');
  $('btnAudit').onclick=()=>download(S.exportData.fname.replace('.json','_audit.json'),JSON.stringify(S.audit,null,1),'application/json');
  $('btnCopy').onclick=async()=>{try{await navigator.clipboard.writeText(S.exportData.json);toast('تم النسخ','ok');}catch(e){toast('تعذر النسخ','bad');}};
  const bindRange=(id,out,key)=>{$(id).oninput=e=>{S.cfg[key]=+e.target.value;$(out).textContent=e.target.value;};};
  bindRange('cfgScale','oScale','scale');bindRange('cfgConf','oConf','conf');
  $('cfgPasses').onchange=e=>S.cfg.passes=+e.target.value;
  $('cfgRotate').onchange=e=>S.cfg.rotate=e.target.value;
  [['cfgAdaptive','adaptive'],['cfgDigits','digits'],['cfgCatalog','catalog'],['cfgSolve','solve'],['cfgLoose','loose']].forEach(([id,k])=>$(id).onchange=e=>S.cfg[k]=e.target.checked);
  $('cfgReset').onclick=()=>{S.cfg={scale:2400,passes:3,conf:50,rotate:'auto',adaptive:true,digits:true,catalog:true,solve:true,loose:true};
    $('cfgScale').value=2400;$('oScale').textContent=2400;$('cfgConf').value=50;$('oConf').textContent=50;$('cfgPasses').value=3;$('cfgRotate').value='auto';
    ['cfgAdaptive','cfgDigits','cfgCatalog','cfgSolve','cfgLoose'].forEach(id=>$(id).checked=true);toast('أعيد ضبط الإعدادات');};
});
