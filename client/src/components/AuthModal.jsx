import React, { useState } from 'react';
import { 
  loginWithGoogle, 
  loginWithEmail, 
  registerWithEmail 
} from '../firebase';
import toast from 'react-hot-toast';
import { LogIn, UserPlus, Sparkles, Shield, UserCheck, Eye } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      toast.success('Signed in with Google!');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    try {
      setLoading(true);
      if (isRegister) {
        await registerWithEmail(email, password);
        toast.success('Account registered! Status: Spectator (pending Admin promotion).');
      } else {
        await loginWithEmail(email, password);
        toast.success('Welcome back!');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#191919] border border-[#e5e5e5] dark:border-[#2e2e2e] rounded-xl shadow-2xl overflow-hidden p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-black text-white dark:bg-white dark:text-black mb-3 font-semibold text-lg">
            OS
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[#111] dark:text-[#eee]">
            {isRegister ? 'Create Work OS Account' : 'Welcome to Work OS'}
          </h2>
          <p className="text-xs text-[#777] dark:text-[#888] mt-1">
            {isRegister 
              ? 'Newly registered accounts default to Spectator until promoted by Admin.' 
              : 'Sign in to access tasks, private deliverables, and WebGPU SLM assistant.'}
          </p>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          type="button"
          className="w-full py-2.5 px-4 mb-4 border border-[#ddd] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#252525] rounded-lg text-sm font-medium flex items-center justify-center gap-3 transition-colors text-[#222] dark:text-[#eee]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Continue with Google
        </button>

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-[#eee] dark:border-[#333]"></div>
          <span className="flex-shrink mx-3 text-xs text-[#999] uppercase tracking-wider">or email</span>
          <div className="flex-grow border-t border-[#eee] dark:border-[#333]"></div>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#555] dark:text-[#aaa] mb-1">Work Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#ddd] dark:border-[#333] bg-white dark:bg-[#202020] text-[#111] dark:text-[#eee] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#555] dark:text-[#aaa] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#ddd] dark:border-[#333] bg-white dark:bg-[#202020] text-[#111] dark:text-[#eee] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-black text-white dark:bg-white dark:text-black font-medium text-sm rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin text-xs">●</span>
            ) : isRegister ? (
              <>
                <UserPlus size={15} /> Create Spectator Account
              </>
            ) : (
              <>
                <LogIn size={15} /> Sign In
              </>
            )}
          </button>
        </form>

        {/* Mode switch */}
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-[#666] dark:text-[#999] hover:underline"
          >
            {isRegister 
              ? 'Already registered? Sign in instead.' 
              : "Don't have an account? Register as Spectator."}
          </button>
        </div>

        {/* Dismiss modal */}
        <div className="mt-4 pt-4 border-t border-[#eee] dark:border-[#2a2a2a] flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc]"
          >
            Cancel and continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
