#!/bin/bash
# ╔══════════════════════════════════════════╗
# ║     SHENCOM CRM - Distribuidor Claro     ║
# ╚══════════════════════════════════════════╝

export PATH="/Users/Usuario/.local/node/bin:$PATH"
cd /Users/Usuario/shencom-crm

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         SHENCOM CRM - Claro Ecuador      ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Iniciando servidores...                 ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Matar procesos anteriores si existen
pkill -f "node server/index.js" 2>/dev/null
pkill -f "vite --port 5173" 2>/dev/null
sleep 1

# Iniciar servidor API en background
node server/index.js &
API_PID=$!
sleep 2

# Iniciar frontend en background
cd client
./node_modules/.bin/vite --port 5173 &
VITE_PID=$!
sleep 3

echo ""
echo "  ✅ CRM iniciado correctamente!"
echo ""
echo "  🌐 Abre tu navegador en: http://localhost:5173"
echo ""
echo "  👤 Usuario: admin"
echo "  🔑 Contraseña: shencom2026"
echo ""
echo "  ⚠️  NO CIERRES esta ventana mientras uses el CRM"
echo "  Para detener el CRM, presiona Ctrl+C"
echo ""

# Abrir navegador automáticamente
open http://localhost:5173

# Esperar a que el usuario presione Ctrl+C
trap "echo ''; echo '  🛑 Deteniendo SHENCOM CRM...'; kill $API_PID $VITE_PID 2>/dev/null; echo '  ✅ CRM detenido. Puedes cerrar esta ventana.'; exit 0" INT TERM

wait
