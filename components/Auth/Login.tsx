import React, { useState } from 'react';
import { signIn, translateAuthErrorMessage } from '../../services/supabaseService';

interface LoginProps {
  onSwitchToRegister: () => void;
  onSwitchToReset: () => void;
  onLoginSuccess: () => void;
  isConfigured: boolean;
}

const Login: React.FC<LoginProps> = ({
  onSwitchToRegister,
  onSwitchToReset,
  onLoginSuccess,
  isConfigured
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    try {
      const { user, error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(translateAuthErrorMessage(signInError.message));
        return;
      }

      if (user) {
        onLoginSuccess();
      }
    } catch (err) {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">智专易</h1>
          <p className="text-slate-400">登录您的账户</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
              邮箱地址
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {!isConfigured && (
            <div className="bg-amber-500/15 border border-amber-400/30 rounded-lg p-3 text-amber-100 text-sm">
              当前使用本地 Mock 认证模式，账户和登录态仅保存在当前浏览器。
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                登录中...
              </>
            ) : (
              '登录'
            )}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onSwitchToReset}
            className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            忘记密码？
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500">或</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            onClick={onSwitchToRegister}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-all border border-white/10"
          >
            注册新账户
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;