import { type User } from '@supabase/supabase-js';
import React, { Suspense, lazy, useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import { AppView, type AuthNotice, type AuthView, type PatentData } from './types';
import { savePatentToStorage, createNewPatentData } from './services/storageService';
import {
  getSession,
  handleAuthCallback,
  isSupabaseConfigured,
  onAuthStateChange,
  signOut as supabaseSignOut,
  translateAuthErrorMessage,
} from './services/supabaseService';
import {
  associatePatentsWithUser,
  getOrCreateDefaultOrganization,
  syncOrganizationOwnerMember,
  type Organization,
} from './services/organizationService';
import {
  ensureUserProfile,
  type UserProfile,
} from './services/userProfileService';
import { canNavigateToWorkflowStage, getRecommendedViewForPatent } from './workflow';

const ChatAssistant = lazy(() => import('./components/ChatAssistant'));
const NoveltySearch = lazy(() => import('./components/NoveltySearch'));
const DraftingContainer = lazy(() => import('./components/Drafting/DraftingContainer'));
const Editor = lazy(() => import('./components/Editor'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const PatentDraft = lazy(() => import('./components/PatentDraft'));

const Login = lazy(() => import('./components/Auth/Login'));
const Register = lazy(() => import('./components/Auth/Register'));
const PasswordReset = lazy(() => import('./components/Auth/PasswordReset.tsx'));
const OrganizationSettings = lazy(() => import('./components/Settings/OrganizationSettings.tsx'));

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [patentData, setPatentData] = useState<PatentData | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authView, setAuthView] = useState<AuthView>('LOGIN');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentOrgName, setCurrentOrgName] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);

  const supabaseConfigured = isSupabaseConfigured();

  // P0-1: Auto-save heartbeat mechanism (30s debounce)
  useEffect(() => {
    if (!patentData) {
      return;
    }

    const autoSaveTimer = window.setTimeout(() => {
      void (async () => {
        const { error } = await savePatentToStorage(patentData);
        if (error) {
          console.warn('Auto-save failed (background):', error.message);
        } else {
          console.debug('Auto-saved patent draft:', patentData.id);
        }
      })();
    }, 30000); // 30 seconds debounce

    return () => {
      window.clearTimeout(autoSaveTimer);
    };
  }, [patentData]);

  const clearAuthContext = () => {
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setCurrentOrgId(null);
    setCurrentOrgName(null);
    setCurrentUserProfile(null);
  };

  const showNotification = (message: string) => {
    setNotification(message);
    window.setTimeout(() => setNotification(null), 3000);
  };

  const syncAuthenticatedUser = async (user: User | null) => {
    if (!user) {
      clearAuthContext();
      return;
    }

    const profile = await ensureUserProfile(user);
    const organization = await getOrCreateDefaultOrganization(user.id, {
      ownerEmail: user.email ?? '',
      ownerName: profile.name,
      ownerTitle: profile.jobTitle,
      preferredName: profile.defaultOrganizationName,
    });
    const syncedOrganization = await syncOrganizationOwnerMember(organization.id, {
      userId: user.id,
      email: user.email ?? organization.ownerEmail,
      name: profile.name,
      title: profile.jobTitle,
    }) || organization;

    setIsAuthenticated(true);
    setCurrentUserId(user.id);
    setCurrentOrgId(syncedOrganization.id);
    setCurrentOrgName(syncedOrganization.name);
    setCurrentUserProfile(profile);

    await associatePatentsWithUser(user.id, syncedOrganization.id);
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      const callbackResult = await handleAuthCallback();
      if (!isMounted) {
        return;
      }

      if (callbackResult.notice) {
        setAuthNotice(callbackResult.notice);
      }

      if (callbackResult.nextAuthView) {
        setAuthView(callbackResult.nextAuthView);
      }

      const session = callbackResult.session ?? (await getSession());
      if (!isMounted) {
        return;
      }

      await syncAuthenticatedUser(session?.user ?? null);
    };

    void initializeAuth();

    const unsubscribe = onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === 'SIGNED_OUT') {
        clearAuthContext();
        setAuthView('LOGIN');
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('PASSWORD_UPDATE');
        setAuthNotice({ tone: 'info', message: '验证通过，请设置新密码。' });
      }

      if (session?.user) {
        void syncAuthenticatedUser(session.user);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleLoginSuccess = () => {
    setAuthNotice(null);
  };

  const handleRegisterSuccess = () => {
    setAuthView('LOGIN');
    setAuthNotice({
      tone: 'info',
      message: '验证邮件已发送，请到邮箱完成激活。',
    });
  };

  const handlePasswordUpdated = () => {
    setAuthView('LOGIN');
    setAuthNotice(null);
    showNotification('密码已更新');
  };

  const handleSignOut = async () => {
    await supabaseSignOut();
    setAuthNotice(null);
    clearAuthContext();
    setPatentData(null);
    setCurrentView(AppView.DASHBOARD);
  };

  const updatePatentData = (key: keyof PatentData, value: any) => {
    if (!patentData) {
      return;
    }

    setPatentData((previous) =>
      previous
        ? {
            ...previous,
            [key]: value,
            userId: currentUserId || previous.userId,
            organizationId: currentOrgId || previous.organizationId,
          }
        : null,
    );
  };

  const handleSave = () => {
    if (patentData) {
      void (async () => {
        const { error } = await savePatentToStorage(patentData);
        if (error) {
          showNotification(`草稿已保存到本地：${translateAuthErrorMessage(error.message)}`);
          return;
        }

        showNotification('保存成功！已同步到数据库');
      })();
    }
  };

  const handleCreateNew = () => {
    const newPatent = createNewPatentData();
    if (currentUserId) {
      newPatent.userId = currentUserId;
    }
    if (currentOrgId) {
      newPatent.organizationId = currentOrgId;
    }
    setPatentData(newPatent);
    setCurrentView(AppView.DISCLOSURE);
  };

  const handleOpenPatent = (patent: PatentData) => {
    setPatentData(patent);
    setCurrentView(getRecommendedViewForPatent(patent));
  };

  const handleBackToDashboard = () => {
    if (patentData) {
      void savePatentToStorage(patentData);
    }
    setPatentData(null);
    setCurrentView(AppView.DASHBOARD);
  };

  const handleSidebarNavigation = (view: AppView) => {
    const getNavigationStatus = (targetView: AppView, currentPatent: PatentData) => {
      if (currentPatent.status === 'ready_to_submit') {
        return currentPatent.status;
      }

      switch (targetView) {
        case AppView.NOVELTY_SEARCH:
          return currentPatent.status === 'disclosure_collecting'
            ? 'disclosure_review'
            : currentPatent.status;
        case AppView.DRAFTER:
          return currentPatent.status === 'disclosure_collecting' || currentPatent.status === 'disclosure_review'
            ? 'drafting'
            : currentPatent.status;
        case AppView.EDITOR:
          return 'editing';
        default:
          return currentPatent.status;
      }
    };

    if (view === AppView.DASHBOARD) {
      handleBackToDashboard();
      return;
    }

    if (view === AppView.SETTINGS) {
      setCurrentView(AppView.SETTINGS);
      return;
    }

    if (!patentData) {
      return;
    }

    if (!canNavigateToWorkflowStage(view, patentData)) {
      return;
    }

    const nextStatus = getNavigationStatus(view, patentData);
    if (nextStatus !== patentData.status) {
      setPatentData((previous) =>
        previous ? { ...previous, status: nextStatus } : null,
      );
    }

    setCurrentView(view);
  };

  const renderAuthView = () => {
    if (authView === 'REGISTER') {
      return (
        <Register
          onSwitchToLogin={() => setAuthView('LOGIN')}
          onRegisterSuccess={handleRegisterSuccess}
          isConfigured={supabaseConfigured}
          notice={authNotice}
          onClearNotice={() => setAuthNotice(null)}
        />
      );
    }

    if (authView === 'PASSWORD_RESET' || authView === 'PASSWORD_UPDATE') {
      return (
        <PasswordReset
          mode={authView === 'PASSWORD_UPDATE' ? 'update' : 'request'}
          onSwitchToLogin={() => setAuthView('LOGIN')}
          isConfigured={supabaseConfigured}
          notice={authNotice}
          onClearNotice={() => setAuthNotice(null)}
          onPasswordUpdated={handlePasswordUpdated}
        />
      );
    }

    return (
      <Login
        onSwitchToRegister={() => setAuthView('REGISTER')}
        onSwitchToReset={() => setAuthView('PASSWORD_RESET')}
        onLoginSuccess={handleLoginSuccess}
        isConfigured={supabaseConfigured}
        notice={authNotice}
        onClearNotice={() => setAuthNotice(null)}
      />
    );
  };

  const renderView = () => {
    if (currentView === AppView.SETTINGS && currentOrgId && currentUserId) {
      return (
        <OrganizationSettings
          organizationId={currentOrgId}
          userId={currentUserId}
          onBack={() => setCurrentView(AppView.DASHBOARD)}
          onOrganizationUpdated={(organization: Organization) => setCurrentOrgName(organization.name)}
          onProfileUpdated={(profile: UserProfile) => setCurrentUserProfile(profile)}
          onPlanUpdated={() => setQuotaRefreshKey((previous) => previous + 1)}
        />
      );
    }

    if (!patentData) {
      return (
        <Dashboard
          onOpenPatent={handleOpenPatent}
          onCreateNew={handleCreateNew}
          currentUserId={currentUserId}
          currentOrganizationId={currentOrgId}
          currentOrganizationName={currentOrgName}
        />
      );
    }

    switch (currentView) {
      case AppView.DASHBOARD:
        return (
          <Dashboard
            onOpenPatent={handleOpenPatent}
            onCreateNew={handleCreateNew}
            currentUserId={currentUserId}
            currentOrganizationId={currentOrgId}
            currentOrganizationName={currentOrgName}
          />
        );
      case AppView.DISCLOSURE:
        return (
          <PatentDraft
            patentData={patentData}
            updatePatentData={updatePatentData}
            onNext={() => setCurrentView(AppView.NOVELTY_SEARCH)}
            onBack={() => setCurrentView(AppView.DASHBOARD)}
          />
        );
      case AppView.NOVELTY_SEARCH:
        return (
          <NoveltySearch
            patentData={patentData}
            updatePatentData={updatePatentData}
            setView={setCurrentView}
            onSave={handleSave}
            onBack={handleBackToDashboard}
          />
        );
      case AppView.DRAFTER:
        return (
          <DraftingContainer
            patentData={patentData}
            updatePatentData={updatePatentData}
            setView={setCurrentView}
            onSave={handleSave}
            onBack={handleBackToDashboard}
          />
        );
      case AppView.EDITOR:
        return (
          <Editor
            patentData={patentData}
            updatePatentData={updatePatentData}
            setView={setCurrentView}
            onSave={handleSave}
            onBack={handleBackToDashboard}
          />
        );
      default:
        return null;
    }
  };

  const fallback = (
    <div className="p-8 text-sm text-slate-500">正在加载当前工作区...</div>
  );

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || authView === 'PASSWORD_UPDATE') {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      }>
        {renderAuthView()}
      </Suspense>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full bg-slate-50 font-sans">
        <Sidebar
          currentView={currentView}
          setView={handleSidebarNavigation}
          patentData={patentData}
          userId={currentUserId ?? undefined}
          quotaRefreshKey={quotaRefreshKey}
          onSignOut={handleSignOut}
        />

        <main className="flex-1 relative overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-8 scroll-smooth space-y-6">
            {authNotice && (
              <div className={`rounded-2xl border px-5 py-4 text-sm ${
                authNotice.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : authNotice.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <span>{authNotice.message}</span>
                  <button
                    onClick={() => setAuthNotice(null)}
                    className="text-xs font-medium opacity-70 hover:opacity-100"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}

            <Suspense fallback={fallback}>
              {renderView()}
            </Suspense>
          </div>

          {notification && (
            <div className="absolute top-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-down flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {notification}
            </div>
          )}

          <Suspense fallback={null}>
            <ChatAssistant
              isOpen={isChatOpen}
              onToggle={() => setIsChatOpen(!isChatOpen)}
              currentView={currentView}
              patentData={patentData}
              userId={currentUserId ?? undefined}
            />
          </Suspense>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;