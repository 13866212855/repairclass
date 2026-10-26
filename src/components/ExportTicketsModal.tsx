import React, { useState, useMemo } from 'react';
import { Ticket } from '../types';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  X,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  Wrench,
  Building2,
  Layers,
  FileCheck,
} from 'lucide-react';

interface ExportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickets: Ticket[];
  filteredTickets: Ticket[];
  schoolName: string;
  schoolCode: string;
  currentUserName: string;
  currentUserRole?: string;
  onExportSuccess?: (fileName: string, recordCount: number) => void;
}

type TimeRangeType = 'all' | 'this_month' | 'last_month' | 'last_30_days' | 'last_90_days' | 'custom';

export const ExportTicketsModal: React.FC<ExportTicketsModalProps> = ({
  isOpen,
  onClose,
  tickets,
  filteredTickets,
  schoolName,
  schoolCode,
  currentUserName,
  currentUserRole = '运维工程师',
  onExportSuccess,
}) => {
  // Scope selection: 'filtered' (current filter in main view) or 'all' (all tenant tickets)
  const [dataScope, setDataScope] = useState<'filtered' | 'all'>('filtered');
  // Time range selection for monthly summary
  const [timeRange, setTimeRange] = useState<TimeRangeType>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Status & Category filter inside export modal
  const [exportStatus, setExportStatus] = useState<string>('全部');
  const [exportType, setExportType] = useState<string>('全部');

  // Sheet options
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);

  // Custom file name prefix
  const [customFileName, setCustomFileName] = useState('');
  const [exporting, setExporting] = useState(false);

  // Calculate current and last month labels
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;

  const thisMonthLabel = `本月 (${currentYear}年${currentMonth}月)`;
  const lastMonthLabel = `上月 (${lastMonthYear}年${lastMonth}月)`;

  // Filter tickets according to chosen options
  const exportableTickets = useMemo(() => {
    let baseList = dataScope === 'filtered' ? filteredTickets : tickets;

    // Apply time range
    if (timeRange !== 'all') {
      baseList = baseList.filter((t) => {
        if (!t.created_at) return false;
        const d = new Date(t.created_at);
        const ticketYear = d.getFullYear();
        const ticketMonth = d.getMonth() + 1;

        if (timeRange === 'this_month') {
          return ticketYear === currentYear && ticketMonth === currentMonth;
        }
        if (timeRange === 'last_month') {
          return ticketYear === lastMonthYear && ticketMonth === lastMonth;
        }
        if (timeRange === 'last_30_days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return d >= thirtyDaysAgo;
        }
        if (timeRange === 'last_90_days') {
          const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          return d >= ninetyDaysAgo;
        }
        if (timeRange === 'custom') {
          if (customStartDate && new Date(t.created_at) < new Date(customStartDate + ' 00:00:00')) {
            return false;
          }
          if (customEndDate && new Date(t.created_at) > new Date(customEndDate + ' 23:59:59')) {
            return false;
          }
          return true;
        }
        return true;
      });
    }

    // Apply internal modal status filter
    if (exportStatus !== '全部') {
      baseList = baseList.filter((t) => t.status === exportStatus);
    }

    // Apply internal modal type filter
    if (exportType !== '全部') {
      baseList = baseList.filter((t) => t.issue_type === exportType);
    }

    return baseList;
  }, [
    dataScope,
    filteredTickets,
    tickets,
    timeRange,
    exportStatus,
    exportType,
    currentYear,
    currentMonth,
    lastMonthYear,
    lastMonth,
    customStartDate,
    customEndDate,
    now,
  ]);

  if (!isOpen) return null;

  // Format date helper
  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const Y = d.getFullYear();
      const M = String(d.getMonth() + 1).padStart(2, '0');
      const D = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${Y}-${M}-${D} ${h}:${m}:${s}`;
    } catch {
      return dateStr;
    }
  };

  // Format duration helper
  const calculateDuration = (startStr?: string | null, endStr?: string | null, status?: string) => {
    if (status !== '已解决' || !startStr || !endStr) {
      return status === '处理中' ? '处理中 (未结案)' : '待排查 (未处置)';
    }
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return '—';
    const diffHours = (end - start) / (1000 * 60 * 60);
    if (diffHours < 1) {
      const minutes = Math.max(1, Math.round((end - start) / (1000 * 60)));
      return `${minutes} 分钟`;
    }
    return `${diffHours.toFixed(1)} 小时`;
  };

  const handleExport = () => {
    if (exportableTickets.length === 0) {
      alert('当前选定范围内无任何报修数据可导出，请调整筛选条件后再试');
      return;
    }
    if (!includeDetails && !includeSummary) {
      alert('请至少勾选一个工作表（工单明细或统计汇总）');
      return;
    }

    setExporting(true);

    try {
      const wb = XLSX.utils.book_new();
      const schoolTitle = schoolName || '耿棚中学';
      const timeTag = new Date().toISOString().slice(0, 10);
      const defaultName = `${schoolTitle}_班班通报修数据报表_${timeTag}.xlsx`;
      const fileName = customFileName.trim()
        ? (customFileName.trim().endsWith('.xlsx') ? customFileName.trim() : `${customFileName.trim()}.xlsx`)
        : defaultName;

      // ==========================================
      // Sheet 1: 报修工单明细清单
      // ==========================================
      if (includeDetails) {
        const detailRows = exportableTickets.map((t, idx) => ({
          '序号': idx + 1,
          '工单编号': `#${t.id}`,
          '所属学校': schoolTitle,
          '设备安装位置': t.location || '—',
          '故障分类': t.issue_type || '硬件故障',
          '报修故障现象与描述': t.description || '',
          '当前处理状态': t.status || '待处理',
          '报修教师姓名': t.teacher_name || '未署名教师',
          '教师联系电话': t.phone || '—',
          '报修设备识别码': t.device_id || '未绑定',
          '报修提交时间': formatDateTime(t.created_at),
          '完工办结时间': formatDateTime(t.resolved_at),
          '维修处理耗时': calculateDuration(t.created_at, t.resolved_at, t.status),
          '运维最新处置回执': t.admin_reply || '暂无回执',
          '跟进互动轮数': t.interactions ? t.interactions.length : 0,
          '现场故障照片链接': t.image_url ? (t.image_url.startsWith('http') ? t.image_url : `${window.location.origin}${t.image_url}`) : '无照片',
        }));

        const wsDetails = XLSX.utils.json_to_sheet(detailRows);

        // Column widths for readability
        wsDetails['!cols'] = [
          { wch: 6 },  // 序号
          { wch: 10 }, // 工单编号
          { wch: 14 }, // 所属学校
          { wch: 22 }, // 设备安装位置
          { wch: 12 }, // 故障分类
          { wch: 36 }, // 故障描述
          { wch: 12 }, // 处理状态
          { wch: 14 }, // 报修教师
          { wch: 15 }, // 联系电话
          { wch: 20 }, // 设备识别码
          { wch: 20 }, // 提交时间
          { wch: 20 }, // 办结时间
          { wch: 15 }, // 处理耗时
          { wch: 32 }, // 处置回执
          { wch: 12 }, // 跟进轮数
          { wch: 30 }, // 照片链接
        ];

        XLSX.utils.book_append_sheet(wb, wsDetails, '报修工单明细');
      }

      // ==========================================
      // Sheet 2: 月度工作量与统计汇总报表 (KPI)
      // ==========================================
      if (includeSummary) {
        const total = exportableTickets.length;
        const pending = exportableTickets.filter((t) => t.status === '待处理').length;
        const processing = exportableTickets.filter((t) => t.status === '处理中').length;
        const resolved = exportableTickets.filter((t) => t.status === '已解决').length;
        const resolveRate = total > 0 ? ((resolved / total) * 100).toFixed(1) + '%' : '0.0%';

        // Calculate average resolution duration for resolved tickets
        let totalDurationHours = 0;
        let resolvedWithDurationCount = 0;
        exportableTickets.forEach((t) => {
          if (t.status === '已解决' && t.created_at && t.resolved_at) {
            const diff = (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
            if (diff >= 0) {
              totalDurationHours += diff;
              resolvedWithDurationCount++;
            }
          }
        });
        const avgHours = resolvedWithDurationCount > 0 ? (totalDurationHours / resolvedWithDurationCount).toFixed(1) + ' 小时' : '—';

        // Distribution by issue type
        const typeCountMap: { [k: string]: number } = {};
        exportableTickets.forEach((t) => {
          const type = t.issue_type || '其他';
          typeCountMap[type] = (typeCountMap[type] || 0) + 1;
        });

        // Distribution by location top 10
        const locCountMap: { [k: string]: number } = {};
        exportableTickets.forEach((t) => {
          const loc = t.location || '未知位置';
          locCountMap[loc] = (locCountMap[loc] || 0) + 1;
        });
        const topLocations = Object.entries(locCountMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        // Build summary sheet rows
        const summaryRows: any[] = [
          { '统计维度 / 指标分类': '【报表基础信息】', '数值 / 内容': '', '说明': '' },
          { '统计维度 / 指标分类': '报表名称', '数值 / 内容': `${schoolTitle} 班班通多媒体教学设备报修工作总结汇总表`, '说明': '正式统计台账' },
          { '统计维度 / 指标分类': '所属租户 / 学校', '数值 / 内容': schoolTitle, '说明': schoolCode ? `租户代码: ${schoolCode}` : '主校区' },
          { '统计维度 / 指标分类': '数据范围与时间段', '数值 / 内容': timeRange === 'all' ? '全部历史记录' : timeRange === 'this_month' ? thisMonthLabel : timeRange === 'last_month' ? lastMonthLabel : timeRange === 'last_30_days' ? '最近30天' : '自定义范围', '说明': `共统计 ${total} 张工单` },
          { '统计维度 / 指标分类': '报表导出时间', '数值 / 内容': formatDateTime(new Date().toISOString()), '说明': '系统即时生成' },
          { '统计维度 / 指标分类': '导出运维人员', '数值 / 内容': `${currentUserName} (${currentUserRole})`, '说明': '经办责任人' },
          { '统计维度 / 指标分类': '', '数值 / 内容': '', '说明': '' },

          { '统计维度 / 指标分类': '【核心服务指标与工作量 KPI】', '数值 / 内容': '', '说明': '' },
          { '统计维度 / 指标分类': '报修工单总量', '数值 / 内容': total, '说明': '所选时间范围内教师提交的总单数' },
          { '统计维度 / 指标分类': '已修复办结量', '数值 / 内容': resolved, '说明': '已现场处置并闭环确认的工单' },
          { '统计维度 / 指标分类': '处理中工单量', '数值 / 内容': processing, '说明': '已接单正在采购配件或排查中' },
          { '统计维度 / 指标分类': '待处理工单量', '数值 / 内容': pending, '说明': '新提交尚未开始检修' },
          { '统计维度 / 指标分类': '工单办结率', '数值 / 内容': resolveRate, '说明': '已办结 / 总报修量' },
          { '统计维度 / 指标分类': '已结工单平均维修历时', '数值 / 内容': avgHours, '说明': '从教师报修至运维标记解决的平均周期' },
          { '统计维度 / 指标分类': '', '数值 / 内容': '', '说明': '' },

          { '统计维度 / 指标分类': '【故障类型分布与占比】', '数值 / 内容': '工单数量 (单)', '说明': '占比 (%)' },
          ...Object.entries(typeCountMap)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => ({
              '统计维度 / 指标分类': `  · ${type}`,
              '数值 / 内容': count,
              '说明': total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%',
            })),
          { '统计维度 / 指标分类': '', '数值 / 内容': '', '说明': '' },

          { '统计维度 / 指标分类': '【高发故障教室 / 方位 TOP 10】', '数值 / 内容': '报修频次 (次)', '说明': '占比 (%)' },
          ...topLocations.map(([loc, count], idx) => ({
            '统计维度 / 指标分类': `  TOP ${idx + 1}: ${loc}`,
            '数值 / 内容': count,
            '说明': total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%',
          })),
        ];

        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        wsSummary['!cols'] = [
          { wch: 32 }, // 指标分类
          { wch: 24 }, // 数值
          { wch: 35 }, // 说明
        ];

        XLSX.utils.book_append_sheet(wb, wsSummary, '月度统计汇总');
      }

      // Write file and trigger download
      try {
        XLSX.writeFile(wb, fileName);
      } catch (writeErr) {
        // Fallback for sandboxed environments or mobile WebViews
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
      }

      if (onExportSuccess) {
        onExportSuccess(fileName, exportableTickets.length);
      }
      onClose();
    } catch (err: any) {
      console.error('Export Excel failed:', err);
      alert('导出 Excel 失败: ' + (err.message || '未知错误'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                导出报修数据报表 (Excel)
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                支持工单明细与月度工作量汇总 · 适配月报总结与数据统计
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="关闭窗口"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-700">
          {/* Current Tenant & Context Summary */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-900 text-xs">
                {schoolName || '耿棚中学'}
              </span>
              <span className="text-[11px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                {schoolCode ? `租户: ${schoolCode}` : '主租户'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              经办运维: <span className="font-semibold text-slate-700">{currentUserName}</span>
            </div>
          </div>

          {/* 1. 数据来源范围选择 */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              1. 导出数据范围
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDataScope('filtered')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  dataScope === 'filtered'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-semibold shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-xs">当前看板筛选结果</div>
                <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                  包含当前搜索与状态筛选 ({filteredTickets.length} 条)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDataScope('all')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  dataScope === 'all'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-semibold shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-xs">当前租户全部记录</div>
                <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                  不限前台搜索条件 ({tickets.length} 条)
                </div>
              </button>
            </div>
          </div>

          {/* 2. 时间跨度（月度总结模式） */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-900 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              2. 统计时间范围（月度总结）
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setTimeRange('all')}
                className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                  timeRange === 'all'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                全部时间
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('this_month')}
                className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                  timeRange === 'this_month'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                {thisMonthLabel}
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('last_month')}
                className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                  timeRange === 'last_month'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                {lastMonthLabel}
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('last_30_days')}
                className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                  timeRange === 'last_30_days'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                最近 30 天
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('last_90_days')}
                className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                  timeRange === 'last_90_days'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                最近 90 天
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('custom')}
                className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                  timeRange === 'custom'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                自定义区间
              </button>
            </div>

            {timeRange === 'custom' && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white flex-1"
                />
                <span className="text-slate-400">至</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white flex-1"
                />
              </div>
            )}
          </div>

          {/* 3. 补充状态与类型过滤 */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-400" />
                工单状态过滤
              </label>
              <select
                value={exportStatus}
                onChange={(e) => setExportStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="全部">全部状态</option>
                <option value="待处理">待处理</option>
                <option value="处理中">处理中</option>
                <option value="已解决">已解决</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-400" />
                故障类别过滤
              </label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="全部">全部类型</option>
                <option value="硬件故障">硬件故障</option>
                <option value="软件系统">软件系统</option>
                <option value="网络问题">网络问题</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>

          {/* 4. 工作表包含内容 */}
          <div className="space-y-1.5 pt-1">
            <label className="font-bold text-slate-900 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-slate-500" />
              3. 生成的 Excel 工作表 (Sheet)
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800">
                    工作表 1：报修工单明细清单 (`报修工单明细`)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    包含工单编号、设备位置、故障类别、描述、报修人、联系电话、提交时间、办结时间、处置回执、维修耗时、照片等
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800">
                    工作表 2：月度工作量与统计汇总报表 (`月度统计汇总`)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    包含工作量指标（总单量、办结率、平均维修耗时）、故障类型占比分布、高发故障教室 TOP 10，方便直接撰写月度报告
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 5. 自定义导出文件名 */}
          <div className="space-y-1 pt-1">
            <label className="text-[11px] font-semibold text-slate-600">
              导出文件名 (可自定义):
            </label>
            <input
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              placeholder={`${schoolName || '耿棚中学'}_班班通报修数据报表_${now.toISOString().slice(0, 10)}.xlsx`}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>

          {/* 匹配记录总数提示 */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
            <span className="text-emerald-900 font-medium">
              当前条件共筛选匹配到：
              <span className="font-bold text-base text-emerald-700 ml-1">
                {exportableTickets.length}
              </span> 条报修记录
            </span>
            <span className="text-[11px] text-emerald-700">
              格式: 标准 Excel (.xlsx)
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || exportableTickets.length === 0}
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer ${
              exporting || exportableTickets.length === 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? '正在生成报表...' : `确认导出 Excel 文件 (${exportableTickets.length} 条)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
