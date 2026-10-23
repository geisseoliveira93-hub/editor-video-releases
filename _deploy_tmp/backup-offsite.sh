#!/usr/bin/env bash
# [+seguranca-camada4] Backup OFF-SITE diario do banco do motor pro OneDrive (fora da VPS).
# Roda em /opt/motor. Usa o rclone de dentro do container engine (mesmo config das midias).
set -e
cd /opt/motor
TS=$(date +%Y%m%d-%H%M)
DEST="onedrive:Postagem Automatica/Motor-backups"
docker compose exec -T engine sh -lc "rclone copyto /data/engine.db '$DEST/engine-$TS.db'" && echo "engine.db -> OneDrive ok ($TS)"
docker compose exec -T engine sh -lc "[ -f /data/config.json ] && rclone copyto /data/config.json '$DEST/config-$TS.json'" && echo "config.json -> OneDrive ok" || true
# retencao: apaga backups com mais de 30 dias na pasta
docker compose exec -T engine sh -lc "rclone delete --min-age 30d '$DEST'" 2>/dev/null || true
echo "[backup-offsite] concluido $TS"
