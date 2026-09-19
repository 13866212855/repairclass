import React, { useState, useEffect } from 'react';
import { MapPin, Edit3, ListFilter } from 'lucide-react';
import { LocationConfig } from '../types';

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  dongBuildings: ['一号楼', '二号楼', '三号楼', '四号楼', '五号楼', '六号楼'],
  dongFloors: ['1楼', '2楼', '3楼', '4楼'],
  dongRooms: ['东1', '东2', '东3', '东4', '东5', '东6'],
  xiFloors: ['1楼', '2楼', '3楼'],
  xiRooms: ['东1', '东2', '东3', '东4'],
};

interface LocationSelectorProps {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  config?: LocationConfig;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  required = true,
  config,
}) => {
  // 'preset' = 级联下拉选择, 'manual' = 手动输入
  const [mode, setMode] = useState<'preset' | 'manual'>('preset');

  // 级联状态
  const [zone, setZone] = useState<'东区' | '西区' | '其他'>('东区');

  // 当前激活的可选数据（支持管理后台动态配置）
  const activeConfig = config || DEFAULT_LOCATION_CONFIG;
  const dongBuildings = activeConfig.dongBuildings?.length ? activeConfig.dongBuildings : DEFAULT_LOCATION_CONFIG.dongBuildings;
  const dongFloors = activeConfig.dongFloors?.length ? activeConfig.dongFloors : DEFAULT_LOCATION_CONFIG.dongFloors;
  const dongRooms = activeConfig.dongRooms?.length ? activeConfig.dongRooms : DEFAULT_LOCATION_CONFIG.dongRooms;
  const xiFloors = activeConfig.xiFloors?.length ? activeConfig.xiFloors : DEFAULT_LOCATION_CONFIG.xiFloors;
  const xiRooms = activeConfig.xiRooms?.length ? activeConfig.xiRooms : DEFAULT_LOCATION_CONFIG.xiRooms;
  
  // 东区状态: 1号楼~6号楼，1楼~4楼，东1~东6
  const [dongBuilding, setDongBuilding] = useState(dongBuildings[0] || '一号楼');
  const [dongFloor, setDongFloor] = useState(dongFloors[0] || '1楼');
  const [dongRoom, setDongRoom] = useState(dongRooms[0] || '东1');

  // 西区状态: 1楼~3楼，东1~东4
  const [xiFloor, setXiFloor] = useState(xiFloors[0] || '1楼');
  const [xiRoom, setXiRoom] = useState(xiRooms[0] || '东1');

  // 其他手动输入
  const [otherCustom, setOtherCustom] = useState('');

  // 监听 config 变更，修正非法选中项
  useEffect(() => {
    if (!dongBuildings.includes(dongBuilding)) setDongBuilding(dongBuildings[0] || '一号楼');
    if (!dongFloors.includes(dongFloor)) setDongFloor(dongFloors[0] || '1楼');
    if (!dongRooms.includes(dongRoom)) setDongRoom(dongRooms[0] || '东1');
    if (!xiFloors.includes(xiFloor)) setXiFloor(xiFloors[0] || '1楼');
    if (!xiRooms.includes(xiRoom)) setXiRoom(xiRooms[0] || '东1');
  }, [activeConfig]);

  // 当级联选项改变时，自动组装位置并通知父组件
  useEffect(() => {
    if (mode === 'preset') {
      if (zone === '东区') {
        const fullLoc = `东区 ${dongBuilding} ${dongFloor} ${dongRoom}`;
        onChange(fullLoc);
      } else if (zone === '西区') {
        const fullLoc = `西区 ${xiFloor} ${xiRoom}`;
        onChange(fullLoc);
      } else if (zone === '其他') {
        onChange(otherCustom);
      }
    }
  }, [mode, zone, dongBuilding, dongFloor, dongRoom, xiFloor, xiRoom, otherCustom]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-slate-800">
          设备位置 {required && <span className="text-rose-500">*</span>}
        </label>
        <button
          type="button"
          onClick={() => {
            if (mode === 'preset') {
              setMode('manual');
            } else {
              setMode('preset');
            }
          }}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer font-medium"
        >
          {mode === 'preset' ? (
            <>
              <Edit3 className="w-3 h-3" /> 切换为直接文本输入
            </>
          ) : (
            <>
              <ListFilter className="w-3 h-3" /> 切换为区域楼栋下拉选择
            </>
          )}
        </button>
      </div>

      {mode === 'manual' ? (
        <div className="relative">
          <MapPin className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            id="input-device-location-manual"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="例如：东区 2号楼 3楼 东2、科技实验楼302、多功能报告厅"
            className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            required={required}
          />
        </div>
      ) : (
        <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
          {/* 一级选择：校区区域 */}
          <div>
            <span className="text-xs text-slate-500 block mb-1 font-medium">1. 选择区域：</span>
            <div className="grid grid-cols-3 gap-2">
              {(['东区', '西区', '其他'] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZone(z)}
                  className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    zone === z
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          {/* 二级与三级级联选择 */}
          {zone === '东区' && (
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200">
              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">楼号：</label>
                <select
                  value={dongBuilding}
                  onChange={(e) => setDongBuilding(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {dongBuildings.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">楼层：</label>
                <select
                  value={dongFloor}
                  onChange={(e) => setDongFloor(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {dongFloors.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">位置编号：</label>
                <select
                  value={dongRoom}
                  onChange={(e) => setDongRoom(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {dongRooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {zone === '西区' && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200">
              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">楼层：</label>
                <select
                  value={xiFloor}
                  onChange={(e) => setXiFloor(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {xiFloors.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">位置编号：</label>
                <select
                  value={xiRoom}
                  onChange={(e) => setXiRoom(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {xiRooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {zone === '其他' && (
            <div className="pt-1 border-t border-slate-200">
              <label className="text-[11px] text-slate-500 font-medium block mb-1">
                请输入具体位置或专用教室：
              </label>
              <input
                type="text"
                value={otherCustom}
                onChange={(e) => setOtherCustom(e.target.value)}
                placeholder="例如：科技楼301微机室、综合实验楼录播室、报告厅"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* 生成的定位展示预览 */}
          <div className="text-xs bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
            <span className="text-slate-400 font-medium">选定位置:</span>
            <span className="font-bold text-blue-700">
              {value || '（请选择或填写上方具体位置）'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
