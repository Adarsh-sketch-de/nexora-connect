# Free Local Transcription for Connect

Connect can transcribe meetings on the Connect PC using faster-whisper. No OpenAI API key or API credits are required for transcription.

## First-time setup
1. Install Python 3.11 or 3.12 if Python is not already installed.
2. Double-click `start-local-transcription.bat`.
3. The first run creates `.venv-transcribe`, installs the required packages, and downloads the Whisper model. Keep the window open.
4. In a second terminal, start Connect normally with `npm start`.
5. Open a meeting and press **Start transcription**.

The Node/Connect server sends audio internally to `127.0.0.1:8765`, so phones and other participants do not need Python or Whisper installed.

## Model choice
Default: `base` (good balance for CPU use).
For better Hindi/Marathi accuracy, set `LOCAL_WHISPER_MODEL=small` in `.env`. The small model is larger and slower.

## Privacy
Audio sent to this transcription module stays on the PC running Connect. It is not sent to the OpenAI transcription API.
