import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMinutes * 60 * 1000,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for the admin login endpoint specifically — brute-force
// protection independent of general API traffic. See plan §8/§29.
export const adminLoginRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMinutes * 60 * 1000,
  max: env.adminLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts, try again later' } },
});

// Per-IP throttle on OTP send, on top of the per-mobile throttling inside
// OTPService — catches one IP hammering many different mobile numbers
// (plan §12: "per-IP/device throttling where appropriate").
export const otpSendRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMinutes * 60 * 1000,
  max: env.otpSendRateLimitPerIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many OTP requests from this network, try again later' } },
});
