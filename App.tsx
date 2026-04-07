import React, { Suspense, lazy, useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import { AppView, PatentData, AuthView } from './types';
import { savePatentToStorage, createNewPatentData } from './services/storageService';
import { isSupabaseConfigured, getSession, onAuthStateChange, signOut as supabaseSignOut } from './services/supabaseService';
import { getOrCreateDefaultOrganization, associatePatentsWithUser } from './services/organizationService';
import { canNavigateToWorkflowStage, getRecommendedViewForPatent } from './workflow';

const ChatAssistant = lazy(() => import('./components/ChatAssistant'));
const NoveltySearch = lazy(() => import('./components/NoveltySearch'));
const DraftingContainer = lazy(() => import('./components/Drafting/DraftingContainer'));
const Editor = lazy(() => import('./components/Editor'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const PatentDraft = lazy(() => import('./components/PatentDraft'));

// Auth components
const Login = lazy(() => import('./components/Auth/Login'));
const Register = lazy(() => import('./components/Auth/Register'));
const PasswordReset = lazy(() => import('./components/Auth/PasswordReset'));
const OrganizationSettings = lazy(() => import('./components/Settings/OrganizationSettings'));

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [patentData, setPatentData] = useState<PatentData | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authView, setAuthView] = useState<AuthView>('LOGIN');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  const supabaseConfigured = isSupabaseConfigured();

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const session = await getSession();
      if (session?.user) {
        setIsAuthenticated(true);
        setCurrentUserId(session.user.id);

        // Get or create default organization
        const org = getOrCreateDefaultOrganization(session.user.id);
        setCurrentOrgId(org.id);

        // Associate existing patents with user
        associatePatentsWithUser(session.user.id, org.id);
      } else {
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const unsubscribe = onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setIsAuthenticated(true);
        setCurrentUserId(session.user.id);

        // Get or create default organization
        const org = getOrCreateDefaultOrganization(session.user.id);
        setCurrentOrgId(org.id);

        // Associate existing patents with user
        associatePatentsWithUser(session.user.id, org.id);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setCurrentUserId(null);
        setCurrentOrgId(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = () => {
    // Auth state change listener will handle this
  };

  const handleRegisterSuccess = () => {
    setAuthView('LOGIN');
  };

  const handleSignOut = async () => {
    await supabaseSignOut();
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setCurrentOrgId(null);
    setPatentData(null);
    setCurrentView(AppView.DASHBOARD);
  };

  const updatePatentData = (key: keyof PatentData, value: any) => {
    if (!patentData) return;
    setPatentData(prev => prev ? ({ ...prev, [key]: value, userId: currentUserId || prev.userId, organizationId: currentOrgId || prev.organizationId }) : null);
  };

  const handleSave = () => {
      if (patentData) {
          savePatentToStorage(patentData);
          showNotification("保存成功！已存入草稿箱");
      }
  };

  const handleCreateNew = () => {
      const newPatent = createNewPatentData();
      // Associate with current user and organization
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
      // Auto save when going back
      if (patentData) {
          savePatentToStorage(patentData);
      }
      setPatentData(null);
      setCurrentView(AppView.DASHBOARD);
  };

  // Handle sidebar navigation clicks
  const handleSidebarNavigation = (view: AppView) => {
      const getNavigationStatus = (targetView: AppView, currentPatent: PatentData) => {
          if (currentPatent.status === 'ready_to_submit') return currentPatent.status;

          switch (targetView) {
            case AppView.NOVELTY_SEARCH:
              return currentPatent.status === 'disclosure_collecting' ? 'disclosure_review' : currentPatent.status;
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
      } else if (view === AppView.SETTINGS) {
          setCurrentView(AppView.SETTINGS);
      } else {
          if (patentData) {
              if (!canNavigateToWorkflowStage(view, patentData)) {
                return;
              }

              const nextStatus = getNavigationStatus(view, patentData);
              if (nextStatus !== patentData.status) {
                setPatentData(prev => prev ? ({ ...prev, status: nextStatus }) : null);
              }

              setCurrentView(view);
          }
      }
  };

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  // Render auth view
  const renderAuthView = () => {
    switch (authView) {
      case 'REGISTER':
        return (
          <Register
            onSwitchToLogin={() => setAuthView('LOGIN')}
            onRegisterSuccess={handleRegisterSuccess}
            isConfigured={supabaseConfigured}
          />
        );
      case 'PASSWORD_RESET':
        return (
          <PasswordReset
            onSwitchToLogin={() => setAuthView('LOGIN')}
            isConfigured={supabaseConfigured}
          />
        );
      default:
        return (
          <Login
            onSwitchToRegister={() => setAuthView('REGISTER')}
            onSwitchToReset={() => setAuthView('PASSWORD_RESET')}
            onLoginSuccess={handleLoginSuccess}
            isConfigured={supabaseConfigured}
          />
        );
    }
  };

  // Render main app view
  const renderView = () => {
    // Settings view
    if (currentView === AppView.SETTINGS && currentOrgId) {
      return (
        <OrganizationSettings
          organizationId={currentOrgId}
          onBack={() => setCurrentView(AppView.DASHBOARD)}
        />
      );
    }

    // If no patent loaded, force Dashboard
    if (!patentData) {
        return <Dashboard onOpenPatent={handleOpenPatent} onCreateNew={handleCreateNew} />;
    }

    // If patent loaded, check view
    switch (currentView) {
      case AppView.DASHBOARD:
         return <Dashboard onOpenPatent={handleOpenPatent} onCreateNew={handleCreateNew} />;
      case AppView.DISCLOSURE:
         return <PatentDraft
                  patentData={patentData}
                  updatePatentData={updatePatentData}
                  onNext={() => setCurrentView(AppView.NOVELTY_SEARCH)}
                  onBack={() => setCurrentView(AppView.DASHBOARD)}
                />;
      case AppView.NOVELTY_SEARCH:
        return <NoveltySearch
                  patentData={patentData}
                  updatePatentData={updatePatentData}
                  setView={setCurrentView}
                  onSave={handleSave}
                  onBack={handleBackToDashboard}
               />;
      case AppView.DRAFTER:
        return <DraftingContainer
                  patentData={patentData}
                  updatePatentData={updatePatentData}
                  setView={setCurrentView}
                  onSave={handleSave}
                  onBack={handleBackToDashboard}
               />;
      case AppView.EDITOR:
        return <Editor
                  patentData={patentData}
                  updatePatentData={updatePatentData}
                  setView={setCurrentView}
                  onSave={handleSave}
                  onBack={handleBackToDashboard}
               />;
      default:
        return null;
    }
  };

  const fallback = (
    <div className="p-8 text-sm text-slate-500">正在加载当前工作区...</div>
  );

  // Show loading while checking auth
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

  // Show auth view if not authenticated
  if (!isAuthenticated) {
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

  // Main app layout
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans">
      <Sidebar
          currentView={currentView}
          setView={handleSidebarNavigation}
          patentData={patentData}
          onSignOut={handleSignOut}
      />

      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <Suspense fallback={fallback}>
            {renderView()}
          </Suspense>
        </div>

        {/* Notification Toast */}
        {notification && (
            <div className="absolute top-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-down flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {notification}
            </div>
        )}

        <Suspense fallback={null}>
          <ChatAssistant isOpen={isChatOpen} onToggle={() => setIsChatOpen(!isChatOpen)} currentView={currentView} patentData={patentData} />
        </Suspense>
      </main>
    </div>
  );
};

export default App;