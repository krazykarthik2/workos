import React, { useState, useEffect } from 'react';
import { UserService } from '../services';
import toast from 'react-hot-toast';
import { Shield, Users, UserCheck, Eye, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

export default function UserRoleManager({ currentUser, isOpen, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser && currentUser.role === 'admin') {
      fetchUsers();
    }
  }, [isOpen, currentUser]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await UserService.list(currentUser.email);
      setUsers(data);
    } catch (err) {
      toast.error('Failed to load user directory: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (targetEmail, newRole) => {
    try {
      await UserService.updateRole(targetEmail, newRole, 'active', currentUser.email);
      toast.success(`Role for ${targetEmail} updated to ${newRole.toUpperCase()}`);
      setUsers(prev => prev.map(u => u.email === targetEmail ? { ...u, role: newRole } : u));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user role');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white dark:bg-[#191919] border border-[#e5e5e5] dark:border-[#2e2e2e] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#eee] dark:border-[#2a2a2a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-black text-white dark:bg-white dark:text-black">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#111] dark:text-[#eee]">
                User & Role Management
              </h2>
              <p className="text-xs text-[#777] dark:text-[#888]">
                Elevate newly registered Spectator accounts to Employee or Admin
              </p>
            </div>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 text-[#777] hover:text-[#111] dark:hover:text-[#eee] rounded-lg transition-colors"
            title="Refresh user directory"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* User list */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {loading && users.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#888]">Loading user directory...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#888]">No registered users found.</div>
          ) : (
            users.map((u) => {
              const isSelf = u.email.toLowerCase() === currentUser.email?.toLowerCase();
              return (
                <div
                  key={u.uid || u.email}
                  className="p-3.5 rounded-lg border border-[#e5e5e5] dark:border-[#2a2a2a] bg-[#fafafa] dark:bg-[#202020] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#e0e0e0] dark:bg-[#333] flex items-center justify-center font-medium text-xs text-[#333] dark:text-[#ddd]">
                      {u.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#111] dark:text-[#eee]">
                          {u.display_name || u.email.split('@')[0]}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[#444] dark:text-[#ccc]">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#777] dark:text-[#888] font-mono">{u.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="text-xs text-[#666] dark:text-[#999] mr-1">Role:</span>
                    <select
                      value={u.role || 'spectator'}
                      disabled={isSelf}
                      onChange={(e) => handleRoleChange(u.email, e.target.value)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-[#ccc] dark:border-[#444] bg-white dark:bg-[#282828] text-[#111] dark:text-[#eee] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white disabled:opacity-60 cursor-pointer"
                    >
                      <option value="spectator">Spectator (Read-Only)</option>
                      <option value="employee">Employee (Work Log & Tasks)</option>
                      <option value="admin">Admin (Full Access)</option>
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#eee] dark:border-[#2a2a2a] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
