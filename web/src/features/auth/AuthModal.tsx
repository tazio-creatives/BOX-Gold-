import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sendOtp, verifyOtp } from '../../api/auth';
import { ApiError } from '../../api/client';
import { PhoneNumberForm } from './PhoneNumberForm';
import { OtpVerificationForm } from './OtpVerificationForm';
import styles from './AuthModal.module.css';

type Step = 'mobile' | 'otp';

// Matches the backend's otpVerifySchema (z.string().length(6)) — kept as one
// constant so the box count and payload length can never drift apart.
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

interface AuthModalProps {
  onClose: () => void;
}

// All API calls and cross-step state live here; PhoneNumberForm and
// OtpVerificationForm stay purely presentational. Replaces the old
// full-page LoginPage — this renders as a dialog on top of whatever route
// the user is already on, so a successful sign-in just closes the modal
// and lets the current page's own queries (['me'], ['cart'], ...) pick up
// the new session, rather than navigating anywhere.
export function AuthModal({ onClose }: AuthModalProps) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  // Client-side countdown only paces the UI — the server remains the actual
  // enforcement authority (OTP_RESEND_COOLDOWN_SECONDS), surfaced via the
  // existing ApiError message path if the two ever disagree.
  useEffect(() => {
    if (step !== 'otp' || resendSecondsLeft === 0) return;
    const timer = setTimeout(() => setResendSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendSecondsLeft]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await sendOtp(mobile, 'LOGIN');
      setOtp('');
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
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
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
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
      // otp may carry trailing/leading ' ' placeholders from the box grid's
      // internal representation (see OtpVerificationForm) — strip before
      // sending; submit is disabled until all boxes are filled anyway.
      await verifyOtp(mobile, otp.trim(), 'LOGIN');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['cart'] }),
        queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
      ]);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid OTP. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleChangeNumber() {
    setStep('mobile');
    setOtp('');
    setError(null);
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Sign in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        {step === 'mobile' ? (
          <PhoneNumberForm
            mobile={mobile}
            onMobileChange={setMobile}
            onSubmit={handleSendOtp}
            isSubmitting={isSubmitting}
            apiError={error}
          />
        ) : (
          <OtpVerificationForm
            mobile={mobile}
            otp={otp}
            otpLength={OTP_LENGTH}
            onOtpChange={setOtp}
            onSubmit={handleVerifyOtp}
            onChangeNumber={handleChangeNumber}
            onResend={handleResendOtp}
            isSubmitting={isSubmitting}
            isResending={isResending}
            apiError={error}
            resendSecondsLeft={resendSecondsLeft}
          />
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
