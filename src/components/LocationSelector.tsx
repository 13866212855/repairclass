import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Edit3, ListFilter } from 'lucide-react';
import { LocationConfig, LocationZone } from '../types';

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  zones: [
    {
      key: 'dong',
      name: '东区',
      buildings: ['一号楼', '二号楼', '三号楼', '四号楼', '五号楼', '六号楼'],
      floors: ['1楼', '2楼', '3楼', '4楼'],
      rooms: ['东1', '东2', '东3', '东4', '东5', '东6'],
    },
    {
      key: 'xi',
      name: '西区',
      buildings: [],
      floors: ['1楼', '2楼', '3楼'],
      rooms: ['东1', '东2', '东3', '东4'],
    },
  ],
};

interface ZoneSel {
  building: string;
  floor: string;
  room: string;
}

function initSelections(zs: LocationZone[]): Record<string, ZoneSel> {
  const o: Record<string, ZoneSel> = {};
  zs.forEach((z) => {
    o[z.key] = { building: z.buildings[0] || '', floor: z.floors[0] || '', room: z.rooms[0] || '' };
  });
  return o;
}

interface LocationSelectorProps {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  config?: LocationConfig;
}

// 动态多区域级联选择器：区域列表由管理后台「位置与分类配置」驱动
// （区名可编辑、区域可增删、楼号列可留空、楼层/教室清空自动移除区域）
export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  required = true,
  config,
}) => {
  // 'preset' = 级联下拉选择, 'manual' = 手动输入
  const [mode, setMode] = useState<'preset' | 'manual'>('preset');
  const [activeKey, setActiveKey] = useState<string>('');
  const [otherCustom, setOtherCustom] = useState('');
  const [sel, setSel] = useState<Record<string, ZoneSel>>({});

  const zones: LocationZone[] = useMemo(
    () =>
      ((config?.zones?.length ? config.zones : DEFAULT_LOCATION_CONFIG.zones) || []).filter(
        (z) => z.floors.length > 0 || z.rooms.length > 0
      ),
    [config]
  );

  // 区域列表变化时：初始化/校正每个区域的三级选中项，并修正激活页签
  useEffect(() => {
    setSel((prev) => {
      const next: Record<string, ZoneSel> = {};
      zones.forEach((z) => {
        const cur = prev[z.key];
        next[z.key] = {
          building: cur && z.buildings.includes(cur.building) ? cur.building : z.buildings[0] || '',
          floor: cur && z.floors.includes(cur.floor) ? cur.floor : z.floors[0] || '',
          room: cur && z.rooms.includes(cur.room) ? cur.room : z.rooms[0] || '',
        };
      });
      return next;
    });
    setActiveKey((prev) => (zones.some((z) => z.key === prev) ? prev : zones[0]?.key || 'other'));
  }, [zones]);

  // 级联变化时自动组装位置串：区域名 + 楼号(可选) + 楼层 + 教室编号
  useEffect(() => {
    if (mode !== 'preset') return;
    if (activeKey === 'other') {
      onChange(otherCustom);
      return;
    }
    const z = zones.find((x) => x.key === activeKey);
    if (!z) return;
    const s = sel[z.key] || { building: '', floor: '', room: '' };
    onChange([z.name, s.building, s.floor, s.room].filter(Boolean).join(' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeKey, sel, otherCustom, zones]);

  const setZoneSel = (key: string, patch: Partial<ZoneSel>) =>
    setSel((prev) => ({ ...prev, [key]: { ...(prev[key] || { building: '', floor: '', room: '' }), ...patch } }));

  const activeZone = zones.find((z) => z.key === activeKey);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-slate-800">
          设备位置 {required && <span className="text-rose-500">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setMode(mode === 'preset' ? 'manual' : 'preset')}
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
          {/* 一级选择：区域（由后台配置动态生成） */}
          <div>
            <span className="text-xs text-slate-500 block mb-1 font-medium">1. 选择区域：</span>
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => (
                <button
                  key={z.key}
                  type="button"
                  onClick={() => setActiveKey(z.key)}
                  className={`py-1.5 px-4 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    activeKey === z.key
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {z.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setActiveKey('other')}
                className={`py-1.5 px-4 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  activeKey === 'other'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                其他
              </button>
            </div>
          </div>

          {/* 二~四级级联选择（按后台配置动态出现） */}
          {activeZone && (
            <div
              className="grid gap-2 pt-1 border-t border-slate-200"
              style={{
                gridTemplateColumns: `repeat(${
                  (activeZone.buildings.length > 0 ? 1 : 0) +
                  (activeZone.floors.length > 0 ? 1 : 0) +
                  (activeZone.rooms.length > 0 ? 1 : 0)
                }, minmax(0, 1fr))`,
              }}
            >
              {activeZone.buildings.length > 0 && (
                <div>
                  <label className="text-[11px] text-slate-500 font-medium block mb-1">楼号：</label>
                  <select
                    value={sel[activeZone.key]?.building || ''}
                    onChange={(e) => setZoneSel(activeZone.key, { building: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {activeZone.buildings.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeZone.floors.length > 0 && (
                <div>
                  <label className="text-[11px] text-slate-500 font-medium block mb-1">楼层：</label>
                  <select
                    value={sel[activeZone.key]?.floor || ''}
                    onChange={(e) => setZoneSel(activeZone.key, { floor: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {activeZone.floors.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeZone.rooms.length > 0 && (
                <div>
                  <label className="text-[11px] text-slate-500 font-medium block mb-1">位置编号：</label>
                  <select
                    value={sel[activeZone.key]?.room || ''}
                    onChange={(e) => setZoneSel(activeZone.key, { room: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {activeZone.rooms.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {activeKey === 'other' && (
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
            <span className="font-bold text-blue-700">{value || '（请选择或填写上方具体位置）'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
