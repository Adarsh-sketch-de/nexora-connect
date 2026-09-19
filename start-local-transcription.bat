@echo off
setlocal
cd /d "%~dp0"
echo.
echo ================================================
echo   Connect - Free Local Transcription (Whisper)
echo ================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Install Python 3.11 or 3.12 and try again.
    pause
    exit /b 1
  )
  set "PY=python"
)
if not exist ".venv-transcribe\Scripts\python.exe" (
  echo First-time setup: creating a private Python environment...
  %PY% -m venv .venv-transcribe
  if errorlevel 1 goto :fail
  echo Installing local transcription packages. This is required only once...
  ".venv-transcribe\Scripts\python.exe" -m pip install --upgrade pip
  ".venv-transcribe\Scripts\python.exe" -m pip install -r local-transcription-requirements.txt
  if errorlevel 1 goto :fail
)
echo.
echo Starting free local transcription at http://127.0.0.1:8765
echo On the first run, the Whisper model will download automatically.
echo Keep this window open while using Connect transcription.
echo.
".venv-transcribe\Scripts\python.exe" -m uvicorn local_transcriber:app --host 127.0.0.1 --port 8765
exit /b %errorlevel%
:fail
echo.
echo Setup failed. Copy the error shown above and send it to ChatGPT.
pause
exit /b 1
