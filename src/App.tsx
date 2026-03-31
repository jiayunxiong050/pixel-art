/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import {
  Upload,
  Download,
  Palette,
  Trash2,
  Layers,
  Move,
  RotateCcw,
  Info,
  Wand2,
  Pipette,
  Eraser,
  Pencil
} from 'lucide-react';
import { pixelateImage, gridToCanvas, MardColor, Brand, isTransparent, getClosestMardColor, TRANSPARENT_COLOR } from './lib/mardColorUtils';
import { removeBackground } from '@imgly/background-removal';

// === 常量 ===
const CELL_PX = 20;
const CELL_EXPORT_PX = 30;

// === 图层数据结构 ===
export interface BeadLayer {
  id: string;
  offsetX: number;
  offsetY: number;
  grid: MardColor[][];
  gridW: number;
  gridH: number;
  originalDataUrl: string;
  hasTransparency: boolean;
  fabricObj: fabric.Image | null;
}

export default function App() {
  const [canvasW, setCanvasW] = useState(50);
  const [canvasH, setCanvasH] = useState(50);
  const [pixelGrid, setPixelGrid] = useState(29);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [layers, setLayers] = useState<BeadLayer[]>([]);
  const [showLabels, setShowLabels] = useState(false);
  const [brand, setBrand] = useState<Brand>('MARD');
  const [shoppingList, setShoppingList] = useState<{ color: MardColor; count: number; index: number }[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const repixelatingRef = useRef(false);
  const prevPixelGridRef = useRef(29);
  const draggingRef = useRef(false);
  const modifyingLayerIdRef = useRef<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<'select' | 'eyedropper' | 'eraser' | 'pencil'>('select');
  const [currentDrawColor, setCurrentDrawColor] = useState<MardColor | null>(null);
  const isDrawingRef = useRef(false);
  // refs 供 Fabric 事件处理器读取最新值
  const toolRef = useRef(currentTool);
  const drawColorRef = useRef(currentDrawColor);
  const layersRef = useRef(layers);
  const selectedLayerIdRef = useRef(selectedLayerId);

  // 初始化 Fabric 画布
  useEffect(() => {
    if (initializedRef.current || !canvasRef.current) return;
    initializedRef.current = true;

    const fc = new fabric.Canvas(canvasRef.current, {
      width: canvasW * CELL_PX,
      height: canvasH * CELL_PX,
      backgroundColor: '#1a1a1a',
      selection: true,
    });
    fabricRef.current = fc;

    // 用 CSS 背景替代 2500 个 Fabric.Rect，大幅提升性能
    const container = fc.getElement().parentElement!;
    container.style.backgroundImage = [
      // 棋盘格半透明底
      'linear-gradient(45deg, #1e1e1e 25%, transparent 25%), linear-gradient(-45deg, #1e1e1e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e1e1e 75%), linear-gradient(-45deg, transparent 75%, #1e1e1e 75%)',
      // 小格边线（20px 格子）
      'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
      // 大格边线（200px 区域）
      'linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)',
    ].join(', ');
    container.style.backgroundSize = '40px 40px, 20px 20px, 20px 20px, 200px 200px, 200px 200px';
    container.style.backgroundPosition = '0 0, 0 0, 0 0, 0 0, 0 0';

    fc.on('selection:created', (e) => {
      const layerId = (e.selected?.[0] as any)?.layerId;
      if (layerId) setSelectedLayerId(layerId);
    });
    fc.on('selection:updated', (e) => {
      const layerId = (e.selected?.[0] as any)?.layerId;
      if (layerId) setSelectedLayerId(layerId);
    });
    fc.on('selection:cleared', () => setSelectedLayerId(null));

    fc.on('object:modified', (e) => {
      draggingRef.current = false;
      const obj = e.target as any;
      if (!obj?.layerId) { modifyingLayerIdRef.current = null; return; }
      const newX = Math.round((obj.left || 0) / CELL_PX);
      const newY = Math.round((obj.top || 0) / CELL_PX);
      setLayers(prev => prev.map(l => {
        if (l.id !== obj.layerId) return l;
        const cx = Math.max(0, Math.min(canvasW - l.gridW, newX));
        const cy = Math.max(0, Math.min(canvasH - l.gridH, newY));
        return { ...l, offsetX: cx, offsetY: cy };
      }));
      // 等 setLayers 触发 re-render + effect 跑完，再解除阻止
      setTimeout(() => { modifyingLayerIdRef.current = null; }, 0);
    });

    fc.on('object:moving', (e) => {
      draggingRef.current = true;
      const obj = e.target as any;
      if (obj?.layerId) modifyingLayerIdRef.current = obj.layerId;
    });

    // 编辑工具 — Fabric 鼠标事件（applyToolAt 定义在 effect 内，闭包稳定）
    function applyToolAt(pointerX: number, pointerY: number) {
      const layerId = selectedLayerIdRef.current;
      const layer = layersRef.current.find(l => l.id === layerId);
      if (!layer || !layer.fabricObj) return;
      const gx = Math.floor((pointerX - layer.offsetX * CELL_PX) / CELL_PX);
      const gy = Math.floor((pointerY - layer.offsetY * CELL_PX) / CELL_PX);
      if (gx < 0 || gx >= layer.gridW || gy < 0 || gy >= layer.gridH) return;
      const tool = toolRef.current;

      if (tool === 'eyedropper') {
        const color = layer.grid[gy][gx];
        if (!color || isTransparent(color)) return;
        setCurrentDrawColor(color);
        setCurrentTool('pencil');
      } else if (tool === 'eraser') {
        // 擦除：直接在 setLayers 中构造新 grid
        const newGrid = layer.grid.map(row => [...row]);
        newGrid[gy][gx] = TRANSPARENT_COLOR;
        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, grid: newGrid } : l));
      } else if (tool === 'pencil') {
        const color = drawColorRef.current ?? getClosestMardColor([128, 128, 128]);
        const newGrid = layer.grid.map(row => [...row]);
        newGrid[gy][gx] = color;
        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, grid: newGrid } : l));
      }
    }

    fc.on('mouse:down', (opt) => {
      if (toolRef.current === 'select' || !selectedLayerIdRef.current) return;
      isDrawingRef.current = true;
      const pointer = fc.getScenePoint(opt.e);
      applyToolAt(pointer.x, pointer.y);
    });
    fc.on('mouse:move', (opt) => {
      if (toolRef.current === 'select' || !selectedLayerIdRef.current || !isDrawingRef.current) return;
      const pointer = fc.getScenePoint(opt.e);
      applyToolAt(pointer.x, pointer.y);
    });
    fc.on('mouse:up', () => { isDrawingRef.current = false; });

    return () => { fc.dispose(); fabricRef.current = null; initializedRef.current = false; };
  }, []);

  // 精度变化时自动重新像素化
  useEffect(() => {
    if (!selectedLayerId || layers.length === 0) return;
    if (pixelGrid === prevPixelGridRef.current) return;
    prevPixelGridRef.current = pixelGrid;
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer || layer.gridW === pixelGrid && layer.gridH === pixelGrid) return;
    rePixelateLayer(layer, pixelGrid);
  }, [pixelGrid, selectedLayerId, layers]);

  // 品牌或标签变化时重新渲染（不依赖 renderKey，避免编辑时被打断）
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || layers.length === 0) return;
    layers.forEach(layer => {
      if (!layer.fabricObj) return;
      const beadCanvas = gridToCanvas(layer.grid, CELL_PX, showLabels, brand);
      layer.fabricObj.setElement(beadCanvas);
    });
    fc.renderAll();
  }, [brand, showLabels]);

  // grid 数据变化时重新渲染（layers 变化由 applyToolAt 触发 setLayers）
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || layers.length === 0) return;
    layers.forEach(layer => {
      if (!layer.fabricObj) return;
      const beadCanvas = gridToCanvas(layer.grid, CELL_PX, showLabels, brand);
      layer.fabricObj.setElement(beadCanvas);
    });
    fc.renderAll();
  }, [layers, brand, showLabels]);

  // 同步编辑工具 refs
  useEffect(() => { toolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { drawColorRef.current = currentDrawColor; }, [currentDrawColor]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { selectedLayerIdRef.current = selectedLayerId; }, [selectedLayerId]);

  // 编辑工具激活时禁用 Fabric 选择，退出时恢复
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.selection = currentTool === 'select';
    fc.forEachObject((obj: any) => {
      if (obj.layerId) {
        obj.selectable = currentTool === 'select';
      }
    });
  }, [currentTool]);

  // 画布尺寸或图层变化时刷新
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    requestAnimationFrame(() => {
      fc.setDimensions({ width: canvasW * CELL_PX, height: canvasH * CELL_PX });
      // 只跳过正在被拖拽的图层，其他图层正常更新位置
      layers.forEach(layer => {
        if (layer.id === modifyingLayerIdRef.current) return;
        if (!layer.fabricObj) return;
        layer.fabricObj.set({ left: layer.offsetX * CELL_PX, top: layer.offsetY * CELL_PX });
        layer.fabricObj.setCoords();
      });
      fc.renderAll();
    });
  }, [canvasW, canvasH, layers]);

  // 计算购物清单
  const calculateShoppingList = useCallback(() => {
    const counts = new Map<string, { color: MardColor; count: number }>();
    layers.forEach(layer => {
      for (let gy = 0; gy < layer.gridH; gy++) {
        for (let gx = 0; gx < layer.gridW; gx++) {
          const color = layer.grid[gy]?.[gx];
          if (!color || isTransparent(color)) continue;
          const existing = counts.get(color.id);
          if (existing) existing.count++;
          else counts.set(color.id, { color, count: 1 });
        }
      }
    });
    const items = Array.from(counts.entries())
      .map(([id, { color, count }], i) => ({ color, count, index: i + 1 }))
      .sort((a, b) => b.count - a.count);
    setShoppingList(items);
  }, [layers]);

  useEffect(() => { calculateShoppingList(); }, [layers, calculateShoppingList]);

  // === 导入图片 ===
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;
    setLoading(true);
    setLoadingText('读取图片...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const layerId = `layer-${Date.now()}`;
      try {
        const pixelData = await pixelateImage(dataUrl, pixelGrid, false, true);
        // 居中放置
        const offsetX = Math.max(0, Math.floor((canvasW - pixelData.width) / 2));
        const offsetY = Math.max(0, Math.floor((canvasH - pixelData.height) / 2));
        const newLayer: BeadLayer = {
          id: layerId, offsetX, offsetY,
          grid: pixelData.grid, gridW: pixelData.width, gridH: pixelData.height,
          originalDataUrl: dataUrl, hasTransparency: false, fabricObj: null,
        };
        const beadCanvas = gridToCanvas(newLayer.grid, CELL_PX, showLabels, brand);
        const fabricImg = new fabric.Image(beadCanvas, {
          left: offsetX * CELL_PX, top: offsetY * CELL_PX, scaleX: 1, scaleY: 1,
          cornerColor: '#f97316', cornerStyle: 'circle', borderColor: '#f97316',
          transparentCorners: false, hasControls: true, hasBorders: true,
          lockRotation: true, lockScalingX: true, lockScalingY: true,
        });
        (fabricImg as any).layerId = layerId;
        fabricImg.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
        newLayer.fabricObj = fabricImg;
        fabricRef.current?.add(fabricImg);
        fabricRef.current?.setActiveObject(fabricImg);
        setSelectedLayerId(layerId);
        setLayers(prev => [...prev, newLayer]);
        requestAnimationFrame(() => fabricRef.current?.renderAll());
      } catch (err) { console.error(err); }
      finally { setLoading(false); setLoadingText(''); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // === AI 去背 ===
  const handleRemoveBackground = async () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) { alert('请先选择一个图层'); return; }
    setLoading(true);
    setLoadingText('AI 识别主体...');
    try {
      const result = await removeBackground(layer.originalDataUrl, {
        progress: (key) => { if (key === 'compute:inference') setLoadingText('AI 识别中...'); },
        output: { format: 'image/png', quality: 1 }
      });
      const blob = result;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = async () => {
        const tmp = document.createElement('canvas');
        tmp.width = img.width; tmp.height = img.height;
        const ctx = tmp.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const dataUrl = tmp.toDataURL('image/png');
        const pixelData = await pixelateImage(dataUrl, layer.gridW, true, true);
        const beadCanvas = gridToCanvas(pixelData.grid, CELL_PX, showLabels, brand);
        const fabricImg = new fabric.Image(beadCanvas, {
          left: layer.offsetX * CELL_PX, top: layer.offsetY * CELL_PX,
          scaleX: 1, scaleY: 1,
          cornerColor: '#f97316', cornerStyle: 'circle', borderColor: '#f97316',
          transparentCorners: false, hasControls: true, hasBorders: true,
          lockRotation: true, lockScalingX: true, lockScalingY: true,
        });
        (fabricImg as any).layerId = layer.id;
        fabricImg.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
        setLayers(prev => prev.map(l => {
          if (l.id !== layer.id) return l;
          return { ...l, grid: pixelData.grid, hasTransparency: true, fabricObj: fabricImg };
        }));
        URL.revokeObjectURL(url);
        setLoading(false);
        setLoadingText('');
      };
      img.src = url;
    } catch (err) { console.error(err); alert('去背失败，请重试'); setLoading(false); setLoadingText(''); }
  };

  // === 删除图层 ===
  const deleteLayer = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer?.fabricObj) fabricRef.current?.remove(layer.fabricObj);
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (selectedLayerId === layerId) setSelectedLayerId(null);
    fabricRef.current?.renderAll();
  };

  // === 清空 ===
  const clearAll = () => {
    layers.forEach(l => l.fabricObj && fabricRef.current?.remove(l.fabricObj));
    setLayers([]);
    setSelectedLayerId(null);
    fabricRef.current?.renderAll();
  };

  // 重新像素化核心逻辑
  async function rePixelateLayer(layer: BeadLayer, precision: number) {
    if (repixelatingRef.current) return;
    repixelatingRef.current = true;
    setLoading(true);
    setLoadingText('重新像素化...');
    try {
      const pixelData = await pixelateImage(layer.originalDataUrl, precision, layer.hasTransparency, true);
      const beadCanvas = gridToCanvas(pixelData.grid, CELL_PX, showLabels, brand);
      const fabricImg = new fabric.Image(beadCanvas, {
        left: layer.offsetX * CELL_PX, top: layer.offsetY * CELL_PX, scaleX: 1, scaleY: 1,
        cornerColor: '#f97316', cornerStyle: 'circle', borderColor: '#f97316',
        transparentCorners: false, hasControls: true, hasBorders: true,
        lockRotation: true, lockScalingX: true, lockScalingY: true,
      });
      (fabricImg as any).layerId = layer.id;
      fabricImg.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
      if (layer.fabricObj) fabricRef.current?.remove(layer.fabricObj);
      fabricRef.current?.add(fabricImg);
      setLayers(prev => prev.map(l => {
        if (l.id !== layer.id) return l;
        return { ...l, grid: pixelData.grid, gridW: pixelData.width, gridH: pixelData.height, fabricObj: fabricImg };
      }));
      fabricRef.current?.renderAll();
    } catch (err) { console.error(err); }
    finally { setLoading(false); setLoadingText(''); repixelatingRef.current = false; }
  }

  // 生成导出图纸的 dataUrl（预览和下载共用）
  const generateExportDataUrl = (): string | null => {
    if (layers.length === 0) return null;

    type CellColor = MardColor | null;

    // 单图层时居中，多图层时按原始坐标
    let shiftX = 0, shiftY = 0;
    if (layers.length === 1) {
      const layer = layers[0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let gy = 0; gy < layer.gridH; gy++) {
        for (let gx = 0; gx < layer.gridW; gx++) {
          const color = layer.grid[gy]?.[gx];
          if (!color || isTransparent(color)) continue;
          if (gx < minX) minX = gx;
          if (gy < minY) minY = gy;
          if (gx > maxX) maxX = gx;
          if (gy > maxY) maxY = gy;
        }
      }
      const contentW = maxX - minX + 1;
      const contentH = maxY - minY + 1;
      shiftX = Math.max(0, Math.floor((canvasW - contentW) / 2)) - minX;
      shiftY = Math.max(0, Math.floor((canvasH - contentH) / 2)) - minY;
    }

    const composite: CellColor[][] = Array.from({ length: canvasH }, () =>
      Array.from({ length: canvasW }, () => null)
    );

    layers.forEach(layer => {
      for (let gy = 0; gy < layer.gridH; gy++) {
        for (let gx = 0; gx < layer.gridW; gx++) {
          const color = layer.grid[gy]?.[gx];
          if (!color || isTransparent(color)) continue;
          const cx = layer.offsetX + gx + shiftX;
          const cy = layer.offsetY + gy + shiftY;
          if (cx < 0 || cx >= canvasW || cy < 0 || cy >= canvasH) continue;
          composite[cy][cx] = color;
        }
      }
    });

    const colorCounts = new Map<string, { color: MardColor; count: number }>();
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        const color = composite[y][x];
        if (!color || isTransparent(color)) continue;
        if (!colorCounts.has(color.id)) colorCounts.set(color.id, { color, count: 0 });
        colorCounts.get(color.id)!.count++;
      }
    }
    const legendItems = Array.from(colorCounts.entries())
      .map(([id, { color, count }]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);
    const totalBeads = legendItems.reduce((s, i) => s + i.count, 0);

    const CELL = 40;
    const PAD = 20;
    const GRID_W = canvasW * CELL;
    const GRID_H = canvasH * CELL;
    const LEGEND_COLS = Math.max(1, Math.floor(GRID_W / 120));
    const LEGEND_ITEM_H = 36;
    const LEGEND_ROWS = Math.ceil(legendItems.length / LEGEND_COLS);
    const LEGEND_AREA_H = 36 + LEGEND_ROWS * LEGEND_ITEM_H + 16;
    const W = GRID_W + PAD * 2;
    const H = GRID_H + PAD * 2 + LEGEND_AREA_H;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const ox = PAD;
    const oy = PAD;

    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        const color = composite[y][x];
        const px = ox + x * CELL;
        const py = oy + y * CELL;
        if (!color || isTransparent(color)) {
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(px, py, CELL, CELL);
        } else {
          ctx.fillStyle = color.hex;
          ctx.fillRect(px, py, CELL, CELL);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px + 0.25, py + 0.25, CELL - 0.5, CELL - 0.5);
        }
      }
    }

    for (let i = 0; i <= canvasW; i++) {
      ctx.strokeStyle = i % 10 === 0 ? '#999999' : '#e0e0e0';
      ctx.lineWidth = i % 10 === 0 ? 1.5 : 0.5;
      ctx.beginPath(); ctx.moveTo(ox + i * CELL, oy); ctx.lineTo(ox + i * CELL, oy + GRID_H); ctx.stroke();
    }
    for (let i = 0; i <= canvasH; i++) {
      ctx.strokeStyle = i % 10 === 0 ? '#999999' : '#e0e0e0';
      ctx.lineWidth = i % 10 === 0 ? 1.5 : 0.5;
      ctx.beginPath(); ctx.moveTo(ox, oy + i * CELL); ctx.lineTo(ox + GRID_W, oy + i * CELL); ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        const color = composite[y][x];
        if (!color || isTransparent(color)) continue;
        const bid = color.brandIds?.[brand] || color.id;
        const px = ox + x * CELL + CELL / 2;
        const py = oy + y * CELL + CELL / 2;
        const br = (color.rgb[0] * 299 + color.rgb[1] * 587 + color.rgb[2] * 114) / 1000;
        ctx.fillStyle = br > 128 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
        ctx.font = 'bold ' + Math.max(9, Math.min(12, CELL * 0.28)) + 'px sans-serif';
        ctx.fillText(bid, px, py);
      }
    }

    const legendY = oy + GRID_H + 16;
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(brand + '  |  ' + totalBeads + ' beads  |  ' + legendItems.length + ' colors', ox, legendY);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, legendY + 18); ctx.lineTo(ox + GRID_W, legendY + 18); ctx.stroke();

    const itemStartY = legendY + 26;
    legendItems.forEach((item, idx) => {
      const col = idx % LEGEND_COLS;
      const row = Math.floor(idx / LEGEND_COLS);
      const ix = ox + col * 120;
      const iy = itemStartY + row * LEGEND_ITEM_H;
      const bid = item.color.brandIds?.[brand] || item.color.id;
      ctx.fillStyle = item.color.hex;
      ctx.fillRect(ix, iy + 2, 24, 24);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(ix, iy + 2, 24, 24);
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(bid, ix + 30, iy + 6);
      ctx.fillStyle = '#666'; ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('x' + item.count, ix + 116, iy + 6);
    });

    return canvas.toDataURL('image/png', 1.0);
  };

  // 预览图纸
  const handleShowPreview = () => {
    if (layers.length === 0) return;
    const url = generateExportDataUrl();
    if (url) { setPreviewDataUrl(url); setShowPreview(true); }
  };

  // 下载图纸
  const downloadCanvas = () => {
    if (layers.length === 0) return;
    const url = generateExportDataUrl();
    if (!url) return;
    const link = document.createElement('a');
    link.download = brand.toLowerCase() + '-pattern-' + Date.now() + '.png';
    link.href = url;
    link.click();
  };


  // === 更新图层 offset ===
  const handleLayerOffsetChange = (layerId: string, axis: 'x' | 'y', value: number) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    const clamped = axis === 'x'
      ? Math.max(0, Math.min(canvasW - layer.gridW, value))
      : Math.max(0, Math.min(canvasH - layer.gridH, value));
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const newOffset = { ...l, offsetX: axis === 'x' ? clamped : l.offsetX, offsetY: axis === 'y' ? clamped : l.offsetY };
      if (l.fabricObj) {
        l.fabricObj.set({ left: newOffset.offsetX * CELL_PX, top: newOffset.offsetY * CELL_PX });
        l.fabricObj.setCoords();
      }
      return newOffset;
    }));
    fabricRef.current?.renderAll();
  };

  // === ToolButton 组件 ===
  function ToolButton({ icon, label, onClick, disabled = false, danger = false, active = false }: {
    icon: React.ReactNode; label: string; onClick: () => void;
    disabled?: boolean; danger?: boolean; active?: boolean;
  }) {
    return (
      <button onClick={onClick} disabled={disabled}
        className={`group relative flex flex-col items-center gap-1 transition-all ${disabled ? 'opacity-20 cursor-not-allowed' : 'hover:scale-110'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          active ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' :
          danger ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' :
          'bg-[#2A2A2A] text-gray-400 hover:bg-orange-500 hover:text-white'
        }`}>
          {icon}
        </div>
        <span className={`text-[9px] font-bold transition-colors ${active ? 'text-orange-500' : 'text-gray-500 group-hover:text-white'}`}>{label}</span>
      </button>
    );
  }

  return (
    <>
    <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden">
      {/* 左侧工具栏 */}
      <aside className="w-20 bg-[#1E1E1E] border-r border-[#333] flex flex-col items-center py-6 gap-6 z-20">
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Palette className="text-white w-6 h-6" />
        </div>
        <div className="flex flex-col gap-3">
          <ToolButton icon={<Upload size={20} />} label="上传" onClick={() => fileInputRef.current?.click()} />
          <ToolButton icon={<Download size={20} />} label="预览" onClick={handleShowPreview} danger={false} />
          <ToolButton icon={<Download size={20} />} label="导出" onClick={downloadCanvas} danger={false} />
          <div className="h-px bg-[#333] w-8 mx-auto" />
          <ToolButton icon={<Wand2 size={20} />} label="AI去背" onClick={handleRemoveBackground} />
          <div className="h-px bg-[#333] w-8 mx-auto" />
          <ToolButton icon={<Pipette size={20} />} label="取色" onClick={() => setCurrentTool(currentTool === 'eyedropper' ? 'select' : 'eyedropper')} active={currentTool === 'eyedropper'} />
          <ToolButton icon={<Eraser size={20} />} label="擦除" onClick={() => setCurrentTool(currentTool === 'eraser' ? 'select' : 'eraser')} active={currentTool === 'eraser'} />
          <ToolButton icon={<Pencil size={20} />} label="铅笔" onClick={() => setCurrentTool(currentTool === 'pencil' ? 'select' : 'pencil')} active={currentTool === 'pencil'} />
          <div className="h-px bg-[#333] w-8 mx-auto" />
          <ToolButton icon={<Layers size={20} />} label={showLabels ? "隐藏编号" : "显示编号"} onClick={() => setShowLabels(!showLabels)} active={showLabels} />
          <ToolButton icon={<Trash2 size={20} />} label="删除" onClick={() => selectedLayerId && deleteLayer(selectedLayerId)} disabled={!selectedLayerId} danger />
          <ToolButton icon={<RotateCcw size={20} />} label="清空" onClick={clearAll} danger />
        </div>
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
      </aside>

      {/* 主区域 */}
      <main className="flex-1 relative flex flex-col">
        <header className="h-16 bg-[#1E1E1E] border-b border-[#333] flex items-center justify-between px-6">
          <div className="flex items-center gap-5">
            <h1 className="text-sm font-bold tracking-widest uppercase text-gray-400">MARD Editor v5</h1>
            <div className="flex items-center gap-2 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
              <span className="text-xs text-gray-400 font-mono">画布:</span>
              <input type="number" value={canvasW}
                onChange={e => setCanvasW(Math.max(5, Math.min(300, parseInt(e.target.value) || 50)))}
                className="bg-transparent w-14 text-xs font-bold focus:outline-none text-orange-500" min={5} max={300} />
              <span className="text-gray-500 text-xs">×</span>
              <input type="number" value={canvasH}
                onChange={e => setCanvasH(Math.max(5, Math.min(300, parseInt(e.target.value) || 50)))}
                className="bg-transparent w-14 text-xs font-bold focus:outline-none text-orange-500" min={5} max={300} />
              <span className="text-[10px] text-gray-600">({canvasW * canvasH}格)</span>
            </div>
            <div className="flex items-center gap-2 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
              <span className="text-xs text-gray-400 font-mono">精度:</span>
              <input type="number" value={pixelGrid} min={5} max={300}
                onChange={e => setPixelGrid(Math.max(5, Math.min(300, parseInt(e.target.value) || 29)))}
                className="bg-transparent w-14 text-xs font-bold focus:outline-none text-orange-500" />
              <span className="text-[10px] text-gray-600">({pixelGrid}px)</span>
            </div>
            <div className="flex items-center gap-2 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
              <span className="text-xs text-gray-400 font-mono">品牌:</span>
              <select value={brand} onChange={e => setBrand(e.target.value as Brand)}
                className="bg-transparent text-xs font-bold focus:outline-none text-orange-500 cursor-pointer">
                {(["MARD", "COCO", "漫漫", "盼盼", "咪小窝"] as Brand[]).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            {currentTool === 'pencil' && currentDrawColor && (
              <div className="flex items-center gap-2 bg-[#2A2A2A] px-3 py-2 rounded-full border border-orange-500/40">
                <div className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: currentDrawColor.hex }} />
                <span className="text-xs font-bold text-orange-400">{currentDrawColor.brandIds?.[brand] || currentDrawColor.id}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${showLabels ? 'bg-orange-500' : 'bg-gray-600'}`} />
              <span>编号: {showLabels ? '开' : '关'}</span>
            </div>
            <div className="h-4 w-px bg-[#333]" />
            <Move size={14} />
            <span>拖拽移动图层</span>
          </div>
        </header>

        {/* 画布区域 */}
        <div ref={containerRef} className="flex-1 bg-[#0a0a0a] overflow-auto flex items-center justify-center p-10">
          <div className="relative shadow-[0_0_80px_rgba(0,0,0,0.8)]">
            <canvas
              ref={canvasRef}
              className={
                currentTool === 'eyedropper' ? 'cursor-crosshair' :
                currentTool === 'eraser'    ? 'cursor-cell' :
                currentTool === 'pencil'   ? 'cursor-cell' : ''
              }
            />
            {loading && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
                <span className="text-sm font-bold">{loadingText || '处理中...'}</span>
              </div>
            )}
          </div>
        </div>

        <footer className="h-10 bg-[#1E1E1E] border-t border-[#333] flex items-center px-6 justify-between text-[10px] text-gray-500 uppercase tracking-widest">
          <div className="flex gap-4">
            <span>画布: {canvasW}×{canvasH}={canvasW * canvasH}格</span>
            <span>图层: {layers.length}</span>
            <span>总豆数: {shoppingList.reduce((a, c) => a + c.count, 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Info size={12} />
            <span>精度决定占据格数 · 拖拽移动图层 · 多图排列后导出</span>
          </div>
        </footer>
      </main>

      {/* 右侧面板 */}
      <aside className="w-72 bg-[#1E1E1E] border-l border-[#333] flex flex-col overflow-hidden">
        <section className="p-5 border-b border-[#333]">
          <div className="flex items-center gap-2 mb-4 text-orange-500">
            <Layers size={16} />
            <h3 className="text-xs font-bold uppercase tracking-wider">图层</h3>
            <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded font-bold">{layers.length}</span>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {layers.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-10 border border-dashed border-[#333] rounded-xl">
                暂无图层，上传图片开始
              </div>
            ) : (
              layers.map((layer, i) => (
                <div key={layer.id}
                  onClick={() => {
                    setSelectedLayerId(layer.id);
                    layer.fabricObj && fabricRef.current?.setActiveObject(layer.fabricObj);
                    fabricRef.current?.renderAll();
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${selectedLayerId === layer.id ? 'bg-orange-500/10 border-orange-500/50' : 'bg-[#2A2A2A] border-[#333] hover:border-gray-600'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 bg-black/30 rounded-lg flex items-center justify-center overflow-hidden">
                      <img src={layer.originalDataUrl} className="max-w-full max-h-full object-contain" alt="" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold">图层 #{i + 1}</div>
                      <div className="text-[9px] text-gray-500">{layer.gridW}×{layer.gridH}px</div>
                      {layer.hasTransparency && <span className="text-[8px] text-green-400">已去背</span>}
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteLayer(layer.id); }}
                      className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2 text-[9px]">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">X:</span>
                      <input type="number" value={layer.offsetX} min={0} max={canvasW - layer.gridW}
                        onChange={e => handleLayerOffsetChange(layer.id, 'x', parseInt(e.target.value) || 0)}
                        onClick={e => e.stopPropagation()}
                        className="w-10 bg-[#1a1a1a] border border-[#444] rounded px-1 text-white text-[9px] focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Y:</span>
                      <input type="number" value={layer.offsetY} min={0} max={canvasH - layer.gridH}
                        onChange={e => handleLayerOffsetChange(layer.id, 'y', parseInt(e.target.value) || 0)}
                        onClick={e => e.stopPropagation()}
                        className="w-10 bg-[#1a1a1a] border border-[#444] rounded px-1 text-white text-[9px] focus:outline-none" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 色卡清单 */}
        <section className="flex-1 p-5 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-orange-500">
              <Palette size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider">{brand}</h3>
            </div>
            <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-1 rounded font-bold">
              {shoppingList.length}色
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
            {shoppingList.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-12">暂无数据</div>
            ) : (
              shoppingList.map(item => (
                <div key={item.color.id} className="flex items-center gap-2.5 p-2 bg-[#2A2A2A] rounded-lg border border-[#333] hover:border-gray-600 transition-colors">
                  <div className="w-8 h-8 rounded shadow-inner flex items-center justify-center text-[8px] font-bold"
                    style={{
                      backgroundColor: item.color.hex,
                      color: (item.color.rgb[0] * 299 + item.color.rgb[1] * 587 + item.color.rgb[2] * 114) / 1000 > 128 ? '#000' : '#fff'
                    }}>
                    #{item.index}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-gray-500 truncate">{item.color.brandIds?.[brand] || item.color.name}</div>
                    <div className="text-[9px] font-bold text-orange-400">×{item.count}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>

    {/* 预览弹窗 */}
    {showPreview && previewDataUrl && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={() => setShowPreview(false)}>
        <div className="relative max-w-full max-h-full bg-white rounded-2xl shadow-2xl overflow-auto"
          onClick={e => e.stopPropagation()}>
          <img src={previewDataUrl} alt="预览" className="block max-w-[90vw] max-h-[90vh] object-contain" />
          <div className="absolute top-3 right-3 flex gap-2">
            <button onClick={() => { downloadCanvas(); setShowPreview(false); }}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow">
              下载 PNG
            </button>
            <button onClick={() => setShowPreview(false)}
              className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow">
              关闭
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
