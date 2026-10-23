#!/usr/bin/env bash
# ============================================================================
# [+obs] setup-obs.sh — liga o servidor RTMP (nginx-rtmp) do "Ao vivo pelo OBS".
# ADITIVO + IDEMPOTENTE (pode rodar de novo sem medo):
#   - NAO edita docker-compose.yml, NAO edita Caddyfile, NAO toca no engine/banco.
#   - Sobe um container standalone 'motor-rtmp' na MESMA rede do motor + abre a 1935.
# Se algo der errado aqui, o motor (engine/evolution/caddy/db) continua intacto.
# ============================================================================
set -e
cd /opt/motor

echo "==> [1/5] Lendo o token do webhook (ENGINE_API_KEY do .env) ..."
TOK=$(grep -oP '(?<=ENGINE_API_KEY=).*' .env | tr -d '\r' | head -n1)
if [ -z "$TOK" ]; then echo "!! Nao achei ENGINE_API_KEY no /opt/motor/.env — abortando (nada foi mexido)."; exit 1; fi
echo "   ok (token lido; nao vou exibir)."

echo "==> [2/5] Gravando /opt/motor/rtmp/nginx.conf ..."
mkdir -p /opt/motor/rtmp
cat > /opt/motor/rtmp/nginx.conf <<NGINX
worker_processes auto;
events { worker_connections 1024; }
rtmp {
  server {
    listen 1935;
    chunk_size 4096;
    application live {
      live on;
      record off;
      on_publish      http://engine:8080/obs/on_publish?token=${TOK};
      on_publish_done http://engine:8080/obs/on_publish_done?token=${TOK};
      hls on;
      hls_path /tmp/hls;
      hls_fragment 2s;
      hls_playlist_length 12s;
    }
  }
}
http {
  server {
    listen 8081;
    location /hls {
      types { application/vnd.apple.mpegurl m3u8; video/mp2t ts; }
      root /tmp;
      add_header Cache-Control no-cache;
      add_header Access-Control-Allow-Origin *;
    }
    location /health { return 200 "ok"; }
  }
}
NGINX
echo "   ok."

echo "==> [3/5] Descobrindo a rede docker do motor (pelo container do engine) ..."
ENGINE=$(docker ps --format '{{.Names}}' | grep -E 'engine' | head -n1)
if [ -z "$ENGINE" ]; then echo "!! Nao achei o container do engine rodando — abortando."; exit 1; fi
NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$ENGINE" | awk '{print $1}')
if [ -z "$NET" ]; then echo "!! Nao achei a rede do $ENGINE — abortando."; exit 1; fi
echo "   engine=$ENGINE  rede=$NET"

echo "==> [4/5] Subindo o container motor-rtmp (standalone, restart unless-stopped) ..."
docker rm -f motor-rtmp 2>/dev/null || true
docker run -d --name motor-rtmp --restart unless-stopped \
  --network "$NET" --network-alias rtmp \
  -p 1935:1935 \
  -v /opt/motor/rtmp/nginx.conf:/etc/nginx/nginx.conf:ro \
  tiangolo/nginx-rtmp:latest
echo "   container no ar."

echo "==> [5/5] Abrindo a porta 1935 no firewall (ufw) ..."
if command -v ufw >/dev/null 2>&1; then ufw allow 1935/tcp || true; else echo "   (ufw nao encontrado — abra 1935/tcp no painel da Hostinger)"; fi

echo
echo "==================== OBS RTMP PRONTO ===================="
echo "Container:"
docker ps --filter name=motor-rtmp --format "  {{.Names}}  {{.Status}}  {{.Ports}}"
echo "Host escutando na 1935:"
ss -tlnp 2>/dev/null | grep 1935 || echo "  (ss nao mostrou — confira o docker ps acima)"
echo
echo "Agora no OBS -> Transmissao -> Personalizado:"
echo "  Servidor: rtmp://live.melodiaseriffs.com.br/live"
echo "  Chave:    mr-h-f9c5f83205   (sinal HORIZONTAL)"
echo "========================================================="
