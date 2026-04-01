/**
 * 编辑工具函数
 * 参考 perler-beads 的 pixelEditingUtils.ts
 */

import { MardColor, isTransparent, TRANSPARENT_COLOR } from './mardColorUtils';

/**
 * 单像素上色
 * @param grid 当前像素网格
 * @param row 行索引
 * @param col 列索引
 * @param newColor 新颜色
 * @returns 新的像素网格
 */
export function paintPixel(
  grid: MardColor[][],
  row: number,
  col: number,
  newColor: MardColor
): MardColor[][] {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  // 边界检查
  if (row < 0 || row >= rows || col < 0 || col >= cols) {
    return grid;
  }

  // 深拷贝
  const newGrid = grid.map(r => [...r]);

  // 检查是否有变化
  const currentCell = newGrid[row][col];
  if (currentCell.id === newColor.id) {
    return grid; // 无变化
  }

  newGrid[row][col] = newColor;
  return newGrid;
}

/**
 * 颜色替换 - 将所有匹配的源颜色替换为目标颜色
 * @param grid 当前像素网格
 * @param sourceColor 源颜色
 * @param targetColor 目标颜色
 * @returns 新的像素网格和替换数量
 */
export function replaceColor(
  grid: MardColor[][],
  sourceColor: MardColor,
  targetColor: MardColor
): { newGrid: MardColor[][]; replaceCount: number } {
  // 如果源颜色和目标颜色相同，直接返回
  if (sourceColor.id === targetColor.id) {
    return { newGrid: grid, replaceCount: 0 };
  }

  let replaceCount = 0;
  const newGrid = grid.map(row =>
    row.map(cell => {
      // 跳过透明色
      if (isTransparent(cell)) return cell;
      // 跳过不匹配的颜色
      if (cell.id !== sourceColor.id) return cell;
      replaceCount++;
      return targetColor;
    })
  );

  return { newGrid, replaceCount };
}

/**
 * 重新计算颜色统计
 * @param grid 像素网格
 * @returns 颜色统计 Map（key 为颜色 id，value 包含颜色对象和数量）
 */
export function recalculateColorStats(
  grid: MardColor[][]
): Map<string, { color: MardColor; count: number }> {
  const stats = new Map<string, { color: MardColor; count: number }>();

  for (const row of grid) {
    for (const cell of row) {
      // 跳过透明色
      if (isTransparent(cell)) continue;

      const existing = stats.get(cell.id);
      if (existing) {
        existing.count++;
      } else {
        stats.set(cell.id, { color: cell, count: 1 });
      }
    }
  }

  return stats;
}

/**
 * 计算总豆数
 */
export function calculateTotalBeads(grid: MardColor[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (!isTransparent(cell)) count++;
    }
  }
  return count;
}

/**
 * 擦除单个像素（设为透明）
 */
export function erasePixel(
  grid: MardColor[][],
  row: number,
  col: number
): MardColor[][] {
  return paintPixel(grid, row, col, TRANSPARENT_COLOR);
}

/**
 * 批量上色 - 一次性修改多个格子
 */
export function paintPixels(
  grid: MardColor[][],
  positions: { row: number; col: number }[],
  color: MardColor
): MardColor[][] {
  const newGrid = grid.map(r => [...r]);
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  for (const { row, col } of positions) {
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      newGrid[row][col] = color;
    }
  }

  return newGrid;
}

/**
 * 获取网格边界（包含非透明像素的最小矩形）
 */
export function getGridBounds(
  grid: MardColor[][]
): { minRow: number; minCol: number; maxRow: number; maxCol: number } | null {
  let minRow = grid.length;
  let minCol = grid[0]?.length || 0;
  let maxRow = 0;
  let maxCol = 0;
  let hasAny = false;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (!isTransparent(grid[row][col])) {
        hasAny = true;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
    }
  }

  if (!hasAny) return null;

  return { minRow, minCol, maxRow, maxCol };
}
