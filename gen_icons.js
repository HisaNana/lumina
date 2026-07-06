#!/usr/bin/env node
// 生成简单的 AI Lookup 图标（蓝色圆形 + 白色 "AI" 文字）
// 运行: node gen_icons.js

const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // 背景圆
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // 文字
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 0.38)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AI', size / 2, size / 2 + size * 0.03);

  return canvas.toBuffer('image/png');
}

for (const size of [16, 48, 128]) {
  fs.writeFileSync(`icon${size}.png`, generateIcon(size));
  console.log(`icon${size}.png generated`);
}
