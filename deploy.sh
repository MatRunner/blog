#!/bin/bash
git pull
# 本地构建
echo "Building..."
npm run docs:build
echo "delete old files..."
rm -rf /var/www/blog/*
echo "move dist files..."
cp -r docs/.vitepress/dist/* /var/www/blog/
echo "Deploy complete!"
