#!/usr/bin/env bash
# ============================================================================
# [+seguranca-camada2] DEPLOY SEGURO do motor (Melodias e Riffs)
# Wrapper ADITIVO: NÃO altera o deploy-motor-v2.sh. Antes de buildar ele:
#   1) SNAPSHOT: copia engine.db + config.json pro host (/opt/motor/data-backups), mantém os 30 últimos.
#   2) TRAVA DE VERSÃO: só segue se o engine/src/index.ts novo tiver os marcadores de proteção
#      (salvarConfigPermanente, _configRuntimeCarregar, sincronizarFluxosEntregaBoot, seedFluxoDedilhados,
#       vigiaProducao). Se faltar algum -> ABORTA (parece versão antiga/incompleta; não sobrescreve o bom).
#   3) Chama o deploy normal (deploy-motor-v2.sh).
# Uso na VPS:  cd /opt/motor && curl -fsSL "<RAW motor-index.ts>?v=$(date +%s)" -o engine/src/index.ts && bash deploy-seguro.sh
# ============================================================================
set -e
cd /opt/motor

TS=$(date +%Y%m%d-%H%M%S)
BK=/opt/motor/data-backups
mkdir -p "$BK"

echo "==> [1/3] Snapshot do /data (engine.db + config.json) em $BK ..."
if docker compose cp engine:/data/config.json "$BK/$TS-config.json" 2>/dev/null; then echo "   config.json salvo."; else echo "   (config.json ainda não existe — ok)"; fi
if docker compose cp engine:/data/engine.db "$BK/$TS-engine.db" 2>/dev/null; then echo "   engine.db salvo."; else echo "   (engine.db ainda não existe — ok)"; fi
# retenção: mantém os 30 snapshots mais novos de cada tipo
ls -1t "$BK"/*-engine.db  2>/dev/null | tail -n +31 | xargs -r rm -f
ls -1t "$BK"/*-config.json 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "   snapshots guardados: $(ls -1 "$BK"/*-engine.db 2>/dev/null | wc -l) (banco)"

echo "==> [2/3] Trava de versão: conferindo marcadores de proteção no index.ts novo ..."
NEED="salvarConfigPermanente _configRuntimeCarregar sincronizarFluxosEntregaBoot seedFluxoDedilhados vigiaProducao"
FALTA=""
for m in $NEED; do grep -q "$m" engine/src/index.ts || FALTA="$FALTA $m"; done
if [ -n "$FALTA" ]; then
  echo "!! =========================================================="
  echo "!! DEPLOY CANCELADO — o index.ts novo NÃO tem os marcadores:$FALTA"
  echo "!! Parece uma versão ANTIGA/incompleta. NÃO vou sobrescrever o motor bom."
  echo "!! (O engine atual continua rodando normalmente.)"
  echo "!! =========================================================="
  exit 1
fi
echo "   ok — todos os marcadores de proteção presentes."

echo "==> [3/4] Rodando o deploy normal (deploy-motor-v2.sh) ..."
bash deploy-motor-v2.sh

echo "==> [4/4] [camada4] Agendando backup OFF-SITE diario (OneDrive) se ainda nao houver ..."
if [ -f /opt/motor/backup-offsite.sh ]; then
  if crontab -l 2>/dev/null | grep -q "backup-offsite.sh"; then
    echo "   backup off-site ja estava agendado."
  else
    ( crontab -l 2>/dev/null; echo "30 3 * * * cd /opt/motor && bash backup-offsite.sh >> /opt/motor/data-backups/offsite.log 2>&1" ) | crontab -
    echo "   backup off-site agendado (03:30 todo dia)."
  fi
else
  echo "   (backup-offsite.sh nao esta em /opt/motor ainda — baixe-o junto no comando de deploy; vou pular por ora.)"
fi

echo
echo "==================== DEPLOY SEGURO CONCLUÍDO ===================="
echo "Snapshot desta vez: $BK/$TS-engine.db  +  $BK/$TS-config.json"
echo "Saúde de produção:  curl -s http://localhost:8080/saude/producao -H \"x-api-key: \$(grep -oP '(?<=ENGINE_API_KEY=).*' .env)\""
echo "================================================================"
