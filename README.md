# MARD Pixel Art Editor - 拼豆图案编辑器

<div align="center">

![拼豆](https://img.shields.io/badge/拼豆-像素艺术-FF6B6B?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite)

**将任意图片转换为拼豆图案，自动匹配 292 色拼豆色号**

</div>

---

## 项目概述

MARD Pixel Art Editor 是一个**在线拼豆图案设计工具**，可以帮助用户：

1. **上传任意图片** → 自动转换为像素化拼豆图案
2. **智能去背** → AI 自动识别主体，去除背景干扰
3. **手动调整** → 擦除不需要的区域，精修图案
4. **导出图纸** → 包含坐标轴标注和购物清单的完整拼豆图纸

---

## 项目状态

### 当前版本: v1.0.0 (MVP 已完成)

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| 图片上传 | ✅ 完成 | 支持任意格式图片 |
| 像素化处理 | ✅ 完成 | 可调节精度 5-200 |
| 5品牌色系 | ✅ 完成 | MARD/COCO/漫漫/盼盼/咪小窝 |
| 智能去背 | ✅ 完成 | @imgly/background-removal |
| 手动擦除 | ✅ 完成 | 笔刷式擦除 + 撤销 |
| 框选工具 | 🚧 待开发 | 暂未实现 |
| 坐标轴标注 | ✅ 完成 | 四边彩色数字标注 |
| 购物清单导出 | ✅ 完成 | 横向紧凑排列 |
| 正方形豆子 | ✅ 完成 | 无间距填充 |
| 局域网访问 | ✅ 完成 | 支持多设备访问 |

---

## 功能路线图

```
[v1.0] MVP 基础功能
├── ✅ 图片上传与像素化
├── ✅ 多品牌色号支持
├── ✅ AI 智能去背
├── ✅ 手动擦除工具
└── ✅ 导出图纸 + 购物清单

[v1.1] 精细化工具
├── 🚧 框选删除工具
├── 🚧 填充工具（保留某区域）
└── 🚧 调整色号（手动替换颜色）

[v1.2] 增强导出
├── 🚧 多图层管理
├── 🚧 分页打印支持
└── 🚧 PDF 导出格式

[v2.0] 高级功能
├── 🚧 拼豆模具模拟（圆形/方形）
├── 🚧 颜色推荐优化
└── 🚧 历史记录保存
```

---

## 快速开始

### 本地运行

```bash
# 克隆项目
git clone https://github.com/jiayunxiong050/pixel-art.git
cd pixel-art

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 （或自动分配的端口）

### 局域网访问

开发服务器已配置 `--host=0.0.0.0`，同一局域网内的手机/平板可直接访问：

```
http://<电脑IP>:3000
```

---

## 界面布局

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]  MARD Editor  | 画布:[50] 精度:[29]  品牌:[MARD ▼]      │
├────┬───────────────────────────────────────────────────┬─────────┤
│    │                                                   │         │
│ 上 │                                                   │  图层   │
│ 传 │                                                   │  管理   │
│    │                                                   │         │
│ 导 │           主画布区域                              ├─────────┤
│ 出 │        (网格 + 拼豆图案)                          │         │
│    │                                                   │  购物   │
│ 去 │                                                   │  清单   │
│ 背 │                                                   │         │
│    │                                                   │  颜色   │
│ 擦 │                                                   │  统计   │
│ 除 │                                                   │         │
│    │                                                   │         │
│ 撤 │                                                   │         │
│ 销 │                                                   │         │
├────┴───────────────────────────────────────────────────┴─────────┤
│ 画布:50格 | 精度:29×29=841豆 | 对象:1 | 总豆数:841   状态提示     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心技术栈

| 类别 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 19 | UI 构建 |
| 类型语言 | TypeScript | 类型安全 |
| 构建工具 | Vite 6 | 快速开发 |
| 画布引擎 | Fabric.js 7 | 交互式画布 |
| AI 去背 | @imgly/background-removal | 客户端 AI 处理 |
| 样式 | Tailwind CSS 4 | 现代化 UI |
| 图标 | Lucide React | 图标库 |

---

## 拼豆色系支持

| 品牌 | 色号范围 | 颜色数量 |
|------|---------|---------|
| MARD (玛丽豆) | A01 - ZG8 | 292 色 |
| COCO | E01 - K39 | 292 色 |
| 漫漫 | E1 - G15 | 292 色 |
| 盼盼 | 1 - 291 | 291 色 |
| 咪小窝 | 1 - 278 | 278 色 |

---

## 使用教程

### 1. 上传图片
点击左侧「上传」按钮，选择任意图片（建议：高分辨率、正方形、高对比度）

### 2. 调节精度
在顶部调整「精度」数值：
- **低精度（29×29）**：简单图案，豆子少
- **高精度（80×80+）**：复杂图案，人像，豆子多

### 3. 智能去背
点击「去背」按钮，AI 自动识别主体并去除背景

### 4. 手动调整
使用「擦除」工具去除残余背景，使用「撤销」恢复误操作

### 5. 切换品牌
在顶部品牌下拉框选择目标品牌，购物清单自动更新色号

### 6. 导出图纸
点击「导出」按钮，下载包含：
- 拼豆图案（正方形豆子）
- X/Y 轴坐标标注
- 购物清单（色号 + 数量）

---

## 项目结构

```
pixel-art/
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx            # React 入口
│   ├── index.css           # 全局样式
│   └── lib/
│       └── mardColorUtils.ts  # 色系配置 + 像素化工具
├── public/
├── package.json            # 依赖配置
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts         # Vite 构建配置
├── colorSystemMapping.json # 品牌色号映射数据
└── README.md               # 项目文档
```

---

## 关键算法说明

### 1. 像素化算法
```typescript
// 将图片缩放到目标精度，然后映射到拼豆色系
pixelateImage(dataUrl, gridSize) → MardColor[][]
```

### 2. 颜色匹配算法
```typescript
// 使用 Delta E (CIE76) 计算 Lab 色彩空间距离
// 从 292 色中匹配最接近的颜色
getClosestMardColor(pixelRGB) → MardColor
```

### 3. 去背处理
```typescript
// 客户端 AI 处理，无需上传服务器
removeBackground(imageUrl) → transparentPNG
```

---

## 常见问题

### Q: 上传的图片要求？
- 分辨率越高越好（建议 1500px 以上）
- 最好是接近正方形
- 高对比度效果更好

### Q: 精度设置多少合适？
- **29×29**：简单图标、logo
- **50×50**：一般图案（平衡之选）
- **80×80+**：复杂人像、风景

### Q: 局域网无法访问？
可能需要开放防火墙端口：
```cmd
netsh advfirewall firewall add rule name="Vite Dev" dir=in action=allow protocol=TCP localport=3000
```

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 `git checkout -b feature/amazing`
3. 提交改动 `git commit -m 'Add amazing feature'`
4. 推送分支 `git push origin feature/amazing`
5. 创建 Pull Request

---

## 许可证

MIT License - 随意使用、修改和分发

---

<div align="center">

**Made with ❤️ for perler bead enthusiasts**

</div>