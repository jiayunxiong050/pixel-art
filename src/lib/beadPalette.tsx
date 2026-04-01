/**
 * 调色板组件
 * 显示 MARD 色卡，支持搜索和选择
 */

import React, { useState, useMemo } from 'react';
import { MardColor, MARD_COLORS, Brand, isTransparent } from './mardColorUtils';

interface BeadPaletteProps {
  selectedColor: MardColor | null;
  onColorSelect: (color: MardColor) => void;
  brand: Brand;
  showOnlyUsed?: boolean;      // 只显示使用的颜色
  usedColors?: Set<string>;    // 已使用的颜色 id 集合
}

const BeadPalette: React.FC<BeadPaletteProps> = ({
  selectedColor,
  onColorSelect,
  brand,
  showOnlyUsed = false,
  usedColors,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(false);

  // 过滤颜色
  const filteredColors = useMemo(() => {
    let colors = MARD_COLORS;

    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      colors = colors.filter(c =>
        c.id.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        c.hex.toLowerCase().includes(term)
      );
    }

    // 只显示使用的颜色
    if (showOnlyUsed && usedColors) {
      colors = colors.filter(c => usedColors.has(c.id));
    }

    return colors;
  }, [searchTerm, showOnlyUsed, usedColors]);

  // 显示的颜色数量限制
  const displayColors = showAll ? filteredColors : filteredColors.slice(0, 50);

  // 获取文字颜色
  const getTextColor = (color: MardColor) => {
    const brightness = (color.rgb[0] * 299 + color.rgb[1] * 587 + color.rgb[2] * 114) / 1000;
    return brightness > 128 ? '#000' : '#fff';
  };

  // 获取品牌色号
  const getBrandId = (color: MardColor) => {
    return color.brandIds?.[brand] || color.id;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="搜索颜色..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 bg-[rgba(201,149,107,0.06)] border border-[rgba(201,149,107,0.15)] rounded-lg text-[#7A4830] text-sm focus:outline-none focus:border-[rgba(201,149,107,0.4)]"
        />
      </div>

      {/* 已选颜色 */}
      {selectedColor && (
        <div className="mb-3 p-3 bg-[rgba(201,149,107,0.06)] rounded-lg border border-[rgba(232,168,124,0.2)]">
          <div className="text-[10px] text-[#C97B4B] mb-2 uppercase tracking-wider">已选颜色</div>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg"
              style={{ backgroundColor: selectedColor.hex }}
            />
            <div>
              <div className="text-sm font-bold" style={{ color: getTextColor(selectedColor) }}>
                {getBrandId(selectedColor)}
              </div>
              <div className="text-[10px] text-[#C4A090]">{selectedColor.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* 颜色列表 */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-6 gap-1">
          {displayColors.map((color) => {
            const isSelected = selectedColor?.id === color.id;
            return (
              <button
                key={color.id}
                onClick={() => onColorSelect(color)}
                className={`
                  relative w-full aspect-square rounded-lg transition-all
                  ${isSelected ? 'ring-2 ring-[#E8A87C] ring-offset-1 ring-offset-[#FDF8F3] scale-110' : 'hover:scale-105'}
                `}
                title={`${getBrandId(color)} - ${color.name}`}
              >
                <div
                  className="w-full h-full rounded-lg"
                  style={{ backgroundColor: color.hex }}
                />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 bg-white rounded-full shadow" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 显示更多按钮 */}
        {filteredColors.length > 50 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full mt-3 py-2 text-xs text-[#E8A87C] hover:text-[#D4956A] transition-colors"
          >
            显示更多 ({filteredColors.length - 50} 个)
          </button>
        )}

        {showAll && filteredColors.length > 50 && (
          <button
            onClick={() => setShowAll(false)}
            className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            收起
          </button>
        )}

        {filteredColors.length === 0 && (
          <div className="text-center py-8 text-[#C4A090] text-sm">
            未找到匹配的颜色
          </div>
        )}
      </div>
    </div>
  );
};

export default BeadPalette;
