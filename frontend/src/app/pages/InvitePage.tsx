import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { acceptInvitationApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { idToken, user } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing invitation token');
      return;
    }
    if (!user || !idToken) {
      setStatus('login');
      return;
    }
    acceptInvitationApi(idToken, token)
      .then((res) => {
        if (res.ok) {
          setStatus('success');
          setTimeout(() => navigate('/app', { replace: true }), 1500);
        } else {
          setStatus('error');
          setMessage('Invalid or expired invitation');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Failed to accept invitation');
      });
  }, [token, user, idToken, navigate]);

  if (status === 'login') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center text-white/80">
          <p className="mb-4">Sign in to accept this invitation.</p>
          <button
            type="button"
            onClick={() => navigate('/login', { state: { from: `/invite?token=${token}` } })}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center text-white/80">
          <p>Invitation accepted. Redirecting…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center text-white/80">
          <p className="mb-4">{message}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-white/60">Accepting invitation…</div>
    </div>
  );
}
