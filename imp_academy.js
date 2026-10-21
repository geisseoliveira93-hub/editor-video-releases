// Importador Academy — roda DENTRO do container engine (tem ENGINE_API_KEY no env).
// Busca o JSON do GitHub raw e importa os cursos que ainda faltam (pula os já feitos).
const DONE = new Set(["539718","540457","596468","539715","539710","574090","337551","340514","532825","289493","289494","337426","285176","285177","548647","337589","644853","581829","342137"]);
const KEY = process.env.ENGINE_API_KEY;
const PORT = process.env.PORT || 8080;
const RAW = "https://raw.githubusercontent.com/geisseoliveira93-hub/editor-video-releases/main/academy_migracao.json";
(async () => {
  const data = await fetch(RAW).then(r => r.json());
  let ok = 0, fail = 0, skip = 0;
  for (const c of data) {
    const [vit, nome, origem, mods] = c;
    if (DONE.has(origem)) { skip++; continue; }
    const modulos = mods.map(([mnome, aulas]) => ({
      nome: mnome,
      aulas: aulas.map(([titulo, ref, fonte]) => ({
        nome: titulo,
        tipo: ref ? "video" : "material",
        video_fonte: fonte === 1 ? "vimeo" : "youtube",
        video_ref: ref,
        anexos: []
      }))
    }));
    const body = { vitrine_id: vit, nome, origem_cademi: origem, modulos };
    const nAulas = modulos.reduce((s, m) => s + m.aulas.length, 0);
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/academy/importar/conteudo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": KEY },
        body: JSON.stringify(body)
      });
      const j = await r.json().catch(() => ({}));
      const cid = (j && j.dados && j.dados.curso_id) || (j && j.curso_id) || "";
      console.log("OK", origem, r.status, nAulas + " aulas", cid);
      ok++;
    } catch (e) { console.log("ERR", origem, String(e).slice(0, 100)); fail++; }
  }
  console.log("==== FIM ok=" + ok + " fail=" + fail + " skip=" + skip + " ====");
})();
