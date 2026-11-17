@echo off
echo ===================================================
echo  IELTS 8 AI (iPhone 13 Pro) - Haqiqiy Xcode .IPA Quruvchi
echo ===================================================
echo.
git init 2>nul
git add .
git commit -m "Build IELTS 8 AI iOS .ipa for iPhone 13 Pro"
echo.
echo GitHub repository manzilini kiriting (masalan: https://github.com/USERNAME/ielts8-ai.git):
set /p REPO_URL=URL: 
git branch -M main
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git push -u origin main
echo.
echo Tayyor! GitHub -> Actions -> "Build iOS .ipa for iPhone 13 Pro" ga kirib
echo 3 daqiqadan keyin tayyor compiled .ipa faylni yuklab oling!
pause
