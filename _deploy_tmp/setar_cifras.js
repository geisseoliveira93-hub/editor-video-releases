// setar_cifras.js — Anexa os PDFs de cifras nas aulas da Academia.
// RODA DENTRO do container engine: node /tmp/setar_cifras.js
// Env: ENGINE_API_KEY (do container), DRYRUN=1 (só relatório, não grava),
//      PARTE=1 (Comunidades Harpa) | PARTE=2 (Teclado Gospel + apostilas) | PARTE=all
//      PUBLIC_BASE_URL (default motor.melodiaseriffs.com.br)
// Idempotente: /academy/aula/anexo dedupa por url (re-rodar não duplica).
'use strict';
const fs = require('fs');
const path = require('path');

const API  = 'http://127.0.0.1:8080';
const KEY  = process.env.ENGINE_API_KEY || '';
const DRY  = process.env.DRYRUN === '1';
const PARTE = String(process.env.PARTE || '1');
const BASE = (process.env.PUBLIC_BASE_URL || 'https://motor.melodiaseriffs.com.br').replace(/\/+$/,'');
const ROOT = '/data/media/academy/cifras';            // onde os PDFs ficam no disco
const PUBROOT = '/media/academy/cifras';              // url pública base
const NOME_ANEXO = 'Baixar cifra';                    // render mostra "📎 Baixar cifra"

const COM = {
  teclado: 'fb9c4134-b0e7-4eba-8a99-08821957df6c',
  baixo:   'aa524d9d-b23c-4d36-addf-f15656abe10f',
  violao:  '2868d09a-aec5-42b7-ad0b-e58019b65714',
};

// ---------- helpers ----------
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function leadNum(s){const m=String(s).trim().match(/^0*(\d+)\s*[–\-]/);return m?parseInt(m[1],10):null;}
function aulaNum(s){const t=String(s).trim().replace(/^\s*\d+[\.\)]\s*/,'');return leadNum(t);}
function pdfNum(base){const m=base.match(/^0*(\d+)\s*[–\-]/);if(m)return parseInt(m[1],10);const m2=base.match(/\b(\d{1,3})\b/);return m2?parseInt(m2[1],10):null;}
function pdfHasLead(base){return /^0*\d+\s*[–\-]/.test(base);}
function nameKey(s){ // parte do NOME (tira número, "harpa cristã", tags [..], versão)
  return norm(String(s)
    .replace(/\.pdf$/i,'')
    .replace(/\[[^\]]*\]/g,'')
    .replace(/harpa\s*crist[aã]/ig,'')
    .replace(/^[\s\d.\-–]+/,'')
    .replace(/\b(ritmos?|melodias?|dedilhados?|acordes?|ded)\b/ig,'')
    .replace(/\b\d{1,2}h\d{2}\b.*$/i,'')           // tira "12h43, 1 de Novembro/24"
  );}
function sim(a,b){ // jaccard de palavras
  const A=new Set(nameKey(a).split(' ').filter(Boolean));
  const B=new Set(nameKey(b).split(' ').filter(Boolean));
  if(!A.size||!B.size) return 0;
  let inter=0; for(const w of A) if(B.has(w)) inter++;
  return inter/(A.size+B.size-inter);
}
function fmtTam(bytes){ if(bytes>=1048576) return (bytes/1048576).toFixed(1)+' MB'; return Math.max(1,Math.round(bytes/1024))+' KB'; }
function urlDe(relDir, file){ return BASE + PUBROOT + '/' + relDir.split('/').filter(Boolean).map(encodeURIComponent).join('/') + '/' + encodeURIComponent(file); }

async function api(method, p, body){
  const r = await fetch(API+p, {method, headers:{'x-api-key':KEY,'content-type':'application/json'}, body: body?JSON.stringify(body):undefined});
  const t = await r.text(); let j; try{j=JSON.parse(t);}catch{j={raw:t};}
  if(!r.ok) throw new Error(method+' '+p+' -> '+r.status+' '+t.slice(0,200));
  return j;
}
function unwrap(j){ let d=j; while(d&&typeof d==='object'&&'dados'in d) d=d.dados; return d; }

// lista PDFs de uma subpasta (recursivo), retorna [{file, rel(dir relativo a ROOT), full, size}]
function listPdfs(sub){
  const out=[]; const start=path.join(ROOT, sub);
  (function walk(dir){
    let ents=[]; try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
    for(const e of ents){ const fp=path.join(dir,e.name);
      if(e.isDirectory()) walk(fp);
      else if(e.name.toLowerCase().endsWith('.pdf')){ const rel=path.relative(ROOT,dir); out.push({file:e.name, rel, full:fp, size:fs.statSync(fp).size}); }
    }
  })(start);
  return out;
}

