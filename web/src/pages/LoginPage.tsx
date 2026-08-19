import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { sendOtp, verifyOtp } from '../api/auth';
import { ApiError } from '../api/client';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { AuthVisualPanel } from '../features/auth/AuthVisualPanel';
import { PhoneNumberForm } from '../features/auth/PhoneNumberForm';
import { OtpVerificationForm } from '../features/auth/OtpVerificationForm';
import styles from './LoginPage.module.css';

type Step = 'mobile' | 'otp';

// Matches the backend's otpVerifySchema (z.string().length(6)) — kept as one
// constant so the box count and payload length can never drift apart.
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

// All API calls and cross-step state live here; PhoneNumberForm and
// OtpVerificationForm are purely presentational (plan: "keep server/API
// calls outside purely visual components").
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
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  // Client-side countdown only paces the UI — the server remains the actual
  // enforcement authority (OTP_RESEND_COOLDOWN_SECONDS), surfaced via the
  // existing ApiError message path if the two ever disagree.
  useEffect(() => {
    if (step !== 'otp' || resendSecondsLeft === 0) return;
    const timer = setTimeout(() => setResendSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendSecondsLeft]);

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
      navigate(searchParams.get('redirect') || '/', { replace: true });
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
    <div className={styles.page}>
      <div className={styles.panel}>
        <AuthVisualPanel />
        <div className={styles.formPanel}>
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
    </div>
  );
}
