#!/bin/sh

# IBM Watson Speech to Text API
export SPEECH_TO_TEXT_API_USERNAME=""
export SPEECH_TO_TEXT_API_PASSWORD=""

# IBM Watson Translation API 
export TRANSLATION_API_USERNAME=""
export TRANSLATION_API_PASSWORD=""

# IBM Watson Text to Speech API
export TEXT_TO_SPEECH_API_USERNAME=""
export TEXT_TO_SPEECH_API_PASSWORD=""

## FFMPEG
export FFMPEG="ffmpeg"
export FFPROBE="ffprobe"

# Look for 'nodejs' (debian/ubuntu) or 'node' (default) binary
if hash nodejs 2>/dev/null; then
  nodejs server.js
elif hash node 2>/dev/null; then
  node server.js
else 
  echo "Unable to start: No node.js executable found"
fi
