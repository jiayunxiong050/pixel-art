# 拼豆编辑器 - 代码修改核查清单

## 一、Fabric.js v7 API 变更（本次白屏根源）

Fabric.js v7 对以下方法进行了重命名，**必须使用新 API**：

| v6 旧API | v7 新API | 备注 |
|-----------|----------|------|
| `canvas.sendToBack()` | `canvas.sendObjectToBack()` | 发送到最底层 |
| `canvas.bringToFront()` | `canvas.bringObjectToFront()` | 发送到最顶层 |
| `canvas.add()` | `canvas.add()` | 不变 |
| `canvas.remove()` | `canvas.remove()` | 不变 |
| `canvas.renderAll()` | `canvas.renderAll()` | 不变 |
| `canvas.dispose()` | `canvas.dispose()` | 不变 |

### 验证方法
修改任何 Fabric 相关代码后，执行：
```bash
grep -rn "sendToBack\|bringToFront\|addObject\|removeObject" src/
# 任何匹配都表示有旧API残留
```

---

## 二、React StrictMode 与 Fabric 初始化

### 问题根源
React 18 `StrictMode` 在开发环境下会：
1. 首次挂载：执行 useEffect → 初始化 Fabric
2. 模拟卸载：执行 cleanup → `dispose()` Fabric
3. 重新挂载：执行 useEffect

如果 cleanup 里**重置了 `initializedRef.current = false`**，组件会重新初始化，但 canvas 元素可能已被销毁，导致白屏。

### 正确模式
```tsx
const initializedRef = useRef(false);

useEffect(() => {
  if (initializedRef.current || !canvasRef.current) return;
  initializedRef.current = true;

  const fc = new fabric.Canvas(canvasRef.current, {...});
  fabricRef.current = fc;

  // ... setup ...

  return () => {
    fc.dispose();
    fabricRef.current = null;
    // ⚠️ 不重置 initializedRef！
    // 原因：StrictMode 模拟卸载后，canvas 元素已被破坏
    // 重置会导致重新初始化时遇到已销毁的 canvas，再次崩溃
    // initializedRef.current = false; // ← 不要加这行
  };
}, []);
```

### 两种可选方案

**方案A（推荐）：关闭 StrictMode** — 简单粗暴，适合内部工具
```tsx
// main.tsx
createRoot(document.getElementById('root')!).render(<App />);
// 不要包裹 <StrictMode>
```

**方案B：保留 StrictMode，不重置 ref**
```tsx
// 清理函数只 dispose，不重置 flag
return () => { fc.dispose(); fabricRef.current = null; };
```

---

## 三、useEffect 依赖陷阱

### 问题：依赖数组导致无限循环
```tsx
// ❌ 错误：依赖 stateA，导致每次 stateA 变化都触发
useEffect(() => {
  doSomething(stateA);
  return () => { setStateA(false); }; // 这里改 stateA
}, [stateA]); // 触发重新运行 → 循环
```

```tsx
// ✅ 正确：分开两个 effect，一个管初始化，一个管副作用
useEffect(() => {
  if (!condition) return;
  doSomething();
  return () => { /* cleanup，不触发 re-render */ };
}, [condition]);

useEffect(() => {
  // 响应 state 变化，但不修改 state
}, [stateA]);
```

### 检查清单
- [ ] `setState` 调用不在同一个 useEffect 的依赖项中
- [ ] 两个 effect 不互相监听对方的 state（避免循环触发）
- [ ] cleanup 函数只做清理，**不修改任何 state 或 ref**（ref 只在 setup 时设置一次）

---

## 四、React ref vs state 混用陷阱

| 场景 | 用 ref | 用 state |
|------|--------|----------|
| 持有可变的外部对象（如 Fabric canvas） | ✅ | ❌ |
| 需要触发重新渲染的数据 | ❌ | ✅ |
| 初始化后不改变的值 | ✅ | ❌ |
| 需要通知 UI 更新的值 | ❌ | ✅ |

```tsx
// ❌ 不要用 state 存 Fabric canvas — 导致每次 render 都重新创建
const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

// ✅ 用 ref — 持有对象但不触发 re-render
const fabricRef = useRef<fabric.Canvas | null>(null);
```

---

## 五、代码修改后的强制核查步骤

每次大量修改代码后，必须执行以下验证：

### 1. 构建验证
```bash
npm run build
# 必须通过，无 error
```

### 2. API 残留检查
```bash
grep -rn "sendToBack\|bringToFront\|addObject\|removeObject" src/
grep -rn "\.render();" src/ | grep -v "renderAll\|renderOn"
# 任何输出都需要审查
```

### 3. import 完整性
检查所有 `import` 的内容是否在组件中被使用：
```bash
# 检查未使用的 import（可手动检查关键 imports）
grep "from 'react'" src/App.tsx  # 确认需要的 hooks 都在
```

### 4. 方法签名对照
修改 Fabric 相关代码时，对照测试文件 `src/App.tsx`（最小可行版本）确认 API 调用正确：
```tsx
// 这是经过验证的 Fabric v7 正确用法
const fc = new fabric.Canvas(canvasRef.current, { width, height, backgroundColor });
fc.add(rect);                          // ✅ add
fc.remove(rect);                       // ✅ remove
fc.sendObjectToBack(rect);             // ✅ sendObjectToBack
fc.renderAll();                        // ✅ renderAll
fc.dispose();                          // ✅ dispose
fc.setDimensions({ width, height });   // ✅ setDimensions
```

### 5. 重启服务器
修改 Fabric 相关代码后，**必须重启 dev server** 确保 HMR 加载最新代码：
```bash
# Windows
taskkill //F //PID <vite_pid>
npm run dev

# 或用 nodemon / 其他方式确保干净启动
```

---

## 六、项目架构要点

### 文件结构
```
src/
  App.tsx              # 主组件，所有逻辑
  lib/
    mardColorUtils.ts  # 像素化、色卡、颜色匹配
  main.tsx             # React 入口
```

### 核心数据流
```
用户上传图片 → pixelateImage() → BeadLayer state
                                         ↓
                               fabricRef.current?.add()
                                         ↓
                               Canvas 显示 + 拖拽
                                         ↓
                               downloadCanvas() 导出
```

### BeadLayer 结构
```tsx
interface BeadLayer {
  id: string;
  offsetX: number;        // 格坐标，不是像素
  offsetY: number;        // 格坐标，不是像素
  grid: MardColor[][];    // 像素网格数据
  gridW: number;         // 网格宽度（格数）
  gridH: number;         // 网格高度（格数）
  originalDataUrl: string; // 原始图片（用于重新像素化）
  hasTransparency: boolean;
  fabricObj: fabric.Image | null; // Fabric 对象引用
}
```

### 关键常量
```tsx
const CELL_PX = 20;        // 屏幕每个格子 20px
const CELL_EXPORT_PX = 30;  // 导出时每个格子 30px
```

---

## 七、白屏排查路径

发现白屏时，按以下顺序排查：

1. **F12 控制台** — 是否有红色错误信息？
   - `XXX is not a function` → Fabric API 错误，回查第一部分
   - `Cannot read property Y of null` → 某个对象未初始化

2. **注释掉 Fabric 代码** — 创建最小 React 组件确认 React 本身正常

3. **逐步添加 Fabric 代码** — 先 `new fabric.Canvas()`，再添加对象，再绑定事件

4. **重启服务器** — HMR 缓存可能导致旧代码仍在运行

5. **清除浏览器缓存** — Ctrl+Shift+R 强制刷新
