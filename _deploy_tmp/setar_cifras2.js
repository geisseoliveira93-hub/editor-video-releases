// setar_cifras2.js — PARTE 2: Curso e Mentoria de Teclado Gospel (materiais + cifras de repertório/prática).
// RODA no container engine: node /tmp/setar_cifras2.js  | Env: ENGINE_API_KEY, DRYRUN=1, PUBLIC_BASE_URL
// Idempotente (/academy/aula/anexo dedupa por url). Casa por COBERTURA do título + desempate por artista.
'use strict';
const fs=require('fs'), path=require('path');
const API='http://127.0.0.1:8080', KEY=process.env.ENGINE_API_KEY||'', DRY=process.env.DRYRUN==='1';
const BASE=(process.env.PUBLIC_BASE_URL||'https://motor.melodiaseriffs.com.br').replace(/\/+$/,'');
const ROOT='/data/media/academy/cifras', PUBROOT='/media/academy/cifras';
const TG='5ea854ac-2870-4e01-a1b6-b7eb9f2bbd86', TGSUB='PDFS CURSOS/Curso e Mentoria de Teclado Gospel';

function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function songKey(s){return norm(String(s).replace(/\.pdf$/i,'').replace(/sem[_ ]licenciamento/ig,'').replace(/simplificado/ig,'').replace(/passo a passo/ig,'').replace(/\([^)]*\)/g,'').replace(/\[[^\]]*\]/g,'').replace(/[_\-|]/g,' ').replace(/^\s*\d+\s+/,''));}
function repTitle(nome){let s=String(nome).replace(/^\s*\d+\s*[-–]\s*/,'').replace(/\([^)]*\)/g,'');s=s.split(/\s[-–]\s/)[0];return norm(s);}
const STOP=new Set('com apenas acordes tres de da do das dos a o e em no na os as que um uma pra por hino cristo feat drops ina tutorial completo teclado abertura encadeamentos harpa crista pratica melodia melodias maiores maior missao sem licenciamento especial dia criancas catolico catolica catolicas musicas'.split(' '));
function toks(s){return new Set(String(s).split(' ').filter(w=>w.length>2&&!STOP.has(w)));}
function inter(A,B){let n=0;for(const w of A)if(B.has(w))n++;return n;}
function fmtTam(b){return b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';}
async function api(m,p,b){const r=await fetch(API+p,{method:m,headers:{'x-api-key':KEY,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});const t=await r.text();let j;try{j=JSON.parse(t);}catch{j={raw:t};}if(!r.ok)throw new Error(m+' '+p+' '+r.status+' '+t.slice(0,140));return j;}
function unwrap(j){let d=j;while(d&&typeof d==='object'&&'dados'in d)d=d.dados;return d;}
function listPdfs(sub){const out=[],st=path.join(ROOT,sub);(function w(dir){let e=[];try{e=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}for(const x of e){const fp=path.join(dir,x.name);if(x.isDirectory())w(fp);else if(x.name.toLowerCase().endsWith('.pdf'))out.push({file:x.name,rel:path.relative(ROOT,dir),full:fp,size:fs.statSync(fp).size});}})(st);return out;}
function urlDe(rel,file){return BASE+PUBROOT+'/'+rel.split('/').filter(Boolean).map(encodeURIComponent).join('/')+'/'+encodeURIComponent(file);}
let POSTS=0;
async function put(aulaId,p,nome){const url=urlDe(p.rel,p.file);if(DRY)return;await api('POST','/academy/aula/anexo',{aula_id:aulaId,nome,url,tamanho:fmtTam(p.size)});POSTS++;}

// escolhe melhor PDF p/ uma aula: cobertura do TÍTULO>=thr, desempate (overlap total, jaccard)
function pick(titleT,fullT,cand,thr){let best=null,bs=[-1,-1,-1];for(const c of cand){const pt=c.k;if(!titleT.size||!pt.size)continue;const cov=inter(titleT,pt)/titleT.size;const full=inter(fullT,pt);const uni=new Set([...fullT,...pt]).size;const jc=uni?full/uni:0;const sc=[cov,full,jc];if(cov>=thr&&(sc[0]>bs[0]||(sc[0]===bs[0]&&(sc[1]>bs[1]||(sc[1]===bs[1]&&sc[2]>bs[2]))))){bs=sc;best=c;}}return best;}

(async()=>{
  if(!KEY){console.log('!! ENGINE_API_KEY vazio');process.exit(1);}
  console.log('=== setar_cifras2 (PARTE 2) DRYRUN='+(DRY?'1':'0')+' ===');
  const d=unwrap(await api('GET','/academy/curso/'+TG));
  const mods=d.modulos||[],aulas=d.aulas||[],byOrdem={};for(const m of mods)byOrdem[m.ordem]=m;
  const aulasMod=o=>{const m=byOrdem[o];return m?aulas.filter(a=>a.modulo_id===m.id):[];};
  const all=listPdfs(TGSUB), marker='Curso e Mentoria de Teclado Gospel', grp={};
  for(const p of all){const i=p.rel.indexOf(marker);let tail=i>=0?p.rel.slice(i+marker.length):'';tail=tail.replace(/^[\\/]+/,'');(grp[tail]=grp[tail]||[]).push(p);}
  const byFile={};for(const p of all)byFile[p.file]=p;
  let anex=0; const flags=[], done=new Set();

  async function cifra(a,p){if(done.has(a.id+'|'+p.file))return;done.add(a.id+'|'+p.file);await put(a.id,p,'Baixar cifra');anex++;}
  async function matchGrupo(pdfs,ordens,thr,label){
    const cand=pdfs.map(p=>({p,k:toks(songKey(p.file))}));
    let ok=0;const miss=[];
    for(const o of ordens)for(const a of aulasMod(o)){
      const tt=toks(repTitle(a.nome)), ft=toks(songKey(a.nome));
      const altTitle=label==='rep'?tt:ft;               // repertório usa título; prática usa nome todo
      if(!altTitle.size){miss.push(a.nome);continue;}
      const best=pick(altTitle,ft,cand.map(c=>({file:c.p.file,k:c.k,p:c.p})),thr);
      if(best){await cifra(a,best.p);ok++;}else miss.push(a.nome);
    }
    console.log(`  [${label}] casados=${ok} | sem-match=${miss.length}`);
    return miss;
  }
  // forçados (casos que o algoritmo genérico não pega, conferidos à mão)
  async function forcar(ordem,aulaRegex,pdfFile){
    const p=byFile[pdfFile];if(!p){flags.push('  [forçar: pdf não achado] '+pdfFile);return;}
    const al=aulasMod(ordem).filter(a=>aulaRegex.test(a.nome));
    if(!al.length){flags.push('  [forçar: aula não achada] '+aulaRegex+' mod'+ordem);return;}
    for(const a of al){await cifra(a,p);}
  }
  async function material(p,ordem,nome){const al=aulasMod(ordem);if(!al.length){flags.push('  [mod vazio] '+ordem);return;}for(const a of al){await put(a.id,p,nome);anex++;}}

  for(const [tail,pdfs] of Object.entries(grp)){
    if(tail===''){for(const p of pdfs){const m=p.file.match(/Material_Modulo_(\d+)/i);if(m)await material(p,+m[1],'Material do módulo (PDF)');else flags.push('  [raiz?] '+p.file);}}
    else if(/^Material_Modulo_(\d+)$/i.test(tail)){const o=+tail.match(/(\d+)/)[1];if(pdfs.length===1)await material(pdfs[0],o,'Material do módulo (PDF)');else await matchGrupo(pdfs,[o],0.6,'mod'+o);}
    else if(/Material_Modulo_3_e_4/i.test(tail)){await matchGrupo(pdfs,[3,4],0.6,'mod34');}
    else if(/Material_Modulo_7/i.test(tail)){await matchGrupo(pdfs,[7],0.6,'mod7');}
    else if(/PDFs_10_Hinos/i.test(tail)){flags.push(`  [PULADO p/ revisão] ${pdfs.length} PDFs em "${tail}" (hinos Harpa numerados — destino ambíguo)`);}
    else if(/Repertorio Gospel/i.test(tail)){await matchGrupo(pdfs,[24],0.6,'rep');}
    else if(/Miss(ã|a)o Teclado/i.test(tail)){
      // casa por NÚMERO da música (1..10)
      const idxOf={'Thalles_Roberto_-_Deus_Me_Ama_sem_licenciamento.pdf':1,'Me_ama_sem_licenciamento.pdf':2,'Bondade_de_Deus_Isaias_Saad_sem_licenciamento.pdf':3,'Gabriela_Rocha_-_Diz_You_Say_sem_licenciamento.pdf':4,'Marquinhos_Gomes_-_Ele_Nao_Desiste_de_Voce_sem_licenciamento.pdf':7,'MORADA_-_So_Tu_Es_Santo_sem_licenciamento.pdf':8,'Laura_Souguellis_-_Em_Teus_Bracos_sem_licenciamento.pdf':9,'Aline_Barros_-_Jeova_Jireh_.pdf':10};
      const pdfByIdx={};for(const p of pdfs){const i=idxOf[p.file];if(i)pdfByIdx[i]=p;else flags.push('  [missao pdf s/ índice] '+p.file);}
      let ok=0;for(const a of aulasMod(17)){const m=a.nome.replace(/^[^:]*:/,'').match(/^\s*(\d+)\s*[-–]/);if(!m)continue;const p=pdfByIdx[+m[1]];if(p){await cifra(a,p);ok++;}}
      console.log('  [missao] casados='+ok);
    }
    else if(/Dicion/i.test(tail)){for(const a of aulasMod(21)){await put(a.id,pdfs[0],'Dicionário de acordes (PDF)');anex++;}}
    else if(/Harpa crist/i.test(tail)){for(const a of aulasMod(19)){await put(a.id,pdfs[0],'Harpa Cristã completa (PDF)');anex++;}}
    else flags.push('  [grupo não tratado] "'+tail+'"');
  }
  // forçados conferidos à mão:
  await forcar(24,/^40 - JÓ/i,'41-jo-midian-lima_sem_licenciamento.pdf');
  await forcar(7,/Pra qu(ê|e)/i,'Pra_Que_sem_licenciamento.pdf');
  await forcar(7,/Cem velhas/i,'Cem_Ovelhas_sem_licenciamento.pdf');

  console.log(`\nPARTE 2 ${DRY?'(DRYRUN) ':''}anexos=${anex} | POSTs=${POSTS}`);
  if(flags.length){console.log('AVISOS ('+flags.length+'):');for(const f of flags)console.log(f);}
  console.log('=== FIM PARTE 2 ===');
})().catch(e=>{console.error('ERRO:',e&&e.message||e);process.exit(1);});
