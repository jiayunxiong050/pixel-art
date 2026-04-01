/**
 * 洪水填充算法 - 基于栈实现的非递归版本
 * 参考 perler-beads 的实现
 */

import { MardColor, isTransparent, TRANSPARENT_COLOR } from './mardColorUtils';

/**
 * 洪水填充 - 将连通区域填充为新颜色
 * @param grid 当前像素网格
 * @param startRow 起始行
 * @param startCol 起始列
 * @param newColor 新颜色
 * @returns 新的像素网格（不修改原数组）
 */
export function floodFill(
  grid: MardColor[][],
  startRow: number,
  startCol: number,
  newColor: MardColor
): MardColor[][] {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  // 边界检查
  if (startRow < 0 || startRow >= rows || startCol < 0 || startCol >= cols) {
    return grid;
  }

  const targetColor = grid[startRow][startCol];
  if (!targetColor) return grid;

  // 如果目标颜色和新颜色相同，直接返回
  if (targetColor.id === newColor.id) return grid;

  // 深拷贝网格
  const newGrid = grid.map(row => [...row]);
  const visited: boolean[][] = Array(rows).fill(null).map(() => Array(cols).fill(false));

  // 使用栈实现非递归洪水填充
  const stack: { row: number; col: number }[] = [{ row: startRow, col: startCol }];

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;

    // 检查边界
    if (row < 0 || row >= rows || col < 0 || col >= cols || visited[row][col]) {
      continue;
    }

    const currentCell = newGrid[row][col];
    if (!currentCell) continue;

    // 检查是否是目标颜色（透明色需要特殊处理）
    const isTargetTransparent = isTransparent(targetColor);
    const isCurrentTransparent = isTransparent(currentCell);

    // 如果目标颜色是透明
    if (isTargetTransparent) {
      // 当前格子也必须是透明才能填充
      if (!isCurrentTransparent) continue;
    } else {
      // 目标颜色不是透明，当前格子必须颜色相同且不是透明
      if (isCurrentTransparent || currentCell.id !== targetColor.id) continue;
    }

    // 标记为已访问
    visited[row][col] = true;

    // 填充当前像素
    newGrid[row][col] = newColor;

    // 添加相邻像素到栈中（上下左右）
    stack.push(
      { row: row - 1, col }, // 上
      { row: row + 1, col }, // 下
      { row, col: col - 1 }, // 左
      { row, col: col + 1 }  // 右
    );
  }

  return newGrid;
}

/**
 * 洪水填充擦除 - 将连通区域设为透明
 */
export function floodFillErase(
  grid: MardColor[][],
  startRow: number,
  startCol: number
): MardColor[][] {
  return floodFill(grid, startRow, startCol, TRANSPARENT_COLOR);
}

/**
 * 获取连通区域 - 返回所有属于同一颜色的连通格子
 */
export function getConnectedRegion(
  grid: MardColor[][],
  startRow: number,
  startCol: number
): { row: number; col: number }[] {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  if (startRow < 0 || startRow >= rows || startCol < 0 || startCol >= cols) {
    return [];
  }

  const targetColor = grid[startRow][startCol];
  if (!targetColor || isTransparent(targetColor)) {
    return [];
  }

  const visited: boolean[][] = Array(rows).fill(null).map(() => Array(cols).fill(false));
  const region: { row: number; col: number }[] = [];
  const stack: { row: number; col: number }[] = [{ row: startRow, col: startCol }];

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;

    if (row < 0 || row >= rows || col < 0 || col >= cols || visited[row][col]) {
      continue;
    }

    const currentCell = grid[row][col];
    if (!currentCell || isTransparent(currentCell) || currentCell.id !== targetColor.id) {
      continue;
    }

    visited[row][col] = true;
    region.push({ row, col });

    stack.push(
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 }
    );
  }

  return region;
}