let POSTS=0, SKIP_EXIST=0;
async function anexar(aulaId, file, rel, size, dryList){
  const url=urlDe(rel,file);
  if(DRY){ dryList && dryList.push({aulaId,url}); return; }
  const r=await api('POST','/academy/aula/anexo',{aula_id:aulaId, nome:NOME_ANEXO, url, tamanho:fmtTam(size)});
  POSTS++;
}

// ======================= PARTE 1: COMUNIDADES HARPA =======================
async function parte1(){
  const pdfs=listPdfs('PDF');                 // 211 Harpa (subpasta PDF/)
  if(!pdfs.length){ console.log('!! Nenhum PDF em', path.join(ROOT,'PDF'),'- confira a cópia/rclone.'); return; }
  const byNum={};
  let semNum=[];
  for(const p of pdfs){ const n=pdfNum(p.file); if(n==null){semNum.push(p.file);continue;} p.num=n; p.lead=pdfHasLead(p.file); (byNum[n]=byNum[n]||[]).push(p); }
  // dedupe por número quando há cópia "lead" + "não-lead" com MESMO nome-chave (ex. 47 Rocha Eterna / ROCHA ETERNA 47)
  for(const n of Object.keys(byNum)){
    const arr=byNum[n];
    if(arr.length>1){
      // se existem lead e não-lead muito parecidos, mantém só os lead
      const leads=arr.filter(x=>x.lead);
      if(leads.length && leads.length<arr.length){
        const kept=arr.filter(x=> x.lead || !leads.some(L=>sim(L.file,x.file)>0.5));
        byNum[n]=kept;
      }
    }
  }
  console.log(`PARTE 1 — PDFs Harpa: ${pdfs.length} | números: ${Object.keys(byNum).length} | sem número: ${semNum.length}` + (semNum.length?` (${semNum.join('; ')})`:''));

  const resumo={};
  for(const [proj,cid] of Object.entries(COM)){
    const d=unwrap(await api('GET','/academy/curso/'+cid));
    const aulas=d.aulas||[];
    // alvos: aulas com número de hino
    const alvos=[]; for(const a of aulas){ const n=aulaNum(a.nome); if(n!=null) alvos.push({id:a.id, num:n, nome:a.nome}); }
    // agrupa alvos por número
    const alvosPorNum={}; for(const t of alvos){ (alvosPorNum[t.num]=alvosPorNum[t.num]||[]).push(t); }
    let anexados=0, aulasSemPdf=[], dry=[];
    const numsPdfUsados=new Set();
    for(const [numStr, tgts] of Object.entries(alvosPorNum)){
      const num=parseInt(numStr,10); const cand=byNum[num];
      if(!cand||!cand.length){ for(const t of tgts) aulasSemPdf.push(num); continue; }
      numsPdfUsados.add(num);
      for(const t of tgts){
        // escolhe o PDF: se 1 candidato usa ele; se vários, o de nome mais parecido
        let pick=cand[0];
        if(cand.length>1){ let best=-1; for(const c of cand){ const s=sim(c.file,t.nome); if(s>best){best=s;pick=c;} } }
        await anexar(t.id, pick.file, pick.rel, pick.size, dry);
        anexados++;
      }
    }
    // números de PDF que não têm aula neste curso
    const pdfSemAula=Object.keys(byNum).map(Number).filter(n=>!numsPdfUsados.has(n));
    resumo[proj]={aulas:aulas.length, alvos:alvos.length, anexados, pdfSemAulaCount:pdfSemAula.length, pdfSemAula:pdfSemAula.sort((a,b)=>a-b), hinosSemPdf:[...new Set(aulasSemPdf)].sort((a,b)=>a-b)};
    console.log(`  ${proj}: aulas=${aulas.length} alvos(com nº)=${alvos.length} -> anexados=${anexados}${DRY?' (DRYRUN)':''} | PDF sem aula aqui: ${pdfSemAula.length} ${pdfSemAula.length?'('+resumo[proj].pdfSemAula.join(',')+')':''} | hino sem PDF: ${resumo[proj].hinosSemPdf.length} ${resumo[proj].hinosSemPdf.length?'('+resumo[proj].hinosSemPdf.join(',')+')':''}`);
  }
  console.log('PARTE 1 '+(DRY?'DRYRUN':'GRAVADO')+` | POSTs feitos: ${POSTS}`);
  return resumo;
}

(async()=>{
  if(!KEY){ console.log('!! ENGINE_API_KEY vazio no ambiente — rode dentro do container engine.'); process.exit(1); }
  console.log('=== setar_cifras PARTE='+PARTE+' DRYRUN='+(DRY?'1':'0')+' BASE='+BASE+' ===');
  if(PARTE==='1'||PARTE==='all') await parte1();
  // PARTE 2 entra depois (Teclado Gospel + apostilas)
  console.log('=== FIM ===');
})().catch(e=>{ console.error('ERRO:', e&&e.message||e); process.exit(1); });
