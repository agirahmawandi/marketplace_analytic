@echo off
title Chrome CDP (Port 9222) - Marketplace Analytic
echo ===============================================================
echo   Membuka Google Chrome Terhubung (CDP Port 9222)...
echo   Silakan LOGIN akun Shopee Anda di jendela Chrome yang muncul.
echo   Biarkan jendela Chrome tersebut tetap terbuka saat analisa!
echo ===============================================================
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="E:\Project\Marketplace-analytic\.chrome-cdp-profile" --no-first-run --no-default-browser-check https://shopee.co.id/buyer/login
