/**
 * 拼豆编辑器 - 纯 Canvas + HTML5 架构
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Palette,
  Trash2,
  Wand2,
  Pipette,
  Eraser,
  Pencil,
  Droplets,
  Grid3X3,
  Undo2,
  X,
} from 'lucide-react';
import {
  pixelateImage,
  MardColor,
  Brand,
  isTransparent,
  getClosestMardColor,
  TRANSPARENT_COLOR,
  MARD_COLORS,
} from './lib/mardColorUtils';
import { removeBackground } from '@imgly/background-removal';
import BeadCanvas, { Tool } from './lib/beadCanvas';
import BeadPalette from './lib/beadPalette';
import { floodFill, floodFillErase } from './lib/floodFill';
import { recalculateColorStats, replaceColor } from './lib/editingUtils';

// === 常量 ===
const CELL_EXPORT_PX = 30;

export default function App() {
  // 画布设置
  const [canvasW, setCanvasW] = useState(50);
  const [canvasH, setCanvasH] = useState(50);
  const [pixelGrid, setPixelGrid] = useState(29);
  const [maxColors, setMaxColors] = useState(0); // 0 = 不限制
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // 品牌和显示
  const [brand, setBrand] = useState<Brand>('MARD');
  const [showLabels, setShowLabels] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [hasImage, setHasImage] = useState(false);

  // 移动端状态
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  const [showMobileColorPanel, setShowMobileColorPanel] = useState(false);

  // 网格数据
  const [grid, setGrid] = useState<MardColor[][]>([]);
  const [gridW, setGridW] = useState(0);
  const [gridH, setGridH] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // 撤销历史
  const [history, setHistory] = useState<MardColor[][][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canUndo = historyIndex > 0;

  // 原始图片数据（用于重新像素化）
  const originalDataUrlRef = useRef<string | null>(null);
  const hasTransparencyRef = useRef(false);

  // 编辑工具
  const [currentTool, setCurrentTool] = useState<Tool>('select');
  const [currentColor, setCurrentColor] = useState<MardColor | null>(null);

  // refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef(grid);

  useEffect(() => { gridRef.current = grid; }, [grid]);

  // 拖拽上传处理
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    // 触发 handleImageUpload
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      originalDataUrlRef.current = dataUrl;

      setLoading(true);
      setLoadingText('读取图片...');
      try {
        const pixelData = await pixelateImage(dataUrl, pixelGrid, false, true, maxColors || undefined);
        let newGrid: MardColor[][];
        if (pixelData.width >= canvasW && pixelData.height >= canvasH) {
          newGrid = pixelData.grid;
        } else {
          newGrid = Array.from({ length: canvasH }, () =>
            Array.from({ length: canvasW }, () => TRANSPARENT_COLOR)
          );
          const startX = Math.max(0, Math.floor((canvasW - pixelData.width) / 2));
          const startY = Math.max(0, Math.floor((canvasH - pixelData.height) / 2));
          for (let row = 0; row < pixelData.height; row++) {
            for (let col = 0; col < pixelData.width; col++) {
              if (startY + row < canvasH && startX + col < canvasW) {
                newGrid[startY + row][startX + col] = pixelData.grid[row][col];
              }
            }
          }
          setOffsetX(startX);
          setOffsetY(startY);
        }
        setGrid(newGrid);
        setGridW(newGrid[0]?.length || 0);
        setGridH(newGrid.length);
        setHasImage(true);
        hasTransparencyRef.current = false;
        setHistory([newGrid]);
        setHistoryIndex(0);
      } catch (err) {
        console.error(err);
        alert('图片处理失败');
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    };
    reader.readAsDataURL(file);
  }, [canvasW, canvasH, pixelGrid, maxColors]);

  // 保存到历史
  const saveToHistory = useCallback((newGrid: MardColor[][]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newGrid);
      // 限制历史记录数量
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // 撤销
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGrid(history[newIndex]);
    }
  }, [historyIndex, history]);

  // 颜色统计（排除zg色号）
  const colorStats = useMemo(() => {
    const stats = recalculateColorStats(grid);
    return Array.from(stats.entries())
      .filter(([, { color }]) => !color.id.startsWith('zg'))
      .map(([id, { color, count }]) => ({ color, count, index: 0 }))
      .sort((a, b) => b.count - a.count)
      .map((item, i) => ({ ...item, index: i + 1 }));
  }, [grid]);

  const totalBeads = useMemo(() => {
    let count = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (!isTransparent(cell)) count++;
      }
    }
    return count;
  }, [grid]);

  // 导入图片
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingText('读取图片...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      originalDataUrlRef.current = dataUrl;

      try {
        const pixelData = await pixelateImage(dataUrl, pixelGrid, false, true, maxColors || undefined);

        // 创建带透明边的网格（以画布大小）
        let newGrid: MardColor[][];
        if (pixelData.width >= canvasW && pixelData.height >= canvasH) {
          newGrid = pixelData.grid;
        } else {
          newGrid = Array.from({ length: canvasH }, () =>
            Array.from({ length: canvasW }, () => TRANSPARENT_COLOR)
          );
          const startX = Math.max(0, Math.floor((canvasW - pixelData.width) / 2));
          const startY = Math.max(0, Math.floor((canvasH - pixelData.height) / 2));
          for (let row = 0; row < pixelData.height; row++) {
            for (let col = 0; col < pixelData.width; col++) {
              if (startY + row < canvasH && startX + col < canvasW) {
                newGrid[startY + row][startX + col] = pixelData.grid[row][col];
              }
            }
          }
          setOffsetX(startX);
          setOffsetY(startY);
        }

        setGrid(newGrid);
        setGridW(newGrid[0]?.length || 0);
        setGridH(newGrid.length);
        setHasImage(true);
        hasTransparencyRef.current = false;
        // 初始化历史记录
        setHistory([newGrid]);
        setHistoryIndex(0);
      } catch (err) {
        console.error(err);
        alert('图片处理失败');
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 重新应用画布设置（重新像素化）
  const handleReapply = async () => {
    const dataUrl = originalDataUrlRef.current;
    if (!dataUrl) return;

    setLoading(true);
    setLoadingText('重新生成...');

    try {
      const pixelData = await pixelateImage(dataUrl, pixelGrid, false, true, maxColors || undefined);

      let newGrid: MardColor[][];
      if (pixelData.width >= canvasW && pixelData.height >= canvasH) {
        newGrid = pixelData.grid;
      } else {
        newGrid = Array.from({ length: canvasH }, () =>
          Array.from({ length: canvasW }, () => TRANSPARENT_COLOR)
        );
        const startX = Math.max(0, Math.floor((canvasW - pixelData.width) / 2));
        const startY = Math.max(0, Math.floor((canvasH - pixelData.height) / 2));
        for (let row = 0; row < pixelData.height; row++) {
          for (let col = 0; col < pixelData.width; col++) {
            if (startY + row < canvasH && startX + col < canvasW) {
              newGrid[startY + row][startX + col] = pixelData.grid[row][col];
            }
          }
        }
        setOffsetX(startX);
        setOffsetY(startY);
      }

      setGrid(newGrid);
      setGridW(newGrid[0]?.length || 0);
      setGridH(newGrid.length);
      saveToHistory(newGrid);
    } catch (err) {
      console.error(err);
      alert('重新生成失败');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // AI 去背
  const handleRemoveBackground = async () => {
    if (!originalDataUrlRef.current || grid.length === 0) {
      alert('请先上传图片');
      return;
    }

    setLoading(true);
    setLoadingText('AI 识别主体...');

    try {
      const result = await removeBackground(originalDataUrlRef.current, {
        progress: (key) => {
          if (key === 'compute:inference') setLoadingText('AI 识别中...');
        },
        output: { format: 'image/png', quality: 1 }
      });

      const blob = result;
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = async () => {
        const tmp = document.createElement('canvas');
        tmp.width = img.width;
        tmp.height = img.height;
        const ctx = tmp.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const dataUrl = tmp.toDataURL('image/png');

        try {
          const pixelData = await pixelateImage(dataUrl, gridW, true, true, maxColors || undefined);

          // 重新创建网格，保持画布大小
          const newGrid = Array.from({ length: canvasH }, () =>
            Array.from({ length: canvasW }, () => TRANSPARENT_COLOR)
          );
          for (let row = 0; row < pixelData.height; row++) {
            for (let col = 0; col < pixelData.width; col++) {
              if (row < canvasH && col < canvasW) {
                newGrid[row][col] = pixelData.grid[row][col];
              }
            }
          }

          setGrid(newGrid);
          setHasImage(true);
          hasTransparencyRef.current = true;
          // 保存到历史
          saveToHistory(newGrid);
        } catch (err) {
          console.error(err);
          alert('去背处理失败');
        }

        URL.revokeObjectURL(url);
        setLoading(false);
        setLoadingText('');
      };

      img.src = url;
    } catch (err) {
      console.error(err);
      alert('去背失败，请重试');
      setLoading(false);
      setLoadingText('');
    }
  };

  // 清空
  const clearAll = () => {
    setGrid([]);
    setGridW(0);
    setGridH(0);
    originalDataUrlRef.current = null;
    hasTransparencyRef.current = false;
  };

  // 取色
  const handleColorPick = useCallback((color: MardColor) => {
    setCurrentColor(color);
    setCurrentTool('pencil');
  }, []);

  // 网格变化
  const handleGridChange = useCallback((newGrid: MardColor[][]) => {
    saveToHistory(newGrid);
    setGrid(newGrid);
  }, [saveToHistory]);

  // 导出图纸
  const generateExportDataUrl = useCallback((): string | null => {
    if (grid.length === 0) return null;

    const CELL = 40;
    const PAD = 20;
    const GRID_W = canvasW * CELL;
    const GRID_H = canvasH * CELL;

    // 计算实际内容边界
    let minX = 0, minY = 0, maxX = canvasW - 1, maxY = canvasH - 1;
    let found = false;
    for (let gy = 0; gy < gridH && !found; gy++) {
      for (let gx = 0; gx < gridW && !found; gx++) {
        if (!isTransparent(grid[gy]?.[gx])) {
          minY = gy; minX = gx; found = true;
        }
      }
    }
    if (!found) return null;

    for (let gy = gridH - 1; gy >= 0; gy--) {
      for (let gx = gridW - 1; gx >= 0; gx--) {
        if (!isTransparent(grid[gy]?.[gx])) {
          maxY = gy; maxX = gx;
        }
      }
    }

    // 颜色统计
    const colorCounts = new Map<string, { color: MardColor; count: number }>();
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const color = grid[y]?.[x];
        if (!color || isTransparent(color)) continue;
        const existing = colorCounts.get(color.id);
        if (existing) existing.count++;
        else colorCounts.set(color.id, { color, count: 1 });
      }
    }
    const legendItems = Array.from(colorCounts.entries())
      .map(([id, { color, count }]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);
    const totalCount = legendItems.reduce((s, i) => s + i.count, 0);

    const LEGEND_COLS = Math.max(1, Math.floor(GRID_W / 120));
    const LEGEND_ITEM_H = 36;
    const LEGEND_ROWS = Math.ceil(legendItems.length / LEGEND_COLS);
    const LEGEND_AREA_H = 36 + LEGEND_ROWS * LEGEND_ITEM_H + 16;
    const W = GRID_W + PAD * 2;
    const H = GRID_H + PAD * 2 + LEGEND_AREA_H;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // 绘制棋盘格背景
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        const isLight = (x + y) % 2 === 0;
        ctx.fillStyle = isLight ? '#f5f5f5' : '#e0e0e0';
        ctx.fillRect(PAD + x * CELL, PAD + y * CELL, CELL, CELL);
      }
    }

    // 绘制格子
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const color = grid[y]?.[x];
        const px = PAD + x * CELL;
        const py = PAD + y * CELL;
        if (!color || isTransparent(color)) continue;

        ctx.fillStyle = color.hex;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px + 0.25, py + 0.25, CELL - 0.5, CELL - 0.5);
      }
    }

    // 绘制网格线
    for (let i = 0; i <= canvasW; i++) {
      ctx.strokeStyle = i % 10 === 0 ? '#999999' : '#e0e0e0';
      ctx.lineWidth = i % 10 === 0 ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD + i * CELL, PAD);
      ctx.lineTo(PAD + i * CELL, PAD + GRID_H);
      ctx.stroke();
    }
    for (let i = 0; i <= canvasH; i++) {
      ctx.strokeStyle = i % 10 === 0 ? '#999999' : '#e0e0e0';
      ctx.lineWidth = i % 10 === 0 ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD, PAD + i * CELL);
      ctx.lineTo(PAD + GRID_W, PAD + i * CELL);
      ctx.stroke();
    }

    // 绘制编号
    if (showLabels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          const color = grid[y]?.[x];
          if (!color || isTransparent(color)) continue;
          const bid = color.brandIds?.[brand] || color.id;
          const px = PAD + x * CELL + CELL / 2;
          const py = PAD + y * CELL + CELL / 2;
          const br = (color.rgb[0] * 299 + color.rgb[1] * 587 + color.rgb[2] * 114) / 1000;
          ctx.fillStyle = br > 128 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
          ctx.font = `bold ${Math.max(9, Math.min(12, CELL * 0.28))}px sans-serif`;
          ctx.fillText(bid, px, py);
        }
      }
    }

    // 图例
    const legendY = PAD + GRID_H + 16;
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${brand}  |  ${totalCount} beads  |  ${legendItems.length} colors`, PAD, legendY);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, legendY + 18);
    ctx.lineTo(PAD + GRID_W, legendY + 18);
    ctx.stroke();

    const itemStartY = legendY + 26;
    legendItems.forEach((item, idx) => {
      const col = idx % LEGEND_COLS;
      const row = Math.floor(idx / LEGEND_COLS);
      const ix = PAD + col * 120;
      const iy = itemStartY + row * LEGEND_ITEM_H;
      const bid = item.color.brandIds?.[brand] || item.color.id;
      ctx.fillStyle = item.color.hex;
      ctx.fillRect(ix, iy + 2, 24, 24);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(ix, iy + 2, 24, 24);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(bid, ix + 30, iy + 6);
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`x${item.count}`, ix + 116, iy + 6);
    });

    return canvas.toDataURL('image/png', 1.0);
  }, [grid, gridW, gridH, canvasW, canvasH, brand, showLabels]);

  const handleShowPreview = () => {
    if (grid.length === 0) return;
    const url = generateExportDataUrl();
    if (url) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<img src="${url}" />`);
      }
    }
  };

  const handleDownload = () => {
    if (grid.length === 0) return;
    const url = generateExportDataUrl();
    if (!url) return;
    const link = document.createElement('a');
    link.download = brand.toLowerCase() + '-pattern-' + Date.now() + '.png';
    link.href = url;
    link.click();
  };

  // === ToolButton 组件 ===
  function ToolButton({
    icon, label, onClick, active = false, disabled = false, danger = false, primary = false
  }: {
    icon: React.ReactNode; label: string; onClick: () => void;
    active?: boolean; disabled?: boolean; danger?: boolean; primary?: boolean;
  }) {
    if (primary) {
      // 主要 CTA 按钮 - 上传
      return (
        <button
          onClick={onClick}
          disabled={disabled}
          className="w-full flex flex-col items-center gap-2 py-3 rounded-xl bg-[#E8A87C] hover:bg-[#D4956A] transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-xl bg-[rgba(255,255,255,0.15)] flex items-center justify-center group-hover:bg-[rgba(255,255,255,0.22)] transition-colors">
            {icon}
          </div>
          <span className="text-[10px] font-bold text-white/90">{label}</span>
        </button>
      );
    }

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex flex-col items-center gap-1 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          active ? 'bg-[#E8A87C] text-white' :
          danger ? 'text-red-400 hover:bg-red-500/20' :
          'text-[#C4A090] hover:text-[#7A4830] hover:bg-[rgba(201,149,107,0.1)]'
        }`}>
          {icon}
        </div>
        <span className={`text-[10px] font-medium transition-colors ${
          active ? 'text-[#C97B4B]' : 'text-[#B09080]'
        }`}>{label}</span>
      </button>
    );
  }

  return (
    <div className="flex h-screen bg-[#FDF8F3] text-[#7A4830] font-sans overflow-hidden">
      {/* 左侧工具栏 - 桌面显示，移动端隐藏 */}
      <aside className="hidden md:flex w-20 bg-[#FBF1E8] border-r border-[#F5E4D8] flex flex-col items-center py-4 overflow-y-auto z-20">
        {/* Logo 区域 */}
        <div className="w-14 h-14 mb-6 flex items-center justify-center">
          <div className="w-10 h-10 bg-gradient-to-br from-[#E8A87C] to-[#C97B4B] rounded-2xl flex items-center justify-center shadow-md" style={{boxShadow: '0 4px 16px rgba(232,168,124,0.25)'}}>
            <Palette className="text-white w-5 h-5" />
          </div>
        </div>

        {/* 上传按钮 - CTA */}
        <div className="px-2 w-full mb-6">
          <ToolButton
            icon={<Upload size={22} className="text-white" />}
            label="上传"
            onClick={() => fileInputRef.current?.click()}
            primary
          />
        </div>

        <div className="flex-1 w-full px-2 flex flex-col gap-1 overflow-y-auto">
          {/* 文件操作组 */}
          <ToolButton
            icon={<Download size={18} className="text-[#7a6a58]" />}
            label="预览"
            onClick={handleShowPreview}
          />
          <ToolButton
            icon={<Download size={18} className="text-[#7a6a58]" />}
            label="导出"
            onClick={handleDownload}
          />
          <ToolButton
            icon={<Wand2 size={18} className="text-[#7a6a58]" />}
            label="AI去背"
            onClick={handleRemoveBackground}
            disabled={grid.length === 0}
          />

          {/* 分隔 */}
          <div className="h-4" />

          {/* 编辑工具组 */}
          <ToolButton
            icon={<Pipette size={18} className="text-[#7a6a58]" />}
            label="取色"
            onClick={() => setCurrentTool(t => t === 'eyedropper' ? 'select' : 'eyedropper')}
            active={currentTool === 'eyedropper'}
          />
          <ToolButton
            icon={<Droplets size={18} className="text-[#7a6a58]" />}
            label="填充"
            onClick={() => setCurrentTool(t => t === 'fill' ? 'select' : 'fill')}
            active={currentTool === 'fill'}
            disabled={!currentColor}
          />
          <ToolButton
            icon={<Eraser size={18} className="text-[#7a6a58]" />}
            label="区域"
            onClick={() => setCurrentTool(t => t === 'eraser' ? 'select' : 'eraser')}
            active={currentTool === 'eraser'}
          />
          <ToolButton
            icon={<Eraser size={16} className="text-[#7a6a58]" />}
            label="细节"
            onClick={() => setCurrentTool(t => t === 'eraser-detail' ? 'select' : 'eraser-detail')}
            active={currentTool === 'eraser-detail'}
          />
          <ToolButton
            icon={<Pencil size={18} className="text-[#7a6a58]" />}
            label="铅笔"
            onClick={() => setCurrentTool(t => t === 'pencil' ? 'select' : 'pencil')}
            active={currentTool === 'pencil'}
            disabled={!currentColor}
          />
          <ToolButton
            icon={<Undo2 size={18} className="text-[#7a6a58]" />}
            label="撤销"
            onClick={undo}
            disabled={!canUndo}
          />

          {/* 分隔 */}
          <div className="h-4" />

          {/* 显示控制 */}
          <ToolButton
            icon={<Grid3X3 size={18} className="text-[#7a6a58]" />}
            label={showLabels ? "隐藏编号" : "显示编号"}
            onClick={() => setShowLabels(v => !v)}
            active={showLabels}
          />
          <ToolButton
            icon={<Trash2 size={18} className="text-[#7a6a58]" />}
            label="清空"
            onClick={clearAll}
            danger
            disabled={grid.length === 0}
          />
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          className="hidden"
          accept="image/*"
        />
      </aside>

      {/* 主区域 */}
      <main className="flex-1 relative flex flex-col bg-[#FDF8F3]">
        {/* Header */}
        <header className="h-14 bg-[#FBF1E8] border-b border-[#F5E4D8] flex items-center justify-between px-5">
          {/* 左侧 - Logo 和 画布设置 */}
          <div className="flex items-center gap-6">
            <h1 className="text-sm font-bold tracking-wide text-[#B09080]">MARD Editor</h1>

            {/* 画布尺寸 */}
            <div className="flex items-center gap-1 bg-[rgba(201,149,107,0.08)] px-3 py-1.5 rounded-lg">
              <span className="text-[10px] text-[#C97B4B] mr-1">画布</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue={canvasW}
                onFocus={e => { e.target.value = String(canvasW); e.target.select(); }}
                onBlur={e => {
                  const val = parseInt(e.target.value) || canvasW;
                  setCanvasW(Math.max(5, Math.min(300, val)));
                  e.target.value = String(Math.max(5, Math.min(300, val)));
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="bg-[rgba(201,149,107,0.06)] w-14 text-xs font-mono text-[#7A4830] focus:outline-none text-center rounded px-1 border border-transparent focus:border-[rgba(201,149,107,0.4)] transition-colors"
              />
              <span className="text-[#C4A090] text-xs">×</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue={canvasH}
                onFocus={e => { e.target.value = String(canvasH); e.target.select(); }}
                onBlur={e => {
                  const val = parseInt(e.target.value) || canvasH;
                  setCanvasH(Math.max(5, Math.min(300, val)));
                  e.target.value = String(Math.max(5, Math.min(300, val)));
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="bg-[rgba(201,149,107,0.06)] w-14 text-xs font-mono text-[#7A4830] focus:outline-none text-center rounded px-1 border border-transparent focus:border-[rgba(201,149,107,0.4)] transition-colors"
              />
            </div>

            {/* 精度 */}
            <div className="flex items-center gap-1 bg-[rgba(201,149,107,0.08)] px-3 py-1.5 rounded-lg">
              <span className="text-[10px] text-[#C97B4B] mr-1">精度</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue={pixelGrid}
                onFocus={e => { e.target.value = String(pixelGrid); e.target.select(); }}
                onBlur={e => {
                  const val = parseInt(e.target.value) || pixelGrid;
                  setPixelGrid(Math.max(5, Math.min(300, val)));
                  e.target.value = String(Math.max(5, Math.min(300, val)));
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="bg-[rgba(201,149,107,0.06)] w-12 text-xs font-mono text-[#7A4830] focus:outline-none text-center rounded px-1 border border-transparent focus:border-[rgba(201,149,107,0.4)] transition-colors"
              />
              <span className="text-[10px] text-[#C4A090]">px</span>
            </div>

            {/* 最大颜色 */}
            <div className="flex items-center gap-1 bg-[rgba(201,149,107,0.08)] px-3 py-1.5 rounded-lg">
              <span className="text-[10px] text-[#C97B4B]">色数</span>
              <select
                value={maxColors}
                onChange={e => setMaxColors(Number(e.target.value))}
                className="bg-[rgba(201,149,107,0.06)] text-xs text-[#7A4830] px-1 py-0.5 rounded focus:outline-none cursor-pointer border-none"
              >
                <option value={0}>不限</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* 应用按钮 */}
            {hasImage && (
              <button
                onClick={handleReapply}
                className="px-4 py-1.5 bg-[#E8A87C] hover:bg-[#D4956A] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                应用
              </button>
            )}

            {/* 品牌 */}
            <select
              value={brand}
              onChange={e => setBrand(e.target.value as Brand)}
              className="bg-[rgba(201,149,107,0.08)] text-xs text-[#7A4830] px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer border-none"
            >
              {(["MARD", "COCO", "漫漫", "盼盼", "咪小窝"] as Brand[]).map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {/* 当前颜色 */}
            {currentColor && (
              <div className="flex items-center gap-2 bg-[rgba(201,149,107,0.08)] px-3 py-1.5 rounded-lg border border-[rgba(232,168,124,0.2)]">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: currentColor.hex }}
                />
                <span className="text-xs font-mono text-[#7A4830]">
                  {currentColor.brandIds?.[brand] || currentColor.id}
                </span>
              </div>
            )}
          </div>

          {/* 右侧 - 状态 */}
          <div className="flex items-center gap-4 text-xs text-[#C4A090]">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${showLabels ? 'bg-[#E8A87C]' : 'bg-[#D4C0B0]'}`} />
              <span>编号</span>
            </div>
            <span className="text-[#E4D4C4]">|</span>
            <span className="text-[#C4A090]">拖拽平移 · 滚轮缩放</span>
          </div>
        </header>

        {/* 画布区域 */}
        <div
          className="flex-1 relative bg-[#FDF8F3]"
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleDrop}
        >
          {grid.length > 0 ? (
            <BeadCanvas
              grid={grid}
              gridW={gridW}
              gridH={gridH}
              offsetX={offsetX}
              offsetY={offsetY}
              brand={brand}
              showLabels={showLabels}
              showGridLines={showGridLines}
              currentTool={currentTool}
              currentColor={currentColor}
              onGridChange={handleGridChange}
              onColorPick={handleColorPick}
              onFileDrop={(file: File) => {
                const reader = new FileReader();
                reader.onload = async (event) => {
                  const dataUrl = event.target?.result as string;
                  originalDataUrlRef.current = dataUrl;
                  setLoading(true);
                  setLoadingText('读取图片...');
                  try {
                    const pixelData = await pixelateImage(dataUrl, pixelGrid, false, true, maxColors || undefined);
                    let newGrid: MardColor[][];
                    if (pixelData.width >= canvasW && pixelData.height >= canvasH) {
                      newGrid = pixelData.grid;
                    } else {
                      newGrid = Array.from({ length: canvasH }, () =>
                        Array.from({ length: canvasW }, () => TRANSPARENT_COLOR)
                      );
                      const startX = Math.max(0, Math.floor((canvasW - pixelData.width) / 2));
                      const startY = Math.max(0, Math.floor((canvasH - pixelData.height) / 2));
                      for (let row = 0; row < pixelData.height; row++) {
                        for (let col = 0; col < pixelData.width; col++) {
                          if (startY + row < canvasH && startX + col < canvasW) {
                            newGrid[startY + row][startX + col] = pixelData.grid[row][col];
                          }
                        }
                      }
                      setOffsetX(startX);
                      setOffsetY(startY);
                    }
                    setGrid(newGrid);
                    setGridW(newGrid[0]?.length || 0);
                    setGridH(newGrid.length);
                    setHasImage(true);
                    hasTransparencyRef.current = false;
                    setHistory([newGrid]);
                    setHistoryIndex(0);
                  } catch (err) {
                    console.error(err);
                    alert('图片处理失败');
                  } finally {
                    setLoading(false);
                    setLoadingText('');
                  }
                };
                reader.readAsDataURL(file);
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={handleDrop}
            >
              <button
                className="text-center cursor-pointer p-8 rounded-2xl hover:bg-[rgba(201,149,107,0.06)] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-[rgba(201,149,107,0.06)] flex items-center justify-center border border-[rgba(201,149,107,0.12)] hover:bg-[rgba(201,149,107,0.1)] transition-colors">
                  <Upload size={32} className="text-[#C4A090]" />
                </div>
                <p className="text-[#B09080] text-lg mb-2">上传图片开始编辑</p>
                <p className="text-[#C4A090] text-sm">拖入或点击上传</p>
              </button>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 bg-[#FDF8F3]/70 backdrop-blur-sm flex flex-col items-center justify-center z-50">
              <div className="w-12 h-12 border-2 border-[#E8A87C] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-sm text-[#7A4830]">{loadingText || '处理中...'}</span>
            </div>
          )}
        </div>

        {/* Footer - 桌面显示，移动端隐藏 */}
        <footer className="hidden md:flex h-10 bg-[#FBF1E8] border-t border-[#F5E4D8] flex items-center px-5 justify-between">
          <div className="flex gap-6 text-[11px] text-[#C4A090]">
            <span>画布 {canvasW}×{canvasH}</span>
            {grid.length > 0 && <span>内容 {gridW}×{gridH}</span>}
            <span className="text-[#E4D4C4]">|</span>
            <span>{totalBeads} 豆</span>
            <span className="text-[#E4D4C4]">|</span>
            <span>{colorStats.length} 色</span>
          </div>
          <span className="text-[10px] text-[#D4C0B0]">v6 Canvas</span>
        </footer>
      </main>

      {/* 移动端底部工具条 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#FBF1E8] border-t border-[#F5E4D8] px-2 py-2 z-50">
        <div className="flex items-center justify-around">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={20} className="text-[#E8A87C]" />
            <span className="text-[10px] text-[#B09080]">上传</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={handleShowPreview}
            disabled={grid.length === 0}
          >
            <Download size={20} className={grid.length === 0 ? "text-[#D4C0B0]" : "text-[#7a6a58]"} />
            <span className="text-[10px] text-[#B09080]">预览</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => setCurrentTool(t => t === 'eyedropper' ? 'select' : 'eyedropper')}
          >
            <Pipette size={20} className={currentTool === 'eyedropper' ? "text-[#E8A87C]" : "text-[#7a6a58]"} />
            <span className="text-[10px] text-[#B09080]">取色</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => setCurrentTool(t => t === 'fill' ? 'select' : 'fill')}
            disabled={!currentColor}
          >
            <Droplets size={20} className={currentTool === 'fill' ? "text-[#E8A87C]" : "text-[#7a6a58]"} />
            <span className="text-[10px] text-[#B09080]">填充</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => setShowMobileColorPanel(v => !v)}
          >
            <Palette size={20} className={showMobileColorPanel ? "text-[#E8A87C]" : "text-[#7a6a58]"} />
            <span className="text-[10px] text-[#B09080]">选色</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={handleDownload}
            disabled={grid.length === 0}
          >
            <Download size={20} className={grid.length === 0 ? "text-[#D4C0B0]" : "text-[#7a6a58]"} />
            <span className="text-[10px] text-[#B09080]">导出</span>
          </button>
        </div>
      </div>

      {/* 移动端颜色面板 */}
      {showMobileColorPanel && (
        <div className="md:hidden fixed bottom-16 left-2 right-2 bg-[#FBF1E8] rounded-t-xl border border-[#F5E4D8] p-3 z-40 max-h-[50vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-[#B09080]">选择颜色</span>
            <button onClick={() => setShowMobileColorPanel(false)}>
              <X size={16} className="text-[#C4A090]" />
            </button>
          </div>
          <BeadPalette
            selectedColor={currentColor}
            onColorSelect={(c) => { handleColorPick(c); setShowMobileColorPanel(false); }}
            brand={brand}
          />
        </div>
      )}

      {/* 右侧面板 - 桌面显示，移动端隐藏 */}
      <aside className="hidden lg:flex w-64 bg-[#FBF1E8] border-l border-[#F5E4D8] flex flex-col overflow-hidden">
        {/* 调色板 */}
        <section className="flex-1 flex flex-col overflow-hidden border-b border-[#F5E4D8]">
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-xs font-medium text-[#B09080]">{brand}</span>
            <span className="text-[10px] text-[#C4A090]">{colorStats.length} 色</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <BeadPalette
              selectedColor={currentColor}
              onColorSelect={handleColorPick}
              brand={brand}
            />
          </div>
        </section>

        {/* 使用颜色 */}
        <section className="max-h-[280px] overflow-y-auto">
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-xs font-medium text-[#B09080]">使用颜色</span>
          </div>
          <div className="px-3 pb-3 space-y-1">
            {colorStats.length === 0 ? (
              <div className="text-center py-8 text-[#D4C0B0] text-xs">暂无数据</div>
            ) : (
              colorStats.slice(0, 20).map(item => (
                <div
                  key={item.color.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(201,149,107,0.08)] transition-colors cursor-pointer"
                  onClick={() => handleColorPick(item.color)}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-[8px] font-bold"
                    style={{
                      backgroundColor: item.color.hex,
                      color: (item.color.rgb[0] * 299 + item.color.rgb[1] * 587 + item.color.rgb[2] * 114) / 1000 > 128 ? '#000' : '#fff'
                    }}
                  >
                    {item.index}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[#C4A090] truncate">
                      {item.color.brandIds?.[brand] || item.color.id}
                    </div>
                  </div>
                  <div className="text-[10px] text-[#D4C0B0]">×{item.count}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
