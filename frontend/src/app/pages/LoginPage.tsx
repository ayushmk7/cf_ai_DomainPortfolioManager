import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { Radar, Mail, Lock, User as UserIcon, AtSign, Eye, EyeOff, Check, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const inputClass =
  'w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-white/30 transition-colors';

const passwordChecks = (pw: string) => ({
  length: pw.length >= 8,
  uppercase: /[A-Z]/.test(pw),
  lowercase: /[a-z]/.test(pw),
  number: /\d/.test(pw),
  special: /[^A-Za-z0-9]/.test(pw),
});

type PasswordCheck = ReturnType<typeof passwordChecks>;

const PasswordStrength = ({ checks }: { checks: PasswordCheck }) => {
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const pct = (passed / total) * 100;

  const barColor =
    pct <= 40 ? 'bg-red-400' : pct <= 60 ? 'bg-amber-400' : pct <= 80 ? 'bg-yellow-300' : 'bg-emerald-400';

  const rules: [keyof PasswordCheck, string][] = [
    ['length', 'At least 8 characters'],
    ['uppercase', 'One uppercase letter'],
    ['lowercase', 'One lowercase letter'],
    ['number', 'One number'],
    ['special', 'One special character'],
  ];

  return (
    <div className="space-y-2 px-1">
      <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-1 gap-1">
        {rules.map(([key, label]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            {checks[key] ? (
              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-white/20 shrink-0" />
            )}
            <span className={checks[key] ? 'text-white/60' : 'text-white/30'}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, enabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Shared
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sign-up only
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!enabled) {
    return (
      <div className="min-h-screen w-full bg-black text-[#E6EDF3] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-6">
          <Link to="/" className="flex justify-center" aria-label="Back to home">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/20 hover:bg-white/10 transition-colors cursor-pointer">
              <Radar className="w-8 h-8 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-medium text-white">DomainPilot</h1>
          <p className="text-sm text-white/50">
            Firebase is not configured. Set VITE_FIREBASE_* env variables to enable authentication.
          </p>
          <button
            onClick={() => navigate(from)}
            className="w-full py-3 rounded-xl bg-white text-black font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Continue without auth
          </button>
        </div>
      </div>
    );
  }

  const checks = passwordChecks(password);
  const allChecksPassed = Object.values(checks).every(Boolean);

  const validate = (): string | null => {
    if (isSignUp) {
      if (!firstName.trim()) return 'First name is required';
      if (!lastName.trim()) return 'Last name is required';
      if (!username.trim()) return 'Username is required';
      if (username.trim().length < 3) return 'Username must be at least 3 characters';
      if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) return 'Username can only contain letters, numbers, and underscores';
      if (!allChecksPassed) return 'Password does not meet all requirements';
      if (password !== confirmPassword) return 'Passwords do not match';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const displayName = `${firstName.trim()} ${lastName.trim()}`;
        await signUp(email, password, displayName);
      } else {
        await signIn(email, password);
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = err?.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists'
        : err?.code === 'auth/invalid-credential'
          ? 'Invalid email or password'
          : err?.code === 'auth/weak-password'
            ? 'Password is too weak'
            : err.message ?? 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen w-full bg-black text-[#E6EDF3] flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <Link to="/" className="flex justify-center" aria-label="Back to home">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/20 hover:bg-white/10 transition-colors cursor-pointer">
              <Radar className="w-8 h-8 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-medium text-white">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h1>
          <p className="text-sm text-white/50">
            {isSignUp ? 'Get started with DomainPilot' : 'Welcome back to DomainPilot'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-[#FF6B6B]/10 border border-[#FF6B6B]/20 text-sm text-[#FF6B6B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Sign-up extra fields */}
          {isSignUp && (
            <>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    required
                    className={inputClass}
                  />
                </div>
                <div className="relative flex-1">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    required
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  required
                  minLength={3}
                  pattern="^[a-zA-Z0-9_]+$"
                  className={inputClass}
                />
              </div>
            </>
          )}

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className={inputClass}
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={isSignUp ? 8 : 6}
              className={`${inputClass} pr-10`}
            />
            {isSignUp && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Password strength (sign-up only) */}
          {isSignUp && password.length > 0 && <PasswordStrength checks={checks} />}

          {/* Confirm password (sign-up only) */}
          {isSignUp && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="text-xs text-red-400 mt-1 px-1">Passwords do not match</p>
              )}
              {confirmPassword.length > 0 && confirmPassword === password && (
                <p className="text-xs text-emerald-400 mt-1 px-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-white text-black font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/30">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm font-medium hover:bg-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Toggle */}
        <p className="text-center text-sm text-white/40">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={toggleMode} className="text-white/70 hover:text-white underline">
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
