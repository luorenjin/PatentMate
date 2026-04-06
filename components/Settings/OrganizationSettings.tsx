import React, { useState, useEffect } from 'react';
import {
  Organization,
  getOrganization,
  updateOrganization,
} from '../../services/organizationService';

interface OrganizationSettingsProps {
  organizationId: string;
  onBack: () => void;
}

const OrganizationSettings: React.FC<OrganizationSettingsProps> = ({
  organizationId,
  onBack,
}) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const org = getOrganization(organizationId);
    if (org) {
      setOrganization(org);
      setName(org.name);
    }
  }, [organizationId]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('组织名称不能为空');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = updateOrganization(organizationId, { name: name.trim() });
      if (updated) {
        setOrganization(updated);
        setIsEditing(false);
        setSuccess('保存成功');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('保存失败，请重试');
      }
    } catch (err) {
      setError('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (organization) {
      setName(organization.name);
    }
    setIsEditing(false);
    setError(null);
  };

  if (!organization) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-center text-slate-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h1 className="text-xl font-semibold text-slate-900">组织设置</h1>
          <p className="text-sm text-slate-500 mt-1">管理您的组织信息</p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* Organization Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              组织名称
            </label>
            {isEditing ? (
              <div className="flex gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                  placeholder="输入组织名称"
                />
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-slate-900 font-medium">{organization.name}</span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  编辑
                </button>
              </div>
            )}
          </div>

          {/* Team Members (Read-only for MVP) */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">团队成员</h3>
            <div className="bg-slate-50 rounded-lg p-4">
              {organization.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center text-sm font-medium text-slate-600">
                      {member.email ? member.email[0].toUpperCase() : '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {member.email || '未设置邮箱'}
                      </p>
                      <p className="text-xs text-slate-500">
                        加入于 {new Date(member.joinedAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    member.role === 'owner'
                      ? 'bg-purple-100 text-purple-700'
                      : member.role === 'admin'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {member.role === 'owner' ? '所有者' : member.role === 'admin' ? '管理员' : '成员'}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              团队管理功能将在后续版本中开放
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizationSettings;