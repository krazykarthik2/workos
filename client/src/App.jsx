import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Calendar, 
  FolderArchive, 
  History, 
  Layers,
  Shield,
  User,
  LogIn,
  LogOut
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';

import KanbanBoard from './components/KanbanBoard';
import EventsTracker from './components/EventsTracker';
import WorkDoneTracker from './components/WorkDoneTracker';
import FileManager from './components/FileManager';
import TimelineView from './components/TimelineView';
import ChatAssistant from './components/ChatAssistant';
import FloatingCommandPalette from './components/FloatingCommandPalette';
import AuthModal from './components/AuthModal';
import UserRoleManager from './components/UserRoleManager';
import { TaskService, EventService, WorkDoneService, FileService, TimelineService, UserService } from './services';
import { listenAuthState, logoutUser } from './firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [workDone, setWorkDone] = useState([]);
  const [files, setFiles] = useState([]);
  const [timeline, setTimeline] = useState([]);

  // Auth & Roles State
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isRoleManagerOpen, setIsRoleManagerOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = listenAuthState(async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const profile = await UserService.sync({
            uid: user.uid,
            email: user.email,
            display_name: user.displayName || user.email.split('@')[0],
            photo_url: user.photoURL || ''
          });
          setCurrentUser(profile);
        } catch (e) {
          console.error('Failed to sync user profile:', e);
        }
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const refreshAllData = async () => {
    try {
      const userEmail = currentUser?.email || '';
      const userRole = currentUser?.role || 'spectator';

      const [tData, eData, wData, fData, tmData] = await Promise.all([
        TaskService.list().catch(() => []),
        EventService.list().catch(() => []),
        WorkDoneService.list(userEmail, userRole).catch(() => []),
        FileService.list().catch(() => []),
        TimelineService.list().catch(() => [])
      ]);

      setTasks(tData || []);
      setEvents(eData || []);
      setWorkDone(wData || []);
      setFiles(fData || []);
      setTimeline(tmData || []);
    } catch (err) {
      console.error('Data refresh error:', err);
    }
  };

  const handleSearchFiles = async (query) => {
    try {
      const data = await FileService.list(query);
      setFiles(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, [currentUser]);

  const navItems = [
    { id: 'kanban', label: 'Board', icon: <Layers size={14} />, count: tasks.length },
    { id: 'work', label: 'Work Log', icon: <CheckSquare size={14} />, count: workDone.length },
    { id: 'events', label: 'Events', icon: <Calendar size={14} />, count: events.length },
    { id: 'files', label: 'Files', icon: <FolderArchive size={14} />, count: files.length },
    { id: 'timeline', label: 'Timeline', icon: <History size={14} />, count: timeline.length }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', fontSize: '13px' } }} />

      <FloatingCommandPalette onCommandExecuted={refreshAllData} />
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      {currentUser?.role === 'admin' && (
        <UserRoleManager 
          isOpen={isRoleManagerOpen} 
          onClose={() => setIsRoleManagerOpen(false)} 
          currentUser={currentUser} 
        />
      )}

      {/* Notion Top Bar */}
      <header style={{
        height: '45px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Work OS
          </span>
          <span style={{ color: 'var(--border-strong)', fontSize: '13px' }}>/</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Workspace
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
          <span
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true }));
            }}
            style={{
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '3px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            Quick Command <kbd style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>Ctrl+/</kbd>
          </span>

          {/* User Profile & Auth Section */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => setIsRoleManagerOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}
                  title="Manage user permissions and promote spectators"
                >
                  <Shield size={12} /> Manage Roles
                </button>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--bg-hover)'
              }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: currentUser.role === 'admin' ? '#000' : currentUser.role === 'employee' ? '#2563eb' : '#6b7280',
                  color: '#fff'
                }}>
                  {currentUser.role}
                </span>
                <span style={{ color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentUser.display_name || currentUser.email}
                </span>
                <button
                  onClick={() => logoutUser()}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Sign Out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: '#000',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '12px'
              }}
            >
              <LogIn size={12} /> Sign In / Register
            </button>
          )}
        </div>
      </header>

      {/* Notion Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left / Main Workspace View */}
        <div style={{ flex: '1 1 65%', display: 'flex', flexDirection: 'column' }}>
          {/* Notion Tab Bar */}
          <nav style={{
            display: 'flex',
            padding: '8px 16px',
            gap: '4px',
            borderBottom: '1px solid var(--border-light)',
            flexShrink: 0
          }}>
            {navItems.map(item => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    background: active ? 'var(--bg-hover)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: active ? '500' : '400',
                    fontSize: '13px'
                  }}
                >
                  {item.icon}
                  {item.label}
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>

          <main style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
            {activeTab === 'kanban' && (
              <KanbanBoard tasks={tasks} onRefresh={refreshAllData} allFiles={files} />
            )}
            {activeTab === 'work' && (
              <WorkDoneTracker 
                workList={workDone} 
                onRefresh={refreshAllData} 
                allFiles={files} 
                currentUser={currentUser}
              />
            )}
            {activeTab === 'events' && (
              <EventsTracker events={events} onRefresh={refreshAllData} allFiles={files} />
            )}
            {activeTab === 'files' && (
              <FileManager files={files} onUploadSuccess={refreshAllData} onSearch={handleSearchFiles} />
            )}
            {activeTab === 'timeline' && (
              <TimelineView timeline={timeline} onRevertSuccess={refreshAllData} />
            )}
          </main>
        </div>

        {/* Right Notion Sidebar: Assistant */}
        <aside style={{ flex: '0 0 35%', minWidth: '320px', maxWidth: '440px' }}>
          <ChatAssistant />
        </aside>
      </div>
    </div>
  );
}
