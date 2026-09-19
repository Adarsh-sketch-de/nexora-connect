# Groq transcription

Connect now sends meeting audio chunks from the Node/Express server to Groq Speech-to-Text. The browser never receives the Groq API key.

Set these environment variables locally and on Railway:

```env
GROQ_API_KEY=your_secret_key
GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo
```

The old local Python/faster-whisper files are retained only as a fallback/reference and do not need to be started for Groq transcription.
