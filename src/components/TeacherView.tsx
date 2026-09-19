import React, { useState, useEffect } from 'react';
import { Ticket, SystemConfig } from '../types';
import { LocationSelector, DEFAULT_LOCATION_CONFIG } from './LocationSelector';
import { AiChatModal } from './AiChatModal';
import {
  Send,
  Camera,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Check,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface TeacherViewProps {
  onTicketSubmitted?: () => void;
}

export const TeacherView: React.FC<TeacherViewProps> = ({ onTicketSubmitted }) => {
  const [activeTab, setActiveTab] = useState<'submit' | 'query'>('submit');

  // System Config state
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    locations: DEFAULT_LOCATION_CONFIG,
    issue_types: [
      { name: '硬件故障', desc: '投影灯泡、幕布升降、触摸失灵、电源开不了机' },
      { name: '软件系统', desc: '教学软件闪退、系统蓝屏、音视频解码异常' },
      { name: '网络问题', desc: '教室网线断连、无网络信号、无法打开网页' },
      { name: '其他', desc: '话筒啸叫、功放无声、遥控器失灵等' },
    ],
  });

  useEffect(() => {
    fetch('/api/system-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.locations && data.issue_types) {
          setSystemConfig(data);
          if (data.issue_types.length > 0 && !data.issue_types.some((it: any) => it.name === issueType)) {
            setIssueType(data.issue_types[0].name);
          }
        }
      })
      .catch((err) => console.error('Failed to load system config:', err));
  }, []);

  // Submit form state
  const [location, setLocation] = useState('东区 一号楼 1楼 东1');
  const [issueType, setIssueType] = useState('硬件故障');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Ticket | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // AI Chat modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Query state
  const [searchLocation, setSearchLocation] = useState('');
  const [queryResults, setQueryResults] = useState<Ticket[]>([]);
  const [querying, setQuerying] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      setErrorMsg('请选择或输入设备位置');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('请填写具体的故障现象描述');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('location', location.trim());
      formData.append('issue_type', issueType);
      formData.append('description', description.trim());
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await fetch('/api/tickets', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '提交失败，请稍后重试');
      }

      setSubmitSuccess(data.ticket);
      // Reset form
      setDescription('');
      setImageFile(null);
      setImagePreview(null);
      if (onTicketSubmitted) onTicketSubmitted();
    } catch (err: any) {
      setErrorMsg(err.message || '网络连接异常，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchLocation.trim()) return;

    setQuerying(true);
    try {
      const res = await fetch(`/api/tickets?location=${encodeURIComponent(searchLocation.trim())}`);
      const data = await res.json();
      setQueryResults(Array.isArray(data) ? data : []);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setQuerying(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '待处理':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            待处理
          </span>
        );
      case '处理中':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
            处理中
          </span>
        );
      case '已解决':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            已解决
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">
      {/* AI 对话弹窗 */}
      <AiChatModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} />

      {/* 顶部服务台通知 + AI 入口按钮 */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">班班通多媒体教学设备报修台</h2>
          <p className="text-xs sm:text-sm text-blue-100 mt-1">
            投影仪、触控黑板、讲台电脑或音响网络故障？选择设备位置拍照报修，运维教师将及时排查维修。
          </p>
        </div>

        <button
          onClick={() => setIsAiModalOpen(true)}
          className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95"
        >
          <Sparkles className="w-4 h-4 text-slate-900" />
          <span>在线咨询 AI 助手</span>
        </button>
      </div>

      {/* 模式切换选项卡 */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl shadow-2xs p-1">
        <button
          id="tab-submit-report"
          onClick={() => setActiveTab('submit')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'submit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Send className="w-4 h-4" />
          填写设备报修
        </button>
        <button
          id="tab-query-progress"
          onClick={() => setActiveTab('query')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'query'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4" />
          查询报修进度
        </button>
      </div>

      {/* TAB 1: 提交表单 */}
      {activeTab === 'submit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
          {submitSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                报修提交成功！工单编号 #{submitSuccess.id}
              </div>
              <p className="text-sm text-emerald-700">
                设备位置：<span className="font-semibold">{submitSuccess.location}</span> | 故障类型：{submitSuccess.issue_type}
              </p>
              <p className="text-xs text-emerald-600">
                工单已提交至运维管理中心，信息技术老师已收到提醒，将尽快为您处理！
              </p>
              <button
                onClick={() => setSubmitSuccess(null)}
                className="mt-1 text-xs text-emerald-800 underline hover:text-emerald-900 cursor-pointer"
              >
                关闭提示并继续提交
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 设备位置：级联下拉与手动输入组件 */}
            <LocationSelector
              value={location}
              onChange={(val) => setLocation(val)}
              config={systemConfig.locations}
              required={true}
            />

            {/* 故障分类 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                故障分类 <span className="text-rose-500">*</span>
              </label>
              <select
                id="select-issue-type"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {systemConfig.issue_types.map((it) => (
                  <option key={it.name} value={it.name}>
                    {it.name} {it.desc ? `(${it.desc})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 详细描述 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                故障现象描述 <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="textarea-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请简要描述具体的故障情况，例如：按电源键投影机红灯高频闪烁、触控笔偏移约2厘米无法校准、音箱杂音大等..."
                rows={3}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
              />
            </div>

            {/* 图片上传 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                现场故障照片 (推荐上传，便于老师备件)
              </label>

              {!imagePreview ? (
                <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 hover:bg-blue-50/40">
                  <div className="p-2.5 bg-blue-100 rounded-full text-blue-600 mb-1.5">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-700">点击拍照或上传现场图片</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">支持手机相机拍照或相册图片</span>
                  <input
                    id="input-file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center gap-4">
                  <img
                    src={imagePreview}
                    alt="现场预览"
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-800 truncate">
                      <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
                      {imageFile?.name || '已选照片'}
                    </div>
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                      <Check className="w-3.5 h-3.5" /> 准备就绪，提交时上传
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                    title="移除图片"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* 提交按钮 */}
            <div className="pt-2">
              <button
                id="btn-submit-repair"
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    正在提交工单...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    立即提交报修工单
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: 进度查询 */}
      {activeTab === 'query' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <form onSubmit={handleQuery} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  id="input-search-location"
                  type="text"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder="输入设备位置关键词（如：东区、2号楼、微机室）"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                id="btn-search-tickets"
                type="submit"
                disabled={querying}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {querying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                查询
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-xs text-slate-500 mr-1 self-center">快捷搜索:</span>
              {['东区 1号楼', '东区 2号楼', '西区 1楼', '西区 2楼', '微机室'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setSearchLocation(k);
                    setTimeout(() => {
                      fetch(`/api/tickets?location=${encodeURIComponent(k)}`)
                        .then((res) => res.json())
                        .then((data) => {
                          setQueryResults(Array.isArray(data) ? data : []);
                          setHasSearched(true);
                        });
                    }, 50);
                  }}
                  className="text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* 查询结果列表 */}
          {hasSearched && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  共检索到 <strong className="text-slate-800">{queryResults.length}</strong> 条记录
                </span>
                <span>按报修时间倒序排列</span>
              </div>

              {queryResults.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700">未找到相关报修记录</p>
                  <p className="text-xs text-slate-500 mt-1">请尝试输入更简略的关键词（如“东区”）</p>
                </div>
              ) : (
                queryResults.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">📍 {ticket.location}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                          #{ticket.id}
                        </span>
                      </div>
                      {getStatusBadge(ticket.status)}
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                      <span>分类：<strong>{ticket.issue_type}</strong></span>
                      <span>报修时间：{formatDate(ticket.created_at)}</span>
                      {ticket.resolved_at && (
                        <span className="text-emerald-600 font-medium">
                          解决时间：{formatDate(ticket.resolved_at)}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">故障说明：</span>
                      {ticket.description}
                    </div>

                    {ticket.image_url && (
                      <div>
                        <span className="text-xs text-slate-500 block mb-1">现场照片：</span>
                        <a
                          href={ticket.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                        >
                          <img
                            src={ticket.image_url}
                            alt="现场故障照"
                            className="w-32 h-24 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity"
                          />
                        </a>
                      </div>
                    )}

                    {ticket.admin_reply ? (
                      <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-lg text-sm text-blue-900">
                        <div className="font-semibold text-blue-800 text-xs mb-1">
                          🛠️ 运维维修教师回复与处理反馈：
                        </div>
                        <p className="text-xs sm:text-sm">{ticket.admin_reply}</p>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 flex items-center gap-1 bg-slate-50 p-2 rounded">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        运维教师尚未填写处理回复，正在排查中...
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
