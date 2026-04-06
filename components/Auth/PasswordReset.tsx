import React, { useState } from 'react';
import { resetPassword, translateAuthErrorMessage } from '../../services/supabaseService';

interface PasswordResetProps {
  onSwitchToLogin: () => void;
  isConfigured: boolean;
}

const PasswordReset: React.FC<PasswordResetProps> = ({
  onSwitchToLogin,
  isConfigured
}) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('请输入邮箱地址');
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await resetPassword(email);

      if (resetError) {
        setError(translateAuthErrorMessage(resetError.message));
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError('请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">邮件已发送</h2>
            <p className="text-slate-400 text-sm mb-6">
              {isConfigured
                ? `我们已向 ${email} 发送了密码重置链接，请查收邮件并按照指引重置密码。`
                : `已模拟处理 ${email} 的密码重置请求。当前为本地 Mock 模式，不会真的发送邮件。`}
            </p>
            <button
              onClick={onSwitchToLogin}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">重置密码</h1>
          <p className="text-slate-400">请输入您的邮箱地址</p>
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

          {!isConfigured && (
            <div className="bg-amber-500/15 border border-amber-400/30 rounded-lg p-3 text-amber-100 text-sm">
              当前使用本地 Mock 认证模式，仅验证邮箱是否存在于当前浏览器的测试账户中。
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
                发送中...
              </>
            ) : (
              '发送重置邮件'
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="text-sm text-slate-400">想起密码了？</span>
          <button
            onClick={onSwitchToLogin}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            立即登录
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordReset;