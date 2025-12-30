import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Lock, Mail, ArrowRight, AlertCircle, GitCommit, Shield } from 'lucide-react';

const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-zinc-800 bg-zinc-900/50 text-center">
            <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-4">
                <Shield className="text-indigo-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 mb-2">MarginGuard AI</h1>
            <p className="text-zinc-500 text-sm">Real-time Inference Cost Control & Forecasting</p>
        </div>

        <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded p-3 flex items-start gap-3">
                        <AlertCircle className="text-rose-500 mt-0.5" size={16} />
                        <span className="text-xs text-rose-200">{error}</span>
                    </div>
                )}
                
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-2.5 text-zinc-600" size={16} />
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-10 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-700"
                            placeholder="user@example.com"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-2.5 text-zinc-600" size={16} />
                        <input 
                            type="password" 
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-10 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-700"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    ) : (
                        <>
                            {isLogin ? 'Sign In' : 'Create Account'}
                            <ArrowRight size={16} />
                        </>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <button 
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
                >
                    {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
            </div>
        </div>
        
        <div className="bg-zinc-950 p-4 border-t border-zinc-800 flex justify-center gap-4 text-zinc-600">
             <div className="flex items-center gap-1.5 text-[10px]">
                <GitCommit size={12} />
                <span>v2.1 Auditable</span>
             </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;