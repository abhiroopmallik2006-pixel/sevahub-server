@echo off
echo Installing dependencies...
call npm install
echo.
echo Start SevaHub after configuring .env and importing database/schema.sql + database/seed.sql
echo.
call npm start
pause
