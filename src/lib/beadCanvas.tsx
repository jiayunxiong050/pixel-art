/**
 * 核心画布组件
 * 纯 Canvas + HTML5 实现，处理渲染、缩放、平移、编辑事件
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { MardColor, Brand, isTransparent, TRANSPARENT_COLOR } from './mardColorUtils';
import {
  drawGrid,
  drawGridLines,
  clearCanvas,
  getCellFromPosition,
  drawCheckerboardCell,
} from './gridRenderer';
import { floodFill } from './floodFill';

export type Tool = 'select' | 'pencil' | 'eraser' | 'eraser-detail' | 'fill' | 'eyedropper';

interface BeadCanvasProps {
  // 网格数据
  grid: MardColor[][];
  gridW: number;
  gridH: number;

  // 位置偏移（格子坐标）
  offsetX: number;
  offsetY: number;
  onOffsetChange?: (x: number, y: number) => void;

  // 视图设置
  cellSize?: number;
  canvasBgColor?: string;

  // 品牌和显示
  brand: Brand;
  showLabels: boolean;
  showGridLines: boolean;
  majorGridInterval?: number;

  // 编辑状态
  currentTool: Tool;
  currentColor: MardColor | null;
  onCellClick?: (row: number, col: number, color: MardColor) => void;
  onGridChange?: (newGrid: MardColor[][]) => void;
  onColorPick?: (color: MardColor) => void;
  onFileDrop?: (file: File) => void;
}

interface ViewState {
  scale: number;
  panX: number;
  panY: number;
}

const DEFAULT_CELL_SIZE = 20;
const DEFAULT_MAJOR_INTERVAL = 10;

export const BeadCanvas: React.FC<BeadCanvasProps> = ({
  grid,
  gridW,
  gridH,
  offsetX,
  offsetY,
  onOffsetChange,
  cellSize = DEFAULT_CELL_SIZE,
  canvasBgColor = '#FDF8F3',
  brand,
  showLabels,
  showGridLines,
  majorGridInterval = DEFAULT_MAJOR_INTERVAL,
  currentTool,
  currentColor,
  onCellClick,
  onGridChange,
  onColorPick,
  onFileDrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 视图状态
  const [view, setView] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 绘制状态（用于拖拽时实时预览）
  const [isDrawing, setIsDrawing] = useState(false);
  const lastCellRef = useRef<{ row: number; col: number } | null>(null);

  // refs 存储最新值（避免闭包问题）
  const gridRef = useRef(grid);
  const toolRef = useRef(currentTool);
  const colorRef = useRef(currentColor);

  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { toolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { colorRef.current = currentColor; }, [currentColor]);

  // 计算画布尺寸
  const canvasWidth = gridW * cellSize;
  const canvasHeight = gridH * cellSize;

  // 渲染画布
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    clearCanvas(ctx, canvasWidth, canvasHeight, canvasBgColor);

    // 绘制透明区域棋盘格背景
    for (let row = 0; row < gridH; row++) {
      for (let col = 0; col < gridW; col++) {
        const x = col * cellSize;
        const y = row * cellSize;
        drawCheckerboardCell(ctx, x, y, cellSize);
      }
    }

    // 绘制网格
    drawGrid(ctx, grid, cellSize, 0, 0, showLabels, brand);

    // 绘制网格线
    if (showGridLines) {
      drawGridLines(ctx, gridW, gridH, cellSize, 0, 0, majorGridInterval);
    }
  }, [grid, gridW, gridH, cellSize, canvasWidth, canvasHeight, canvasBgColor, brand, showLabels, showGridLines, majorGridInterval]);

  useEffect(() => {
    render();
  }, [render]);

  // 居中画布
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cw = gridW * cellSize;
    const ch = gridH * cellSize;
    const panX = (rect.width - cw) / 2;
    const panY = (rect.height - ch) / 2;
    setView({ scale: 1, panX, panY });
  }, [gridW, gridH, cellSize]);

  // 获取格子坐标
  const getCellFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return getCellFromPosition(
      clientX,
      clientY,
      cellSize,
      view.scale,
      rect.left,
      rect.top
    );
  }, [cellSize, view.scale]);

  // 执行格子交互
  const performCellAction = useCallback((row: number, col: number) => {
    if (row < 0 || row >= gridH || col < 0 || col >= gridW) return;

    const g = gridRef.current;
    const cellColor = g[row]?.[col];
    if (!cellColor) return;

    const tool = toolRef.current;
    const color = colorRef.current;

    switch (tool) {
      case 'eyedropper':
        if (!isTransparent(cellColor) && onColorPick) {
          onColorPick(cellColor);
        }
        break;

      case 'eraser':
        if (!isTransparent(cellColor) && onGridChange) {
          const newGrid = floodFill(g, row, col, TRANSPARENT_COLOR);
          onGridChange(newGrid);
        }
        break;

      case 'eraser-detail':
        if (!isTransparent(cellColor) && onGridChange) {
          const newGrid = g.map((r, ri) =>
            ri === row ? r.map((c, ci) => ci === col ? TRANSPARENT_COLOR : c) : r
          );
          onGridChange(newGrid);
        }
        break;

      case 'fill':
        if (color && onGridChange) {
          const newGrid = floodFill(g, row, col, color);
          onGridChange(newGrid);
        }
        break;

      case 'pencil':
        if (color && onGridChange) {
          const newGrid = g.map((r, ri) =>
            ri === row ? r.map((c, ci) => ci === col ? color : c) : r
          );
          onGridChange(newGrid);
        }
        break;
    }

    if (onCellClick) {
      onCellClick(row, col, cellColor);
    }
  }, [gridW, gridH, onGridChange, onCellClick, onColorPick]);

  // 鼠标/触摸事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const cell = getCellFromEvent(e);
    if (!cell) return;

    // 右键或选择工具 = 拖拽画布
    if (e.button === 2 || currentTool === 'select') {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
      return;
    }

    // 编辑工具
    setIsDrawing(true);
    performCellAction(cell.row, cell.col);
    lastCellRef.current = cell;
  }, [getCellFromEvent, currentTool, view, performCellAction]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setView(v => ({
        ...v,
        panX: dragStartRef.current.panX + deltaX,
        panY: dragStartRef.current.panY + deltaY,
      }));
      return;
    }

    if (isDrawing && currentTool !== 'select' && currentTool !== 'eyedropper') {
      const cell = getCellFromEvent(e);
      if (cell && (!lastCellRef.current || cell.row !== lastCellRef.current.row || cell.col !== lastCellRef.current.col)) {
        performCellAction(cell.row, cell.col);
        lastCellRef.current = cell;
      }
    }
  }, [isDragging, isDrawing, currentTool, getCellFromEvent, performCellAction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsDrawing(false);
    lastCellRef.current = null;
  }, []);

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, view.scale * delta));

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newPanX = mouseX - (mouseX - view.panX) * (newScale / view.scale);
      const newPanY = mouseY - (mouseY - view.panY) * (newScale / view.scale);
      setView({ scale: newScale, panX: newPanX, panY: newPanY });
    }
  }, [view]);

  // 触摸事件
  const lastTouchDistanceRef = useRef<number | null>(null);

  const getTouchDistance = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return null;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getCellFromTouch = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return null;
    const touch = e.touches[0];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const canvasX = (touch.clientX - rect.left - view.panX) / view.scale;
    const canvasY = (touch.clientY - rect.top - view.panY) / view.scale;
    const col = Math.floor(canvasX / cellSize);
    const row = Math.floor(canvasY / cellSize);
    if (row >= 0 && row < gridH && col >= 0 && col < gridW) {
      return { row, col };
    }
    return null;
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 双指缩放
      lastTouchDistanceRef.current = getTouchDistance(e);
      setIsDragging(false);
      setIsDrawing(false);
    } else if (e.touches.length === 1) {
      const tool = toolRef.current;
      if (tool === 'pencil' || tool === 'fill' || tool === 'eraser' || tool === 'eraser-detail') {
        // 编辑工具：直接在触摸位置执行
        const cell = getCellFromTouch(e);
        if (cell) {
          setIsDrawing(true);
          performCellAction(cell.row, cell.col);
          lastCellRef.current = cell;
        }
      } else {
        // 其他工具：拖拽画布
        const touch = e.touches[0];
        setIsDragging(true);
        dragStartRef.current = { x: touch.clientX, y: touch.clientY, panX: view.panX, panY: view.panY };
      }
    }
  }, [view, performCellAction]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      // 双指缩放
      const distance = getTouchDistance(e);
      if (distance !== null && lastTouchDistanceRef.current !== null) {
        const scale = distance / lastTouchDistanceRef.current;
        const newScale = Math.max(0.1, Math.min(5, view.scale * scale));

        // 以两指中心点为缩放中心
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const canvasX = centerX - rect.left;
          const canvasY = centerY - rect.top;
          const newPanX = canvasX - (canvasX - view.panX) * (newScale / view.scale);
          const newPanY = canvasY - (canvasY - view.panY) * (newScale / view.scale);
          setView({ scale: newScale, panX: newPanX, panY: newPanY });
        }

        lastTouchDistanceRef.current = distance;
      }
    } else if (e.touches.length === 1) {
      const tool = toolRef.current;
      if (isDrawing && (tool === 'pencil' || tool === 'eraser' || tool === 'eraser-detail' || tool === 'fill')) {
        // 编辑工具：触摸移动时连续绘制
        const cell = getCellFromTouch(e);
        if (cell && (!lastCellRef.current || cell.row !== lastCellRef.current.row || cell.col !== lastCellRef.current.col)) {
          performCellAction(cell.row, cell.col);
          lastCellRef.current = cell;
        }
      } else if (isDragging) {
        // 拖拽画布
        const touch = e.touches[0];
        const deltaX = touch.clientX - dragStartRef.current.x;
        const deltaY = touch.clientY - dragStartRef.current.y;
        setView(v => ({
          ...v,
          panX: dragStartRef.current.panX + deltaX,
          panY: dragStartRef.current.panY + deltaY,
        }));
      }
    }
  }, [isDragging, isDrawing, view, performCellAction]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastTouchDistanceRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
      setIsDrawing(false);
      lastCellRef.current = null;
    }
  }, []);

  // 鼠标样式
  const getCursor = () => {
    switch (currentTool) {
      case 'eyedropper': return 'crosshair';
      case 'pencil':
      case 'eraser':
      case 'eraser-detail':
      case 'fill': return 'cell';
      default: return isDragging ? 'grabbing' : 'grab';
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#FDF8F3]"
      style={{ touchAction: 'none' }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && onFileDrop) {
          onFileDrop(file);
        }
      }}
    >
      <div
        className="relative inline-block"
        style={{
          transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            cursor: getCursor(),
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
};

export default BeadCanvas;
