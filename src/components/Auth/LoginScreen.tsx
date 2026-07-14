import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { LogIn, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Lütfen e-posta adresinizi ve şifrenizi girin.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // Human readable error messages
        if (authError.message === 'Invalid login credentials') {
          setError('Hatalı e-posta veya şifre! Lütfen bilgilerinizi kontrol edin.');
        } else {
          setError(authError.message || 'Giriş yapılırken bir hata oluştu.');
        }
        setLoading(false);
        return;
      }

      if (data?.session) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err?.message || 'Bilinmeyen bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-4 font-sans select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent_50%)] bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.08),transparent_50%)]" />
      
      <div id="login-card" className="relative w-full max-w-md bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl overflow-hidden p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            FreshOps
          </h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">
            Yönetim Paneli Girişi
          </p>
        </div>

        {error && (
          <div id="login-error" className="flex items-start gap-3 p-4 mb-6 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl text-sm leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block ml-1">
              E-posta Adresi
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Mail className="w-5 h-5" />
              </span>
              <input
                id="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@freshops.com"
                className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 rounded-xl text-slate-100 placeholder-slate-500 transition-all outline-none text-sm"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block ml-1">
              Şifre
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                id="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 rounded-xl text-slate-100 placeholder-slate-500 transition-all outline-none text-sm"
                required
                disabled={loading}
              />
            </div>
          </div>

          <button
            id="login-submit-button"
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/10 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Giriş Yap</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-700/50 pt-6">
          <p className="text-xs text-slate-500 font-medium">
            © 2026 FreshOps Operations Management. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </div>
  );
};
