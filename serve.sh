#!/usr/bin/env sh
set -eu
echo "Driftworks static server"
echo "Game:  http://localhost:8000/"
echo "Tests: http://localhost:8000/tests/"
python -m http.server 8000
