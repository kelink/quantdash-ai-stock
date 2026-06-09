import React, { useState, useRef, useEffect } from 'react';
import { Activity, Bell, Grid, Settings, Moon, Sun, User, LogOut, ChevronDown, Lock } from 'lucide-react';
import { SyncRuntimeStatus, SyncStatusPayload } from '../types';
import { useAuth } from './auth/AuthContext';
import AuthModal from './auth/AuthModal';

interface HeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
  syncStatus: SyncStatusPayload | null;
  runtimeStatus: SyncRuntimeStatus;
}

const Header: React.FC<HeaderProps> = ({ isDark, toggleTheme, syncStatus, runtimeStatus }) => {
  const { isAuthenticated, username, loading, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showUserMenu]);

  const isRunning = runtimeStatus.state === 'running';
  const hasFailure = syncStatus?.overallStatus === 'failed';
  const statusText = isRunning
    ? '数据同步中'
    : hasFailure
      ? '最近同步异常'
      : '数据已就绪';
  const statusDotClass = isRunning
    ? 'bg-cyan-500 animate-pulse'
    : hasFailure
      ? 'bg-amber-500'
      : 'bg-green-500 animate-pulse';
  const latestTradingDate = syncStatus?.onlineTradingDate ?? '--';

  const userInitial = username ? username.charAt(0).toUpperCase() : '?';

  return (
    <>
      <header className={`h-16 border-b flex items-center justify-between px-6 sticky top-0 z-50 backdrop-blur-md transition-colors
        ${isDark ? 'border-white/5 bg-black/20' : 'border-slate-200 bg-white/60'}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 dark:from-white dark:to-gray-400 font-sans tracking-tight">
            Quant<span className="text-cyan-500 dark:text-cyan-400">Dash</span>
          </h1>
          <div className={`ml-8 hidden md:flex gap-1 p-1 rounded-lg transition-colors ${isDark ? 'bg-white/5' : 'bg-slate-200/50'}`}>
            <button className={`px-3 py-1 text-xs font-medium rounded-md shadow-sm transition-all ${isDark ? 'bg-white/10 text-white' : 'bg-white text-slate-800 shadow-sm'}`}>沪深</button>
            <button className={`px-3 py-1 text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>港股</button>
            <button className={`px-3 py-1 text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>美股</button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4 text-sm font-mono mr-4 transition-colors text-slate-500 dark:text-gray-400">
             <span className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`}></span>
              {statusText}
             </span>
             <span>交易日: {latestTradingDate}</span>
          </div>

          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button className={`p-2 rounded-lg transition-colors relative ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>
            <Bell size={18} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-gray-900"></span>
          </button>

          {/* User area */}
          {loading ? (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isAuthenticated ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors
                  ${isDark ? 'hover:bg-white/10 text-gray-200' : 'hover:bg-slate-100 text-slate-700'}`}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                  {userInitial}
                </div>
                <span className="text-sm font-medium max-w-[80px] truncate hidden sm:block">{username}</span>
                <ChevronDown size={14} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''} hidden sm:block`} />
              </button>

              {showUserMenu && (
                <div className={`absolute right-0 mt-2 w-48 rounded-xl border shadow-xl overflow-hidden z-[60] transition-colors
                  ${isDark ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'}`}
                >
                  <div className={`px-4 py-3 border-b text-sm transition-colors ${isDark ? 'border-white/5 text-gray-400' : 'border-slate-100 text-slate-500'}`}>
                    已登录为 <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>{username}</span>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors
                      ${isDark ? 'text-gray-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Lock size={15} />
                    修改密码
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors border-t
                      ${isDark ? 'text-red-400 hover:bg-white/10 border-white/5' : 'text-red-500 hover:bg-slate-50 border-slate-100'}`}
                  >
                    <LogOut size={15} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200
                bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/20 hover:shadow-cyan-900/40 hover:scale-[1.02] active:scale-[0.98]`}
            >
              <User size={15} />
              登录
            </button>
          )}
        </div>
      </header>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal isDark={isDark} onClose={() => setShowAuthModal(false)} />
      )}
    </>
  );
};

export default Header;
