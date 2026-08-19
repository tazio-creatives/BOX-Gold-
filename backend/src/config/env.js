import 'dotenv/config';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(
    ',',
  ),

  adminSessionSecret: process.env.ADMIN_SESSION_SECRET ?? 'dev-only-admin-session-secret',
  adminSessionCookieName: process.env.ADMIN_SESSION_COOKIE_NAME ?? 'box_diamonds_admin_sid',
  adminSessionMaxAgeHours: Number(process.env.ADMIN_SESSION_MAX_AGE_HOURS ?? 12),

  customerSessionSecret: process.env.CUSTOMER_SESSION_SECRET ?? 'dev-only-customer-session-secret',
  customerSessionCookieName:
    process.env.CUSTOMER_SESSION_COOKIE_NAME ?? 'box_diamonds_customer_sid',
  // Customers shouldn't be re-prompted for OTP on every visit (plan §11) — long-lived vs admin's 12h.
  customerSessionMaxAgeHours: Number(process.env.CUSTOMER_SESSION_MAX_AGE_HOURS ?? 24 * 30),

  guestCartSessionCookieName: process.env.GUEST_CART_SESSION_COOKIE_NAME ?? 'box_diamonds_cart_sid',
  guestCartSessionMaxAgeDays: Number(process.env.GUEST_CART_SESSION_MAX_AGE_DAYS ?? 90),

  rateLimitWindowMinutes: Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
  adminLoginRateLimitMax: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX ?? 10),

  // OTP (plan §7/§12/§13)
  otpProvider: process.env.OTP_PROVIDER ?? 'stub',
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES ?? 5),
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  otpMaxVerifyAttempts: Number(process.env.OTP_MAX_VERIFY_ATTEMPTS ?? 5),
  otpMaxRequestsPerHour: Number(process.env.OTP_MAX_REQUESTS_PER_HOUR ?? 5),
  otpMaxRequestsPerDay: Number(process.env.OTP_MAX_REQUESTS_PER_DAY ?? 10),
  otpSendRateLimitPerIp: Number(process.env.OTP_SEND_RATE_LIMIT_PER_IP ?? 20),

  msg91AuthKey: process.env.MSG91_AUTH_KEY,
  msg91TemplateId: process.env.MSG91_TEMPLATE_ID,
  msg91SenderId: process.env.MSG91_SENDER_ID,

  // Live Pricing Engine (plan §9a)
  metalRateProvider: process.env.METAL_RATE_PROVIDER ?? 'stub',
  goldRateSyncCron: process.env.GOLD_RATE_SYNC_CRON ?? '0 */6 * * *', // every 6 hours
  goldapiAccessToken: process.env.GOLDAPI_ACCESS_TOKEN,

  // Checkout / inventory reservation (plan §11)
  reservationTtlMinutes: Number(process.env.RESERVATION_TTL_MINUTES ?? 15),
  reservationSweepCron: process.env.RESERVATION_SWEEP_CRON ?? '* * * * *', // every minute
  shippingEstimateMinDays: Number(process.env.SHIPPING_ESTIMATE_MIN_DAYS ?? 3),
  shippingEstimateMaxDays: Number(process.env.SHIPPING_ESTIMATE_MAX_DAYS ?? 7),

  // Payment (plan §11)
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'stub',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-only-payment-webhook-secret',

  // Shipping (plan §11b)
  shippingProvider: process.env.SHIPPING_PROVIDER ?? 'stub',
  shippingWebhookSecret: process.env.SHIPPING_WEBHOOK_SECRET ?? 'dev-only-shipping-webhook-secret',

  // Storage + AI image pipeline (plan §2/§9/§10)
  storageProvider: process.env.STORAGE_PROVIDER ?? 'local',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  uploadsPublicBaseUrl: process.env.UPLOADS_PUBLIC_BASE_URL ?? 'http://localhost:4000/uploads',
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10),
  aiImageProvider: process.env.AI_IMAGE_PROVIDER ?? 'stub',

  // Jewellery photo quality enhancement — OpenAI Images Edit API, called
  // directly (not through the aiImage provider registry above, which is a
  // different feature: candidate redesign variants vs. this single
  // preserve-the-design enhancement pass).
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
  // No default — AI Image Studio's analysis step must be deliberately
  // configured, not silently pinned to whatever model happened to be
  // hardcoded here (plan §9 correction).
  openaiVisionModel: process.env.OPENAI_VISION_MODEL,

  // AI Image Studio (jewellery reference upload -> 4-image generation).
  aiStudioCategoryConfidenceThreshold: Number(
    process.env.AI_STUDIO_CATEGORY_CONFIDENCE_THRESHOLD ?? 0.7,
  ),
  aiStudioGenerationConcurrency: Number(process.env.AI_STUDIO_GENERATION_CONCURRENCY ?? 4),

  // Email (plan §12)
  emailProvider: process.env.EMAIL_PROVIDER ?? 'stub',
  emailJobRetryLimit: Number(process.env.EMAIL_JOB_RETRY_LIMIT ?? 5),
  emailJobRetryDelaySeconds: Number(process.env.EMAIL_JOB_RETRY_DELAY_SECONDS ?? 30),
};

export const isProduction = env.nodeEnv === 'production';
