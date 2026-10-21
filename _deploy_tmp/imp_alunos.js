// Importador de ALUNOS — roda DENTRO do container engine (usa ENGINE_API_KEY do env).
// Busca students_import.json do GitHub raw e importa em lotes via /academy/importar/alunos2.
const KEY = process.env.ENGINE_API_KEY;
const PORT = process.env.PORT || 8080;
const RAW = "https://raw.githubusercontent.com/geisseoliveira93-hub/editor-video-releases/main/_deploy_tmp/students_import.json";
(async () => {
  const all = await fetch(RAW + "?cb=" + Date.now()).then(r => r.json());
  console.log("total linhas:", all.length);
  let N = 0, U = 0, A = 0, T = 0;
  for (let i = 0; i < all.length; i += 400) {
    const batch = all.slice(i, i + 400);
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/academy/importar/alunos2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": KEY },
        body: JSON.stringify({ linhas: batch })
      });
      const j = await r.json().catch(() => ({}));
      const d = (j && j.dados && j.dados.dados) || (j && j.dados) || j || {};
      console.log("lote", i, "->", r.status, "novos", d.novos, "atualizados", d.atualizados, "acessos", d.acessos, "tags", d.tags);
      N += d.novos || 0; U += d.atualizados || 0; A += d.acessos || 0; T += d.tags || 0;
    } catch (e) { console.log("lote", i, "ERRO", String(e).slice(0, 100)); }
  }
  console.log("==== FIM novos=" + N + " atualizados=" + U + " acessos=" + A + " tags=" + T + " ====");
})();
