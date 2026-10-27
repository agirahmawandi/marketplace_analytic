@echo off
title Marketplace Analytic Server (Port 3001)
echo ===================================================
echo   Menjalankan Marketplace Analytic Dashboard...
echo   Buka browser di: http://localhost:3001
echo ===================================================
start http://localhost:3001
npm run dev
pause
