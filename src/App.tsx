/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import {
  Upload,
  Grid3X3,
  Download,
  Palette,
  Trash2,
  Layers,
  Move,
  RotateCcw,
  Maximize,
  Plus,
  Minus,
  Info,
  Wand2,
  Eraser,
  Square,
  Undo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pixelateImage, gridToCanvas, MardColor, Brand } from './lib/mardColorUtils';
import { removeBackground } from '@imgly/background-removal';

const GRID_SIZE_DEFAULT = 50;
const BEAD_PIXELS = 20;
const PIXEL_GRID_DEFAULT = 29;

type ToolMode = 'select' | 'eraser' | 'rect-select';

export default function App() {
  const [gridCount, setGridCount] = useState(GRID_SIZE_DEFAULT);
  const [pixelGrid, setPixelGrid] = useState(PIXEL_GRID_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [objects, setObjects] = useState<fabric.Object[]>([]);
  const [showLabels, setShowLabels] = useState(false);
  const [brand, setBrand] = useState<Brand>("MARD");
  const [shoppingList, setShoppingList] = useState<{ color: MardColor; count: number }[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [showMask, setShowMask] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<string | null>(null);
  const historyRef = useRef<ImageData[]>([]);

  // 计算实时购物清单
  const calculateShoppingList = useCallback(() => {
    if (!fabricRef.current) return;
    
    const counts = new Map<string, { color: MardColor; count: number }>();
    const beadObjects = fabricRef.current.getObjects().filter(o => o.get('data')?.type === 'bead-layer');
    
    beadObjects.forEach(obj => {
      const grid = obj.get('data')?.grid as MardColor[][];
      if (!grid) return;
      
      grid.forEach(row => {
        row.forEach(color => {
          const existing = counts.get(color.id);
          if (existing) {
            existing.count += 1;
          } else {
            counts.set(color.id, { color, count: 1 });
          }
        });
      });
    });

    setShoppingList(Array.from(counts.values()).sort((a, b) => {
      const idA = a.color.brandIds?.[brand] || a.color.id;
      const idB = b.color.brandIds?.[brand] || b.color.id;
      return idA.localeCompare(idB);
    }));
  }, [brand]);

  // 初始化画布
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 800,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;

    // 监听对象选择
    canvas.on('selection:created', (e) => setSelectedObject(e.selected[0]));
    canvas.on('selection:updated', (e) => setSelectedObject(e.selected[0]));
    canvas.on('selection:cleared', () => setSelectedObject(null));

    // 监听对象变化以更新清单
    canvas.on('object:added', calculateShoppingList);
    canvas.on('object:removed', calculateShoppingList);

    // 监听对象移动/缩放以实现吸附
    canvas.on('object:moving', (options) => {
      const obj = options.target;
      if (!obj) return;
      
      const step = BEAD_PIXELS;
      obj.set({
        left: Math.round((obj.left || 0) / step) * step,
        top: Math.round((obj.top || 0) / step) * step,
      });
    });

    canvas.on('object:scaling', (options) => {
      const obj = options.target;
      if (!obj || !obj.width || !obj.height) return;
      
      // 保持比例并吸附缩放
      const step = BEAD_PIXELS;
      const currentWidth = obj.width * (obj.scaleX || 1);
      const currentHeight = obj.height * (obj.scaleY || 1);
      
      const snappedWidth = Math.round(currentWidth / step) * step;
      const snappedHeight = Math.round(currentHeight / step) * step;
      
      obj.set({
        scaleX: snappedWidth / obj.width,
        scaleY: snappedHeight / obj.height,
      });
    });

    drawGrid(canvas, gridCount);

    return () => {
      canvas.dispose();
    };
  }, [calculateShoppingList]);

  // 响应标签显示或品牌切换
  useEffect(() => {
    if (!fabricRef.current) return;
    
    const beadObjects = fabricRef.current.getObjects().filter(o => o.get('data')?.type === 'bead-layer');
    beadObjects.forEach(obj => {
      const grid = obj.get('data')?.grid as MardColor[][];
      if (grid) {
        const newCanvas = gridToCanvas(grid, BEAD_PIXELS, showLabels, brand);
        (obj as fabric.Image).setElement(newCanvas);
      }
    });
    fabricRef.current.renderAll();
  }, [showLabels, brand]);

  // 绘制背景网格（包含四边坐标轴）
  const drawGrid = (canvas: fabric.Canvas, count: number) => {
    // 清除旧网格和轴
    const oldObjects = canvas.getObjects().filter(obj =>
      obj.get('data')?.type === 'grid-line' || obj.get('data')?.type === 'axis-label'
    );
    oldObjects.forEach(obj => canvas.remove(obj));

    const size = count * BEAD_PIXELS;
    canvas.setDimensions({ width: size, height: size });

    // 轴标签区域
    const labelSize = 20;
    const fontSize = 9;

    // 生成随机但稳定的坐标颜色（基于行列号生成seed）
    const getAxisColor = (n: number) => {
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
      return colors[n % colors.length];
    };

    // 绘制垂直线（X轴标签在上方，Y轴标签在左侧刻度）
    for (let i = 0; i <= count; i++) {
      const pos = i * BEAD_PIXELS;
      const isMajor = i % 5 === 0;
      const strokeWidth = isMajor ? 1.5 : 1;
      const strokeColor = isMajor ? '#c0c0c0' : '#e8e8e8';

      const vLine = new fabric.Line([pos, 0, pos, size], {
        stroke: strokeColor,
        selectable: false,
        evented: false,
        strokeWidth,
        data: { type: 'grid-line' }
      });

      canvas.add(vLine);

      // 上边 X 轴标签（仅每5格显示）
      if (isMajor) {
        const label = String(i);
        const labelBg = new fabric.Rect({
          left: pos - labelSize / 2,
          top: -labelSize,
          width: labelSize,
          height: labelSize - 2,
          fill: getAxisColor(i),
          selectable: false,
          evented: false,
          rx: 2,
          ry: 2,
          data: { type: 'axis-label' }
        });

        const labelText = new fabric.Text(label, {
          left: pos,
          top: -labelSize + 2,
          fontSize,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#ffffff',
          originX: 'center',
          originY: 'top',
          selectable: false,
          evented: false,
          data: { type: 'axis-label' }
        });

        canvas.add(labelBg, labelText);
      }

      // 下边 X 轴标签（镜像显示）
      if (isMajor) {
        const label = String(i);
        const labelBg = new fabric.Rect({
          left: pos - labelSize / 2,
          top: size + 2,
          width: labelSize,
          height: labelSize - 2,
          fill: getAxisColor(i),
          selectable: false,
          evented: false,
          rx: 2,
          ry: 2,
          data: { type: 'axis-label' }
        });

        const labelText = new fabric.Text(label, {
          left: pos,
          top: size + 4,
          fontSize,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#ffffff',
          originX: 'center',
          originY: 'top',
          selectable: false,
          evented: false,
          data: { type: 'axis-label' }
        });

        canvas.add(labelBg, labelText);
      }
    }

    // 绘制水平线
    for (let i = 0; i <= count; i++) {
      const pos = i * BEAD_PIXELS;
      const isMajor = i % 5 === 0;
      const strokeWidth = isMajor ? 1.5 : 1;
      const strokeColor = isMajor ? '#c0c0c0' : '#e8e8e8';

      const hLine = new fabric.Line([0, pos, size, pos], {
        stroke: strokeColor,
        selectable: false,
        evented: false,
        strokeWidth,
        data: { type: 'grid-line' }
      });

      canvas.add(hLine);

      // 左边 Y 轴标签（每5格显示）
      if (isMajor) {
        const label = String(i);
        const labelBg = new fabric.Rect({
          left: -labelSize,
          top: pos - labelSize / 2,
          width: labelSize - 2,
          height: labelSize,
          fill: getAxisColor(i),
          selectable: false,
          evented: false,
          rx: 2,
          ry: 2,
          data: { type: 'axis-label' }
        });

        const labelText = new fabric.Text(label, {
          left: -labelSize + 2,
          top: pos,
          fontSize,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#ffffff',
          originX: 'left',
          originY: 'center',
          selectable: false,
          evented: false,
          data: { type: 'axis-label' }
        });

        canvas.add(labelBg, labelText);
      }

      // 右边 Y 轴标签（镜像显示）
      if (isMajor) {
        const label = String(i);
        const labelBg = new fabric.Rect({
          left: size + 2,
          top: pos - labelSize / 2,
          width: labelSize - 2,
          height: labelSize,
          fill: getAxisColor(i),
          selectable: false,
          evented: false,
          rx: 2,
          ry: 2,
          data: { type: 'axis-label' }
        });

        const labelText = new fabric.Text(label, {
          left: size + 4,
          top: pos,
          fontSize,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#ffffff',
          originX: 'left',
          originY: 'center',
          selectable: false,
          evented: false,
          data: { type: 'axis-label' }
        });

        canvas.add(labelBg, labelText);
      }
    }

    canvas.renderAll();
  };

  // 响应网格数量变化
  useEffect(() => {
    if (fabricRef.current) {
      drawGrid(fabricRef.current, gridCount);
    }
  }, [gridCount]);

  // 保存当前 mask 状态到历史
  const saveMaskHistory = useCallback(() => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      historyRef.current.push(imageData);
      if (historyRef.current.length > 20) historyRef.current.shift();
    }
  }, []);

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0 || !maskCanvasRef.current) return;
    const imageData = historyRef.current.pop()!;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
  }, []);

  // 初始化 mask 画布
  const initMaskCanvas = useCallback((width: number, height: number) => {
    if (!maskCanvasRef.current || !fabricRef.current) return;

    const canvas = fabricRef.current;
    const scaleX = canvas.getZoom();
    const scaleY = canvas.getZoom();

    maskCanvasRef.current.width = width * scaleX;
    maskCanvasRef.current.height = height * scaleY;
    maskCanvasRef.current.style.width = `${width * scaleX}px`;
    maskCanvasRef.current.style.height = `${height * scaleY}px`;

    const ctx = maskCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
  }, []);

  // 擦除 mask
  const eraseMask = useCallback((x: number, y: number, radius: number = 20) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  // 填充 mask 区域
  const fillMask = useCallback((x: number, y: number, radius: number = 20) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // 应用 mask 到图片
  const applyMaskToImage = useCallback((imageDataUrl: string, maskCanvas: HTMLCanvasElement, pixelSize: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = pixelSize;
        canvas.height = pixelSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageDataUrl);
          return;
        }

        // 缩放 mask 到目标尺寸
        const maskScaled = document.createElement('canvas');
        maskScaled.width = pixelSize;
        maskScaled.height = pixelSize;
        const maskCtx = maskScaled.getContext('2d');
        if (maskCtx) {
          maskCtx.drawImage(maskCanvas, 0, 0, pixelSize, pixelSize);
        }

        const maskData = maskCtx?.getImageData(0, 0, pixelSize, pixelSize);
        if (!maskData) {
          resolve(imageDataUrl);
          return;
        }

        // 获取原始图片像素
        ctx.drawImage(img, 0, 0, pixelSize, pixelSize);
        const imgData = ctx.getImageData(0, 0, pixelSize, pixelSize);

        // 应用 mask
        for (let i = 0; i < imgData.data.length; i += 4) {
          const maskAlpha = maskData.data[i + 3];
          if (maskAlpha < 128) {
            // mask 为透明，设为白色
            imgData.data[i] = 255;
            imgData.data[i + 1] = 255;
            imgData.data[i + 2] = 255;
            imgData.data[i + 3] = 255;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.src = imageDataUrl;
    });
  }, []);

  // 智能去背
  const handleRemoveBackground = async () => {
    if (!originalImageRef.current) {
      alert('请先上传图片');
      return;
    }

    setLoading(true);
    setLoadingText('正在识别主体...');

    try {
      const result = await removeBackground(originalImageRef.current, {
        progress: (key, current, total) => {
          if (key === 'compute:inference') {
            setLoadingText('AI 识别中...');
          }
        },
        output: {
          format: 'image/png',
          quality: 1
        }
      });

      // 处理结果
      const blob = result;
      const url = URL.createObjectURL(blob);

      // 创建新图片
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');

          // 重新像素化
          const pixelData = await pixelateImage(dataUrl, pixelGrid);
          const beadCanvas = gridToCanvas(pixelData.grid, BEAD_PIXELS, showLabels, brand);

          // 清除旧图层
          const layers = fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || [];
          layers.forEach(l => fabricRef.current?.remove(l));

          const fabricImg = new fabric.Image(beadCanvas, {
            left: 0,
            top: 0,
            cornerColor: '#f97316',
            cornerStyle: 'circle',
            borderColor: '#f97316',
            transparentCorners: false,
            padding: 0,
            data: {
              type: 'bead-layer',
              grid: pixelData.grid
            }
          });

          fabricImg.setControlsVisibility({
            mt: false, mb: false, ml: false, mr: false
          });

          fabricRef.current?.add(fabricImg);
          fabricRef.current?.setActiveObject(fabricImg);
          setObjects(fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || []);

          // 更新 mask 画布
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = pixelGrid;
          maskCanvas.height = pixelGrid;
          const maskCtx = maskCanvas.getContext('2d');
          if (maskCtx) {
            // 从去背结果提取 alpha 通道作为 mask
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = pixelGrid;
            tempCanvas.height = pixelGrid;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(img, 0, 0, pixelGrid, pixelGrid);
              const imgData = tempCtx.getImageData(0, 0, pixelGrid, pixelGrid);
              const maskData = maskCtx.createImageData(pixelGrid, pixelGrid);
              for (let i = 0; i < imgData.data.length; i += 4) {
                maskData.data[i] = 255;
                maskData.data[i + 1] = 255;
                maskData.data[i + 2] = 255;
                maskData.data[i + 3] = imgData.data[i + 3]; // 使用原图 alpha
              }
              maskCtx.putImageData(maskData, 0, 0);
            }
          }

          // 更新 mask 画布显示
          if (maskCanvasRef.current) {
            const displayMask = document.createElement('canvas');
            displayMask.width = fabricRef.current!.getWidth();
            displayMask.height = fabricRef.current!.getHeight();
            const displayCtx = displayMask.getContext('2d');
            if (displayCtx && maskCtx) {
              displayCtx.drawImage(maskCanvas, 0, 0, displayMask.width, displayMask.height);
              const displayCtx2 = maskCanvasRef.current.getContext('2d');
              if (displayCtx2) {
                displayCtx2.drawImage(displayMask, 0, 0);
              }
            }
          }
        }
        URL.revokeObjectURL(url);
        setLoading(false);
        setLoadingText('');
      };
      img.src = url;
    } catch (err) {
      console.error('Background removal failed:', err);
      alert('去背失败，请重试');
      setLoading(false);
      setLoadingText('');
    }
  };

  // mask 画布鼠标事件
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const handleMaskMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode !== 'eraser' || !maskCanvasRef.current) return;
    isDrawingRef.current = true;
    const rect = maskCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPosRef.current = { x, y };
    saveMaskHistory();
    eraseMask(x, y, 15);
  };

  const handleMaskMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || toolMode !== 'eraser' || !maskCanvasRef.current) return;
    const rect = maskCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    lastPosRef.current = { x, y };
  };

  const handleMaskMouseUp = async () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (toolMode === 'eraser' && originalImageRef.current && maskCanvasRef.current) {
      // 重新应用 mask 到图片
      setLoading(true);
      setLoadingText('更新图案...');

      const maskedImage = await applyMaskToImage(originalImageRef.current, maskCanvasRef.current, pixelGrid);
      const pixelData = await pixelateImage(maskedImage, pixelGrid);
      const beadCanvas = gridToCanvas(pixelData.grid, BEAD_PIXELS, showLabels, brand);

      // 更新图层
      const layers = fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || [];
      layers.forEach(l => fabricRef.current?.remove(l));

      const fabricImg = new fabric.Image(beadCanvas, {
        left: 0,
        top: 0,
        cornerColor: '#f97316',
        cornerStyle: 'circle',
        borderColor: '#f97316',
        transparentCorners: false,
        padding: 0,
        data: {
          type: 'bead-layer',
          grid: pixelData.grid
        }
      });

      fabricImg.setControlsVisibility({
        mt: false, mb: false, ml: false, mr: false
      });

      fabricRef.current?.add(fabricImg);
      fabricRef.current?.setActiveObject(fabricImg);
      setObjects(fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || []);

      setLoading(false);
      setLoadingText('');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;

    setLoading(true);
    setLoadingText('读取图片...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      originalImageRef.current = dataUrl;
      historyRef.current = [];

      try {
        // 初始化 mask 画布（全白=全部保留）
        const img = new Image();
        img.onload = () => {
          initMaskCanvas(img.width, img.height);
        };
        img.src = dataUrl;

        // 像素化处理
        const pixelData = await pixelateImage(dataUrl, pixelGrid);

        // 转换为 Canvas
        const beadCanvas = gridToCanvas(pixelData.grid, BEAD_PIXELS, showLabels, brand);

        // 创建 Fabric Image
        const fabricImg = new fabric.Image(beadCanvas, {
          left: 0,
          top: 0,
          cornerColor: '#f97316',
          cornerStyle: 'circle',
          borderColor: '#f97316',
          transparentCorners: false,
          padding: 0,
          data: {
            type: 'bead-layer',
            grid: pixelData.grid
          }
        });

        fabricImg.setControlsVisibility({
          mt: false, mb: false, ml: false, mr: false
        });

        fabricRef.current?.add(fabricImg);
        fabricRef.current?.setActiveObject(fabricImg);
        setObjects(fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deleteSelected = () => {
    if (fabricRef.current && selectedObject) {
      fabricRef.current.remove(selectedObject);
      fabricRef.current.discardActiveObject();
      setObjects(fabricRef.current.getObjects().filter(o => o.get('data')?.type === 'bead-layer'));
    }
  };

  const downloadCanvas = () => {
    if (!fabricRef.current) return;

    const gridLines = fabricRef.current.getObjects().filter(obj => obj.get('data')?.type === 'grid-line');
    const beadLayers = fabricRef.current.getObjects().filter(o => o.get('data')?.type === 'bead-layer');
    gridLines.forEach(l => l.set('visible', false));
    const originalBg = fabricRef.current.backgroundColor;
    fabricRef.current.set('backgroundColor', '#ffffff');
    fabricRef.current.renderAll();

    const designDataURL = fabricRef.current.toDataURL({ format: 'png', quality: 1 });

    let maxRows = 0;
    let maxCols = 0;
    beadLayers.forEach(layer => {
      const grid = layer.get('data')?.grid as MardColor[][];
      if (grid) {
        maxRows = Math.max(maxRows, grid.length);
        maxCols = Math.max(maxCols, grid[0]?.length || 0);
      }
    });

    const designWidth = fabricRef.current.getWidth();
    const designHeight = fabricRef.current.getHeight();
    const labelSize = 16;       // 轴标签尺寸
    const pad = 15;            // 内边距

    // 清单区域高度（横向紧凑排列）
    const listItemH = 24;
    const availableWidth = designWidth + labelSize + pad * 2;
    const maxItemsPerRow = Math.max(1, Math.floor(availableWidth / 160));
    const listRows = Math.ceil(shoppingList.length / maxItemsPerRow);
    const listAreaH = 36 + listRows * listItemH + 10;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = designWidth + labelSize + pad * 2;
    exportCanvas.height = designHeight + labelSize * 2 + pad * 2 + listAreaH;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const designX = pad + labelSize;
    const designY = pad + labelSize;

    const designImg = new Image();
    designImg.onload = () => {
      ctx.drawImage(designImg, designX, designY);

      // 轴标签尺寸和字体
      const ls = 14;
      const fs = 8;

      // 获取轴颜色
      const getAxisColor = (n: number) => {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
        return colors[n % colors.length];
      };

      // X 轴底部（列号）
      const xCellSize = designWidth / Math.max(maxCols, 1);
      for (let col = 0; col <= maxCols; col++) {
        if (col % 5 === 0) {
          const x = designX + col * xCellSize;
          ctx.fillStyle = getAxisColor(col);
          ctx.fillRect(x - ls / 2, designY + designHeight + 2, ls, ls);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${fs}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(col), x, designY + designHeight + 2 + ls / 2);
        }
      }

      // X 轴顶部（镜像列号）
      for (let col = 0; col <= maxCols; col++) {
        if (col % 5 === 0) {
          const x = designX + col * xCellSize;
          ctx.fillStyle = getAxisColor(col);
          ctx.fillRect(x - ls / 2, designY - ls - 2, ls, ls);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${fs}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(col), x, designY - ls - 2 + ls / 2);
        }
      }

      // Y 轴左侧（行号）
      const yCellSize = designHeight / Math.max(maxRows, 1);
      for (let row = 0; row <= maxRows; row++) {
        if (row % 5 === 0) {
          const y = designY + row * yCellSize;
          ctx.fillStyle = getAxisColor(row);
          ctx.fillRect(designX - ls - 2, y - ls / 2, ls, ls);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${fs}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(row), designX - ls - 2 + ls / 2, y);
        }
      }

      // Y 轴右侧（镜像行号）
      for (let row = 0; row <= maxRows; row++) {
        if (row % 5 === 0) {
          const y = designY + row * yCellSize;
          ctx.fillStyle = getAxisColor(row);
          ctx.fillRect(designX + designWidth + 2, y - ls / 2, ls, ls);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${fs}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(row), designX + designWidth + 2 + ls / 2, y);
        }
      }

      // ====== 清单区域（图纸下方，横向紧凑）======
      const listY = designY + designHeight + labelSize + 8;

      // 标题栏
      ctx.fillStyle = '#555555';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const total = shoppingList.reduce((a, c) => a + c.count, 0);
      ctx.fillText(
        `${brand} 合计:${total}颗 ${shoppingList.length}色 ${maxRows}×${maxCols}格`,
        designX, listY
      );

      // 分隔线
      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(designX, listY + 16);
      ctx.lineTo(designX + designWidth, listY + 16);
      ctx.stroke();

      // 横向排列色号
      const itemStartY = listY + 20;
      const itemW = availableWidth / maxItemsPerRow - 6;

      shoppingList.forEach((item, i) => {
        const row = Math.floor(i / maxItemsPerRow);
        const col = i % maxItemsPerRow;
        const x = designX + col * (itemW + 6);
        const y = itemStartY + row * listItemH;

        const brandId = item.color.brandIds?.[brand] || item.color.id;

        // 色块
        ctx.fillStyle = item.color.hex;
        ctx.beginPath();
        ctx.arc(x + 8, y + 8, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // 色号 + 数量
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(brandId, x + 18, y + 6);
        ctx.fillStyle = '#f97316';
        ctx.fillText(`×${item.count}`, x + 18, y + 18);
      });

      // 下载
      const link = document.createElement('a');
      link.download = `${brand.toLowerCase()}-pattern-${new Date().getTime()}.png`;
      link.href = exportCanvas.toDataURL('image/png', 1.0);
      link.click();

      gridLines.forEach(l => l.set('visible', true));
      fabricRef.current?.set('backgroundColor', originalBg);
      fabricRef.current?.renderAll();
    };
    designImg.src = designDataURL;
  };

  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden">
      {/* Left Sidebar: Tools */}
      <aside className="w-20 bg-[#1E1E1E] border-r border-[#333] flex flex-col items-center py-6 gap-8 z-20">
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Palette className="text-white w-6 h-6" />
        </div>

        <div className="flex flex-col gap-4">
          <ToolButton
            icon={<Upload size={20} />}
            label="上传"
            onClick={() => fileInputRef.current?.click()}
          />
          <ToolButton
            icon={<Download size={20} />}
            label="导出"
            onClick={downloadCanvas}
          />
          <div className="h-px bg-[#333] w-8 mx-auto my-2" />
          <ToolButton
            icon={<Wand2 size={20} />}
            label="去背"
            onClick={handleRemoveBackground}
            active={toolMode === 'eraser'}
          />
          <ToolButton
            icon={<Eraser size={20} />}
            label="擦除"
            onClick={() => setToolMode(toolMode === 'eraser' ? 'select' : 'eraser')}
            active={toolMode === 'eraser'}
          />
          <ToolButton
            icon={<Square size={20} />}
            label="框选"
            onClick={() => setToolMode(toolMode === 'rect-select' ? 'select' : 'rect-select')}
            active={toolMode === 'rect-select'}
          />
          <ToolButton
            icon={<Undo size={20} />}
            label="撤销"
            onClick={handleUndo}
          />
          <div className="h-px bg-[#333] w-8 mx-auto my-2" />
          <ToolButton
            icon={showLabels ? <Layers size={20} /> : <Info size={20} />}
            label={showLabels ? "隐藏编号" : "显示编号"}
            onClick={() => setShowLabels(!showLabels)}
            active={showLabels}
          />
          <ToolButton
            icon={<Trash2 size={20} />}
            label="删除"
            onClick={deleteSelected}
            disabled={!selectedObject}
            danger
          />
          <ToolButton
            icon={<RotateCcw size={20} />}
            label="清空"
            onClick={() => {
              const layers = fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || [];
              layers.forEach(l => fabricRef.current?.remove(l));
              setObjects([]);
              originalImageRef.current = null;
              historyRef.current = [];
            }}
            danger
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

      {/* Main Editor Area */}
      <main className="flex-1 relative flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-[#1E1E1E] border-b border-[#333] flex items-center justify-between px-8">
          <div className="flex items-center gap-6">
            <h1 className="text-sm font-bold tracking-widest uppercase text-gray-400">MARD Editor v3.0</h1>
            <div className="flex items-center gap-3 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
              <Grid3X3 size={14} className="text-orange-500" />
              <span className="text-xs font-mono">画布:</span>
              <input
                type="number"
                value={gridCount}
                onChange={(e) => setGridCount(Math.max(10, Math.min(200, parseInt(e.target.value) || 10)))}
                className="bg-transparent w-12 text-xs font-bold focus:outline-none text-orange-500"
              />
            </div>

            <div className="flex items-center gap-3 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
              <Grid3X3 size={14} className="text-orange-500" />
              <span className="text-xs font-mono">精度:</span>
              <input
                type="number"
                value={pixelGrid}
                min={5}
                max={200}
                onChange={(e) => setPixelGrid(Math.max(5, Math.min(200, parseInt(e.target.value) || 29)))}
                className="bg-transparent w-12 text-xs font-bold focus:outline-none text-orange-500"
              />
              <span className="text-[10px] text-gray-500">({pixelGrid}×{pixelGrid})</span>
            </div>

            <div className="flex items-center gap-3 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
              <Palette size={14} className="text-orange-500" />
              <span className="text-xs font-mono">品牌:</span>
              <select 
                value={brand}
                onChange={(e) => setBrand(e.target.value as Brand)}
                className="bg-transparent text-xs font-bold focus:outline-none text-orange-500 cursor-pointer"
              >
                <option value="MARD">MARD</option>
                <option value="COCO">COCO</option>
                <option value="漫漫">漫漫</option>
                <option value="盼盼">盼盼</option>
                <option value="咪小窝">咪小窝</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${showLabels ? 'bg-orange-500 animate-pulse' : 'bg-gray-600'}`} />
              <span>图纸模式: {showLabels ? '开启' : '关闭'}</span>
            </div>
            <div className="h-4 w-px bg-[#333]" />
            <div className="flex items-center gap-2">
              <Move size={14} />
              <span>吸附对齐</span>
            </div>
          </div>
        </header>

        {/* Canvas Container */}
        <div className="flex-1 bg-[#121212] overflow-auto flex items-center justify-center p-20 custom-scrollbar">
          <div className="relative shadow-[0_0_100px_rgba(0,0,0,0.5)] bg-white">
            <canvas ref={canvasRef} />
            <canvas
              ref={maskCanvasRef}
              className={`absolute top-0 left-0 cursor-crosshair ${toolMode === 'eraser' ? 'pointer-events-auto' : 'pointer-events-none'}`}
              style={{ opacity: toolMode === 'eraser' ? 0.5 : 0 }}
              onMouseDown={handleMaskMouseDown}
              onMouseMove={handleMaskMouseMove}
              onMouseUp={handleMaskMouseUp}
              onMouseLeave={handleMaskMouseUp}
            />
            {loading && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <span className="text-sm font-bold">{loadingText || '处理中...'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Status */}
        <footer className="h-10 bg-[#1E1E1E] border-t border-[#333] flex items-center px-6 justify-between text-[10px] text-gray-500 uppercase tracking-widest">
          <div className="flex gap-4">
            <span>画布: {gridCount}格 | 精度: {pixelGrid}×{pixelGrid}={pixelGrid * pixelGrid}豆</span>
            <span>对象: {objects.length}</span>
            <span>总豆数: {shoppingList.reduce((acc, curr) => acc + curr.count, 0)}</span>
            {toolMode === 'eraser' && <span className="text-orange-400">| 擦除模式</span>}
          </div>
          <div className="flex items-center gap-2">
            <Info size={12} />
            <span>
              {toolMode === 'eraser' ? '擦除图片区域，被擦除部分会变为白色' :
               toolMode === 'rect-select' ? '框选工具' :
               '去背:AI自动识别主体 | 擦除:手动擦除区域'}
            </span>
          </div>
        </footer>
      </main>

      {/* Right Sidebar: Properties & Shopping List */}
      <aside className="w-72 bg-[#1E1E1E] border-l border-[#333] flex flex-col overflow-hidden">
        {/* Layers Section */}
        <section className="p-6 border-b border-[#333]">
          <div className="flex items-center gap-2 mb-4 text-orange-500">
            <Layers size={16} />
            <h3 className="text-xs font-bold uppercase tracking-wider">图层管理</h3>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
            {objects.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-8 border border-dashed border-[#333] rounded-xl">
                暂无图层
              </div>
            ) : (
              objects.map((obj, i) => (
                <div 
                  key={i}
                  onClick={() => {
                    fabricRef.current?.setActiveObject(obj);
                    fabricRef.current?.renderAll();
                  }}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${selectedObject === obj ? 'bg-orange-500/10 border-orange-500/50' : 'bg-[#2A2A2A] border-[#333] hover:border-gray-600'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black/20 rounded-md flex items-center justify-center overflow-hidden">
                      <img src={obj.toDataURL()} className="max-w-full max-h-full object-contain" />
                    </div>
                    <span className="text-[10px] font-bold">图层 #{i + 1}</span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      fabricRef.current?.remove(obj);
                      setObjects(fabricRef.current?.getObjects().filter(o => o.get('data')?.type === 'bead-layer') || []);
                    }}
                    className="text-gray-600 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Shopping List Section */}
        <section className="flex-1 p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-orange-500">
              <Palette size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider">{brand} 购物清单</h3>
            </div>
            <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-1 rounded font-bold">
              {shoppingList.length} 种颜色
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {shoppingList.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-20">
                画布为空
              </div>
            ) : (
              shoppingList.map(item => (
                <div key={item.color.id} className="flex items-center gap-3 p-2 bg-[#2A2A2A] rounded-xl border border-[#333] hover:border-gray-600 transition-all">
                  <div 
                    className="w-8 h-8 rounded-full shadow-inner border border-gray-200 flex items-center justify-center text-[8px] font-bold" 
                    style={{ 
                      backgroundColor: item.color.hex,
                      color: (item.color.rgb[0] * 299 + item.color.rgb[1] * 587 + item.color.rgb[2] * 114) / 1000 > 128 ? '#000' : '#fff'
                    }}
                  >
                    {item.color.brandIds?.[brand] || item.color.id.replace('M', '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold truncate">{item.color.name}</div>
                    <div className="text-[8px] text-gray-500 uppercase">{item.color.brandIds?.[brand] || item.color.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-orange-500">x{item.count}</div>
                    <div className="text-[8px] text-gray-600">颗</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Selection Info */}
        {selectedObject && (
          <motion.section 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-[#252525] border-t border-[#333]"
          >
            <div className="grid grid-cols-2 gap-4 text-[9px] font-mono">
              <div>
                <div className="text-gray-500 mb-1 uppercase">X / Y</div>
                <div className="text-white">{Math.round(selectedObject.left)} / {Math.round(selectedObject.top)}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1 uppercase">旋转</div>
                <div className="text-white">{Math.round(selectedObject.angle)}°</div>
              </div>
            </div>
          </motion.section>
        )}
      </aside>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}} />
    </div>
  );
}

function ToolButton({ icon, label, onClick, disabled = false, danger = false, active = false }: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void,
  disabled?: boolean,
  danger?: boolean,
  active?: boolean
}) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex flex-col items-center gap-1 transition-all ${disabled ? 'opacity-20 cursor-not-allowed' : 'hover:scale-110'}`}
    >
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
