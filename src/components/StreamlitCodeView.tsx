import React, { useState, useEffect } from 'react';
import { Copy, Check, Terminal, ExternalLink, Download, FileCode, CheckCircle2 } from 'lucide-react';

export const StreamlitCodeView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<'app.py' | 'requirements.txt' | 'render.yaml' | 'Procfile' | 'README.md'>('app.py');
  const [fileContents, setFileContents] = useState<{ [key: string]: string }>({});
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchFile = async (fn: string) => {
      if (fileContents[fn]) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/files/${fn}`);
        const text = await res.text();
        setFileContents((prev) => ({ ...prev, [fn]: text }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchFile(selectedFile);
  }, [selectedFile]);

  const handleCopy = () => {
    const content = fileContents[selectedFile] || '';
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = fileContents[selectedFile] || '';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* 顶部介绍 */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-xl shadow-xs border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-600 rounded-md">
                <Terminal className="w-5 h-5 text-white" />
              </span>
              <h2 className="text-xl font-bold tracking-tight">Python + Streamlit 源码与 Render 部署专区</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
              这里提供了为您定制的完整、可直接部署在 <strong>Render.com</strong> 的 Python + Streamlit 项目文件。
              已集成您的 <strong>Neon PostgreSQL</strong> 连接池和 <strong>Cloudinary</strong> 云图床，开箱即用。
            </p>
          </div>

          <a
            href="https://dashboard.render.com"
            target="_blank"
            rel="noopener noreferrer"
            className="self-start sm:self-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
          >
            前往 Render.com 部署 <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Render 部署 3 步速查 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs">1</span>
            推送到 GitHub
          </div>
          <p className="text-xs text-slate-600 leading-normal">
            将当前项目文件（<code>app.py</code>、<code>requirements.txt</code> 等）提交并推送到您的 GitHub 个人仓库。
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs">2</span>
            新建 Render Web Service
          </div>
          <p className="text-xs text-slate-600 leading-normal">
            选择 Python 3 环境，Build 命令填 <code>pip install -r requirements.txt</code>，启动命令见下文。
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm mb-1">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">3</span>
            自动运行与自动建表
          </div>
          <p className="text-xs text-slate-600 leading-normal">
            启动时 <code>app.py</code> 会自动连接 Neon 执行建表，教师与管理员随时可通过公网域名访问！
          </p>
        </div>
      </div>

      {/* 文件切换与查看器 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* 文件切换栏 */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['app.py', 'requirements.txt', 'render.yaml', 'Procfile', 'README.md'] as const).map((fn) => (
              <button
                key={fn}
                onClick={() => setSelectedFile(fn)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  selectedFile === fn
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                {fn}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md flex items-center gap-1 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  已复制到剪贴板
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  复制代码
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载文件
            </button>
          </div>
        </div>

        {/* 代码展示主体 */}
        <div className="p-4 bg-slate-950 font-mono text-xs text-slate-200 overflow-x-auto max-h-[600px] leading-relaxed">
          {loading ? (
            <div className="text-slate-400 py-12 text-center">正在加载文件内容...</div>
          ) : (
            <pre className="whitespace-pre">
              <code>{fileContents[selectedFile] || '读取中...'}</code>
            </pre>
          )}
        </div>

        {/* 底部部署命令提示 */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Render.com 启动命令 (Start Command)：
          </div>
          <div className="bg-white p-2.5 rounded-md border border-slate-200 font-mono text-[11px] text-slate-800 select-all overflow-x-auto">
            streamlit run app.py --server.port $PORT --server.address 0.0.0.0 --server.headless true --server.enableCORS false --server.enableXsrfProtection false
          </div>
        </div>
      </div>
    </div>
  );
};
