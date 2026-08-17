import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { sendOtp, verifyOtp } from '../api/auth';
import { ApiError } from '../api/client';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import styles from './LoginPage.module.css';

type Step = 'mobile' | 'otp';

function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

// Not one of the 21 planned phases — the plan left "Account/Login: Phase 3's
// OTP flow needs its own UI phase" as a placeholder, but Phase 10 (checkout)
// requires a logged-in customer, so without this page checkout is
// unreachable from the UI at all. Built now as a necessary prerequisite,
// not a scope decision made silently: flagged in the phase summary.
export function LoginPage() {
  useDocumentTitle('Sign In');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [justResent, setJustResent] = useState(false);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await sendOtp(mobile, 'LOGIN');
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send OTP. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendOtp() {
    setError(null);
    setIsResending(true);
    try {
      await sendOtp(mobile, 'LOGIN');
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend OTP. Try again.');
    } finally {
      setIsResending(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp(mobile, otp, 'LOGIN');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['cart'] }),
        queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
      ]);
      navigate(searchParams.get('redirect') || '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid OTP. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconBadge}>
          <LockIcon />
        </div>
        <h1 className={styles.heading}>Sign In</h1>
        <p className={styles.tagline}>
          {step === 'mobile'
            ? 'Enter your mobile number to continue'
            : 'Verify your number to finish signing in'}
        </p>

        {step === 'mobile' && (
          <form className={styles.form} onSubmit={handleSendOtp}>
            <label className={styles.label}>
              Mobile Number
              <div className={styles.mobileRow}>
                <span className={styles.prefix}>+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  className={styles.input}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98765 43210"
                  autoFocus
                  required
                />
              </div>
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button
              type="submit"
              className={styles.submit}
              disabled={isSubmitting || mobile.length !== 10}
            >
              {isSubmitting ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form className={styles.form} onSubmit={handleVerifyOtp}>
            <p className={styles.subtext}>
              Enter the 6-digit code sent to <strong>+91 {mobile}</strong>
            </p>
            <label className={styles.label}>
              OTP
              <input
                type="text"
                inputMode="numeric"
                className={styles.otpInput}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoFocus
                required
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submit} disabled={isSubmitting || otp.length !== 6}>
              {isSubmitting ? 'Verifying…' : 'Verify & Sign In'}
            </button>
            <div className={styles.footerRow}>
              <button
                type="button"
                className={styles.linkButton}
                disabled={isResending}
                onClick={handleResendOtp}
              >
                {isResending ? 'Resending…' : justResent ? 'OTP sent ✓' : "Didn't get it? Resend OTP"}
              </button>
              <span className={styles.footerDivider} aria-hidden="true" />
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setStep('mobile');
                  setOtp('');
                  setError(null);
                }}
              >
                Change number
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
