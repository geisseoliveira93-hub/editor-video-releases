// setar_capas_modulos.js
// Dá a cada MÓDULO a sua capa própria (como era na Cademí). Hoje todos os cards de
// módulo mostram a capa do CURSO porque academy_modulos.capa está vazio.
const Database = require('better-sqlite3');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DB_PATH    = '/data/engine.db';
const CAPAS_DIR  = '/data/media/academy/capas';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://motor.melodiaseriffs.com.br').replace(/\/+$/, '');
const FONTE      = process.env.FONTE || '/tmp/capas-modulos-cademi.json';
const FORCE      = process.env.FORCE === '1';
const HIRES      = String(process.env.HIRES || '1080').replace(/\D/g,'') || '1080';
function hiUrl(u){ try{ return String(u).replace(/([?&]w=)\d+/i, '$1'+HIRES); }catch(e){ return u; } }

function norm(s){
  return String(s||'')
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase()
    .replace(/\bmelodias e riffs\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ').trim();
}

function baixa(url){
  return new Promise((resolve,reject)=>{
    let tentativas = 0;
    function go(u){
      const lib = u.startsWith('https') ? https : http;
      const req = lib.get(u, {headers:{'User-Agent':'Mozilla/5.0','Accept':'image/*'}}, (r)=>{
        if (r.statusCode>=300 && r.statusCode<400 && r.headers.location && tentativas<4){
          tentativas++; r.resume(); return go(new URL(r.headers.location, u).toString());
        }
        if (r.statusCode!==200){ r.resume(); return reject(new Error('HTTP '+r.statusCode)); }
        const ct = String(r.headers['content-type']||'');
        let ext = 'jpg';
        if (/png/.test(ct)) ext='png'; else if (/webp/.test(ct)) ext='webp'; else if (/jpe?g/.test(ct)) ext='jpg'; else if (/gif/.test(ct)) ext='gif';
        const chunks=[];
        r.on('data',c=>chunks.push(c));
        r.on('end',()=>resolve({buf:Buffer.concat(chunks), ext}));
      });
      req.on('error',reject);
      req.setTimeout(20000,()=>{ req.destroy(new Error('timeout')); });
    }
    try{ go(url); }catch(e){ reject(e); }
  });
}

(async ()=>{
  if (!fs.existsSync(FONTE)) { console.error('!! JSON nao encontrado:', FONTE); process.exit(1); }
  fs.mkdirSync(CAPAS_DIR, {recursive:true});
  const fonte = JSON.parse(fs.readFileSync(FONTE,'utf8'));
  const db = new Database(DB_PATH);

  const cursos = db.prepare('SELECT id, nome FROM academy_cursos').all();
  const cursosNorm = cursos.map(c=>({id:c.id, nome:c.nome, n:norm(c.nome)}));
  const modsDe = (cid)=> db.prepare('SELECT id, nome, ordem, capa FROM academy_modulos WHERE curso_id=? ORDER BY ordem').all(cid);
  const setCapa = db.prepare('UPDATE academy_modulos SET capa=? WHERE id=?');

  let totCursosOk=0, totCursosFalha=0, totModSet=0, totBaixadas=0, totFallback=0;
  const relatorio = [];

  for (const cc of (fonte.cursos||[])){
    const cnome = cc.nome || '';
    const cn = norm(cnome);
    const capsMods = (cc.modulos||[]).filter(m=>m.url);
    if (!capsMods.length) continue;

    let cands = cursosNorm.filter(x=>x.n===cn);
    if (!cands.length) cands = cursosNorm.filter(x=> x.n && (x.n.includes(cn) || cn.includes(x.n)) && Math.min(x.n.length,cn.length) >= 6);

    let escolhido=null, overlapInfo='';
    if (cands.length===1){
      escolhido = cands[0];
      overlapInfo = 'match unico por nome';
    } else if (cands.length>1){
      const capNorms = new Set(capsMods.map(m=>norm(m.nome)).filter(Boolean));
      let best=null, bestScore=-1, second=-1;
      for (const cand of cands){
        const meus = new Set(modsDe(cand.id).map(m=>norm(m.nome)).filter(Boolean));
        let s=0; capNorms.forEach(n=>{ if (meus.has(n)) s++; });
        if (s>bestScore){ second=bestScore; bestScore=s; best=cand; }
        else if (s>second){ second=s; }
      }
      if (best && bestScore>=1 && bestScore>second){ escolhido=best; overlapInfo='desempate por modulos ('+bestScore+' em comum)'; }
      else { relatorio.push('AMBIGUO (pulado): "'+cnome+'" -> '+cands.length+' candidatos, sem desempate claro'); totCursosFalha++; continue; }
    } else {
      relatorio.push('SEM PAR (pulado): "'+cnome+'" (produto cademi '+cc.produto+')');
      totCursosFalha++; continue;
    }

    const meus = modsDe(escolhido.id);
    const usados = new Set();
    let setNesteCurso=0, baixOk=0, fb=0;
    for (const cm of capsMods){
      const alvo = meus.find(mm=> !usados.has(mm.id) && norm(mm.nome)===norm(cm.nome));
      if (alvo) cm._alvo = alvo.id, usados.add(alvo.id);
    }
    for (const cm of capsMods){
      if (cm._alvo) continue;
      const porOrdem = meus.find(mm=> !usados.has(mm.id) && mm.ordem===cm.ordem);
      if (porOrdem) cm._alvo = porOrdem.id, usados.add(porOrdem.id);
    }

    for (const cm of capsMods){
      if (!cm._alvo) continue;
      let capaUrl = null;
      try{
        const dest = path.join(CAPAS_DIR, cm._alvo);
        const existente = ['jpg','png','webp','gif'].map(e=>dest+'.'+e).find(f=>fs.existsSync(f) && fs.statSync(f).size>0);
        if (existente && !FORCE){
          capaUrl = PUBLIC_BASE + '/media/academy/capas/' + path.basename(existente);
        } else {
          let r; try { r = await baixa(hiUrl(cm.url)); } catch(e){ r = await baixa(cm.url); }
          const {buf,ext} = r;
          const file = dest+'.'+ext;
          fs.writeFileSync(file, buf);
          capaUrl = PUBLIC_BASE + '/media/academy/capas/' + path.basename(file);
          baixOk++; totBaixadas++;
        }
      }catch(e){
        capaUrl = cm.url;
        fb++; totFallback++;
      }
      setCapa.run(capaUrl, cm._alvo);
      setNesteCurso++; totModSet++;
    }

    totCursosOk++;
    relatorio.push('OK  "'+escolhido.nome+'"  ['+overlapInfo+']  -> capas em '+setNesteCurso+'/'+capsMods.length+' modulos (baixadas '+baixOk+', fallback '+fb+')');
  }

  db.close();
  console.log('\n===== RELATORIO CAPAS DE MODULO =====');
  relatorio.forEach(l=>console.log(l));
  console.log('-------------------------------------');
  console.log('cursos casados:', totCursosOk, '| cursos sem par/ambiguos:', totCursosFalha);
  console.log('modulos com capa setada:', totModSet, '| imagens baixadas:', totBaixadas, '| fallback URL cademi:', totFallback);
  console.log('imagens salvas em:', CAPAS_DIR, '| servidas em:', PUBLIC_BASE+'/media/academy/capas/');
  console.log('FIM.');
})().catch(e=>{ console.error('ERRO:', e); process.exit(1); });
