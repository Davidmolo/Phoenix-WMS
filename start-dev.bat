@echo off
set ROOT=D:\phoenix-wms
set MONGOD="C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"

if not exist "%ROOT%\data\mongo" mkdir "%ROOT%\data\mongo"
if not exist "%ROOT%\data\mongo-log" mkdir "%ROOT%\data\mongo-log"

echo Starting MongoDB (wait ~15s on first boot)...
start "phoenix-mongo" /MIN %MONGOD% --dbpath "%ROOT%\data\mongo" --port 27017 --bind_ip 127.0.0.1 --logpath "%ROOT%\data\mongo-log\mongod.log" --logappend

timeout /t 15 /nobreak >nul

echo Starting API...
start "phoenix-api" cmd /k "cd /d %ROOT%\backend && npm run seed && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Web...
start "phoenix-web" cmd /k "cd /d %ROOT%\frontend && npm run dev"

echo.
echo Open http://localhost:3000
echo Login: admin@phoenixcrossdock.com / ChangeMe123!
echo.
echo Tip: to start Mongo as Windows service (admin PowerShell):
echo   Start-Service MongoDB
echo.
pause
