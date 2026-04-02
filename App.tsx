import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatAssistant from './components/ChatAssistant';
import NoveltySearch from './components/NoveltySearch';
import PatentDrafter from './components/PatentDrafter';
import Editor from './components/Editor';
import Dashboard from './components/Dashboard';
import { AppView, PatentData } from './types';
import { savePatentToStorage, createNewPatentData } from './services/storageService';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [patentData, setPatentData] = useState<PatentData | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const updatePatentData = (key: keyof PatentData, value: any) => {
    if (!patentData) return;
    setPatentData(prev => prev ? ({ ...prev, [key]: value }) : null);
  };

  const handleSave = () => {
      if (patentData) {
          savePatentToStorage(patentData);
          showNotification("保存成功！已存入草稿箱");
      }
  };

  const handleCreateNew = () => {
      const newPatent = createNewPatentData();
      setPatentData(newPatent);
      setCurrentView(AppView.NOVELTY_SEARCH);
  };

  const handleOpenPatent = (patent: PatentData) => {
      setPatentData(patent);
      // Determine where to go based on content or just go to Search/Summary
      if (patent.claims || patent.detailedDescription) {
          setCurrentView(AppView.EDITOR);
      } else if (patent.inventionContent) {
          setCurrentView(AppView.DRAFTER);
      } else {
          setCurrentView(AppView.NOVELTY_SEARCH);
      }
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
      if (view === AppView.DASHBOARD) {
          // If clicking Dashboard, we save and close the current patent
          handleBackToDashboard();
      } else {
          // Only allow switching views if we have a patent, or if it's permitted
          // The Sidebar UI should handle disabling, but this is a safety check
          if (patentData) {
              setCurrentView(view);
          }
      }
  };

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  const renderView = () => {
    // If no patent loaded, force Dashboard
    if (!patentData) {
        return <Dashboard onOpenPatent={handleOpenPatent} onCreateNew={handleCreateNew} />;
    }

    // If patent loaded, check view
    switch (currentView) {
      case AppView.DASHBOARD:
         // Should not happen if patentData is set due to handleSidebarNavigation logic, 
         // but if it does, show dashboard
         return <Dashboard onOpenPatent={handleOpenPatent} onCreateNew={handleCreateNew} />;
      case AppView.NOVELTY_SEARCH:
        return <NoveltySearch 
                  patentData={patentData} 
                  updatePatentData={updatePatentData} 
                  setView={setCurrentView} 
                  onSave={handleSave}
                  onBack={handleBackToDashboard}
               />;
      case AppView.DRAFTER:
        return <PatentDrafter 
                  patentData={patentData} 
                  updatePatentData={updatePatentData} 
                  onSave={handleSave}
                  onBack={handleBackToDashboard}
               />;
      case AppView.EDITOR:
        return <Editor 
                  patentData={patentData} 
                  updatePatentData={updatePatentData} 
                  onSave={handleSave}
                  onBack={handleBackToDashboard}
               />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans">
      <Sidebar 
          currentView={currentView} 
          setView={handleSidebarNavigation} 
          toggleChat={() => setIsChatOpen(!isChatOpen)}
          isChatOpen={isChatOpen}
          hasActivePatent={!!patentData}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          {renderView()}
        </div>
        
        {/* Notification Toast */}
        {notification && (
            <div className="absolute top-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-down flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {notification}
            </div>
        )}
        
        <ChatAssistant isOpen={isChatOpen} />
      </main>
    </div>
  );
};

export default App;