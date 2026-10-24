#!/bin/bash
# 金铲铲 · 单机版 —— macOS 启动器
cd "$(dirname "$0")" || exit 1

if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" "index.html"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -a "Microsoft Edge" "index.html"
else
  open "index.html"
fi
