import React, { useState } from 'react';
import { X, Eye, EyeOff, User, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from './AuthContext';

type AuthMode = 'login' | 'register';

interface AuthModalProps {
  isDark: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isDark, onClose }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('请填写用户名和密码');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className={`relative w-full max-w-md mx-4 rounded-2xl border shadow-2xl overflow-hidden transition-colors
        ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors z-10
            ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'}`}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className={`px-8 pt-10 pb-6 text-center border-b transition-colors ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
          <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <User size={28} className="text-white" />
          </div>
          <h2 className={`text-2xl font-bold transition-colors ${isDark ? 'text-white' : 'text-slate-800'}`}>
            {mode === 'login' ? '欢迎回来' : '创建账号'}
          </h2>
          <p className={`mt-1 text-sm transition-colors ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            {mode === 'login' ? '登录以使用完整功能' : '注册后即可同步自选与配置'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {/* Error */}
          {error && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm border transition-colors
              ${isDark ? 'bg-red-900/20 border-red-800/30 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}`}
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Username */}
          <div>
            <label className={`block text-sm font-medium mb-1.5 transition-colors ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
              用户名
            </label>
            <div className="relative">
              <User size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-gray-500' : 'text-slate-400'}`} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-32位字母、数字、下划线"
                maxLength={32}
                className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm border outline-none transition-all duration-200
                  focus:ring-2 focus:ring-cyan-500/30
                  ${isDark
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-gray-500 focus:border-cyan-500'
                    : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-cyan-400'
                  }`}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className={`block text-sm font-medium mb-1.5 transition-colors ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
              密码
            </label>
            <div className="relative">
              <Lock size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-gray-500' : 'text-slate-400'}`} />
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? '至少8位，含大小写字母和数字' : '输入密码'}
                maxLength={128}
                className={`w-full pl-10 pr-11 py-3 rounded-xl text-sm border outline-none transition-all duration-200
                  focus:ring-2 focus:ring-cyan-500/30
                  ${isDark
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-gray-500 focus:border-cyan-500'
                    : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-cyan-400'
                  }`}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600
              hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-900/20 hover:shadow-cyan-900/40
              transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed
              active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>

          {/* Switch mode */}
          <p className={`text-center text-sm transition-colors ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button
              type="button"
              onClick={switchMode}
              className="ml-1 font-medium text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              {mode === 'login' ? '立即注册' : '立即登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
