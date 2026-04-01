/**
 * 网格渲染工具
 * 负责绘制格子、透明色棋盘格、编号标签
 */

import { MardColor, Brand, isTransparent } from './mardColorUtils';

/**
 * 棋盘格图案配置
 */
const CHECKERBOARD_LIGHT = '#f5f5f5';
const CHECKERBOARD_DARK = '#e0e0e0';

/**
 * 计算文字颜色（根据背景亮度）
 */
export function getTextColor(color: MardColor): string {
  const brightness = (color.rgb[0] * 299 + color.rgb[1] * 587 + color.rgb[2] * 114) / 1000;
  return brightness > 128 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
}

/**
 * 绘制单个格子
 */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  color: MardColor,
  showLabel: boolean,
  brand: Brand
) {
  // 透明格子绘制为棋盘格
  if (isTransparent(color)) {
    drawCheckerboardCell(ctx, x, y, cellSize);
    return;
  }

  // 绘制格子背景
  ctx.fillStyle = color.hex;
  ctx.fillRect(x, y, cellSize, cellSize);

  // 绘制高光效果（拼豆边缘效果）
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y, cellSize, 2);
  ctx.fillRect(x, y, 2, cellSize);

  // 绘制阴影效果
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(x, y + cellSize - 2, cellSize, 2);
  ctx.fillRect(x + cellSize - 2, y, 2, cellSize);

  // 绘制编号标签
  if (showLabel) {
    const label = color.brandIds?.[brand] || color.id.replace('M', '');
    const fontSize = Math.floor(cellSize * 0.35);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getTextColor(color);
    ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
  }
}

/**
 * 绘制透明格子（棋盘格）
 */
export function drawCheckerboardCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number
) {
  const halfSize = cellSize / 2;

  // 左上角
  ctx.fillStyle = CHECKERBOARD_LIGHT;
  ctx.fillRect(x, y, halfSize, halfSize);

  // 右下角
  ctx.fillRect(x + halfSize, y + halfSize, halfSize, halfSize);

  // 右上角
  ctx.fillStyle = CHECKERBOARD_DARK;
  ctx.fillRect(x + halfSize, y, halfSize, halfSize);

  // 左下角
  ctx.fillRect(x, y + halfSize, halfSize, halfSize);
}

/**
 * 绘制整个网格
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: MardColor[][],
  cellSize: number,
  offsetX: number,
  offsetY: number,
  showLabels: boolean,
  brand: Brand
) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = offsetX + col * cellSize;
      const y = offsetY + row * cellSize;
      drawCell(ctx, x, y, cellSize, grid[row][col], showLabels, brand);
    }
  }
}

/**
 * 绘制网格线
 */
export function drawGridLines(
  ctx: CanvasRenderingContext2D,
  gridW: number,
  gridH: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  majorInterval: number = 10
) {
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;

  // 绘制所有竖线
  for (let col = 0; col <= gridW; col++) {
    const x = offsetX + col * cellSize;
    ctx.strokeStyle = col % majorInterval === 0
      ? 'rgba(0,0,0,0.25)'
      : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = col % majorInterval === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x, offsetY + gridH * cellSize);
    ctx.stroke();
  }

  // 绘制所有横线
  for (let row = 0; row <= gridH; row++) {
    const y = offsetY + row * cellSize;
    ctx.strokeStyle = row % majorInterval === 0
      ? 'rgba(0,0,0,0.25)'
      : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = row % majorInterval === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + gridW * cellSize, y);
    ctx.stroke();
  }
}

/**
 * 获取鼠标位置对应的格子坐标
 */
export function getCellFromPosition(
  mouseX: number,
  mouseY: number,
  cellSize: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  gridW: number,
  gridH: number,
  canvasOffsetX: number = 0, // 画布在视口中的偏移
  canvasOffsetY: number = 0
): { row: number; col: number } | null {
  // 将鼠标位置转换为画布坐标
  const canvasX = (mouseX - canvasOffsetX) / scale;
  const canvasY = (mouseY - canvasOffsetY) / scale;

  // 转换为格子坐标
  const col = Math.floor((canvasX - offsetX) / cellSize);
  const row = Math.floor((canvasY - offsetY) / cellSize);

  // 边界检查
  if (row < 0 || row >= gridH || col < 0 || col >= gridW) {
    return null;
  }

  return { row, col };
}

/**
 * 清空画布
 */
export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundColor: string = '#1a1a1a'
) {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
}
