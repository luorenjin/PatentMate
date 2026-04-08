import React, { useEffect, useState } from 'react';
import {
  resetPassword,
  translateAuthErrorMessage,
  updatePassword,
} from '../../services/supabaseService';
import type { AuthNotice } from '../../types';

interface PasswordResetProps {
  mode: 'request' | 'update';
  onSwitchToLogin: () => void;
  isConfigured: boolean;
  notice?: AuthNotice | null;
  onClearNotice?: () => void;
  onPasswordUpdated?: () => void;
}

const PasswordReset: React.FC<PasswordResetProps> = ({
  mode,
  onSwitchToLogin,
  isConfigured,
  notice,
  onClearNotice,
  onPasswordUpdated,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setError(null);
    setSuccess(false);
    setLoading(false);
    setPassword('');
    setConfirmPassword('');
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    onClearNotice?.();

    if (mode === 'request') {
      if (!email) {
        setError('请输入邮箱地址');
        return;
      }
    } else {
      if (!password || !confirmPassword) {
        setError('请填写新密码和确认密码');
        return;
      }

      if (password.length < 6) {
        setError('密码至少需要6个字符');
        return;
      }

      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'request') {
        const { error: resetError } = await resetPassword(email);
        if (resetError) {
          setError(translateAuthErrorMessage(resetError.message));
          return;
        }
      } else {
        const { error: updateError } = await updatePassword(password);
        if (updateError) {
          setError(translateAuthErrorMessage(updateError.message));
          return;
        }
      }

      setSuccess(true);
    } catch (err) {
      setError(mode === 'request' ? '请求失败，请稍后重试' : '密码更新失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const isUpdateMode = mode === 'update';

    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {isUpdateMode ? '密码已更新' : '邮件已发送'}
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              {isUpdateMode
                ? '新密码已经生效，您现在可以继续进入系统。'
                : isConfigured
                  ? `我们已向 ${email} 发送了密码重置链接，请查收邮件并按照指引完成重置。`
                  : `已模拟处理 ${email} 的密码重置请求。当前为本地 Mock 模式，不会真的发送邮件。`}
            </p>
            <button
              onClick={() => {
                if (isUpdateMode) {
                  onPasswordUpdated?.();
                  return;
                }
                onSwitchToLogin();
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all"
            >
              {isUpdateMode ? '返回应用' : '返回登录'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isUpdateMode = mode === 'update';

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            {isUpdateMode ? '设置新密码' : '重置密码'}
          </h1>
          <p className="text-slate-400">
            {isUpdateMode ? '请输入新的登录密码' : '请输入您的邮箱地址'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {notice && (
            <div className={`rounded-lg p-3 text-sm border ${
              notice.tone === 'error'
                ? 'bg-red-500/20 border-red-500/50 text-red-200'
                : notice.tone === 'success'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                  : 'bg-sky-500/20 border-sky-500/50 text-sky-200'
            }`}>
              {notice.message}
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          {isUpdateMode ? (
            <>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                  新密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                  placeholder="至少6个字符"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
                  确认新密码
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                  placeholder="再次输入新密码"
                  disabled={loading}
                />
              </div>
            </>
          ) : (
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
          )}

          {!isConfigured && !isUpdateMode && (
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
                {isUpdateMode ? '保存中...' : '发送中...'}
              </>
            ) : (
              isUpdateMode ? '保存新密码' : '发送重置邮件'
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="text-sm text-slate-400">想起密码了？</span>
          <button
            onClick={() => {
              onClearNotice?.();
              onSwitchToLogin();
            }}
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