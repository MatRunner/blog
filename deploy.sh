#!/bin/bash
git pull
# 本地构建
echo "Building..."
npm run docs:build

cp -r docs/.vitepress/dist/ /var/www/blog/

echo "Deploy complete!"