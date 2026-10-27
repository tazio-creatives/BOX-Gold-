# AI Product-Image Generation — Current Architecture & Display Audit

Audit date: 24 Oct 2026 · Scope: read-only (code, production DB `SELECT`s inside `BEGIN READ ONLY`, S3 `HEAD` requests, log reads). Nothing was changed.

Evidence labels used throughout: **Confirmed** (seen in code *and* data/logs), **Highly likely** (code path proven, user impact inferred), **Possible** (plausible, not proven).

---

## 1. Project information

| Item | Value (verified from code/config) |
|---|---|
| Project path | `C:\Users\hello\OneDrive\Desktop\projects\box-gold` |
| Repository | `tazio-creatives/BOX-Gold-` (origin); npm workspaces monorepo: `backend/`, `web/`, `admin/`, `packages/` |
| Branch / latest commit | `main` @ `7bf89ec` — "Product cards: no badge for zero stock (made to order)" (20 Oct 2026) |
| Working tree | Clean at audit start (this document is the only new file) |
| Backend | Node 22, Express (ESM), `backend/src` — controllers / services / repositories / jobs / providers |
| Storefront | React 19 + Vite 8, SSR via Express (`web/server/index.js`), TanStack Query |
| Admin | React 19 + Vite SPA (`admin/src`), TanStack Query, served as static files by nginx |
| Database | PostgreSQL 18.6, migrations via node-pg-migrate (`backend/src/db/migrations`) |
| Queue / worker | **pg-boss v10** (Postgres-backed), runs *inside* each backend process (`jobs/queue.js`); pm2 cluster ×3 → 3 competing workers |
| Image storage | AWS S3 bucket `boxgold` (ap-south-1), public-read, virtual-hosted URLs (`STORAGE_PROVIDER=s3`, no `S3_PUBLIC_BASE_URL`) |
| CDN / caching | Cloudflare in front of the site and API (`cf-cache-status: DYNAMIC` — HTML/API not edge-cached). Images are served **directly from S3**, not through Cloudflare. SSR HTML cached in Postgres table `page_cache` (TTL `SSR_CACHE_TTL_SECONDS=600`) |
| AI image provider | OpenAI: `gpt-image-2` (`images.edit` / `images.generate`, 1024×1024, quality `medium`, PNG); vision/analysis/validation `gpt-4o` (structured output via zod) |
| Legacy AI pipeline | `ai-images` routes + `aiImageJob.js` with `AI_IMAGE_PROVIDER=stub` — still mounted, not a real generator |

Secrets (OpenAI key, DB URL, AWS keys) were present but not read or printed.

---

## 2. Current architecture (summary)

There are **three** image-producing paths that all end in `product_images`:

1. **AI Image Studio** (the real one; this audit's focus) — `aiStudio.controller.js` → `aiStudioJob.js` (pg-boss) → `aiStudioService.js` (OpenAI) → S3 `products/ai-studio/<jobId>/…png` → admin import → `imageProcessingService.processAndStoreImage` → S3 `products/<productId>/<uuid>-<variant>.<ext>` → `product_images`.
2. **Legacy "AI images"** (`aiImages.controller.js`, `aiImageJob.js`, `ai_generated_images`, provider = `stub`) — still routable, generates nothing real.
3. **Manual upload / attach existing / Product Size image** (`productImages.controller.js`, `productSizeImageJob.js`).

All three write `product_images` with different "who becomes primary" rules (see §12, H-5).

---

## 3. Architecture diagram

```
 SYNC (HTTP request/response)                         ASYNC (pg-boss worker, in backend process)
 ────────────────────────────                         ─────────────────────────────────────────
 Admin UI (AiImageStudioPage)
   │ POST /admin/products/:id/ai-studio  (multipart, ≤4 files)
   ▼
 createJob ── sharp→JPEG q92 ── S3 references/…jpeg ──► boss.send(ai-studio-analyse) ──► analyseHandler
   │ 202 {jobId}                                                                         gpt-4o vision (AnalysisSchema)
   │                                                                                     job.status=awaiting_confirmation
   │ GET job (poll 2s while analysing)  ◄──────────────────────────────────────────────── [L1] fail → job.failed
   ▼
 Analyse & Confirm (category, customer category, Rose Gold)  ── client-side only state
 Presenter step (non-Ring) → Review Prompts (POST prompt-preview, pure function)
   │ POST …/confirm
   ▼
 confirmJob ── resolveAssetTypesForJob = OUTPUT MANIFEST (4 or 6 or 2…)
            ── previewPromptsForJob = PROMPT BUILDER (persisted per asset)
            ── insert ai_studio_assets (PENDING) ──► boss.send(ai-studio-generate) ──► generateHandler
                                                                                       ├ (Gents) master portrait images.generate
                                                                                       └ runWithConcurrency(4):
                                                                                          generateOneAsset
                                                                                           ├ images.edit (ref [+presenter|identity])  [L2]
                                                                                           ├ validateGeneratedImage gpt-4o            [V1]
                                                                                           ├ (Ring hands) 1 auto-retry on "failed"
                                                                                           ├ S3 products/ai-studio/<job>/<uuid>.png   [K1]
                                                                                           └ asset READY; selected=false if !passed   [N1]
                                                                                       ensureDefaultFeatured → deriveJobStatus     [L3]
   │ GET job (poll 2s while generating)
   ▼
 Review & Import (ReviewImportStep)
   │ for each SELECTED asset, sequentially, in browser-chosen order:            [N1][O1]
   │   POST …/assets/:assetId/import
   ▼
 importAsset (DB txn + row locks) ── read PNG from S3 ── processAndStoreImage:
            4 sizes × (AVIF+WebP) + original.jpeg = 9 S3 PUTs ── insert 9 product_images rows
            sort_order = MAX+1 (append)   is_primary = asset.is_featured           [O1][O2][P1]
   │ POST …/import/complete → job.completed
   │                                         ✗ NO page_cache invalidation          [C1]
   ▼
 Product API  GET /api/v1/products/:slug  → images[] (all 9 rows per group, raw)
 Listing API  → primaryImageUrl = any is_primary 'small' row (avif|webp, unordered)  [P1]
   ▼
 Storefront SSR (page_cache 600 s) → hydrate → TanStack refetch
   PDPPage: hides ORIGINAL+primary when AI exists; ImageGallery groups by sortOrder,
            opens on LOWEST sortOrder (ignores is_primary)                           [O2]
   ProductCard: primaryImageUrl
```

Failure points marked in the diagram:

| Code | Where | What can happen |
|---|---|---|
| L1 | analyse | Job fails ("busy") when OpenAI credits are exhausted or rate-limited |
| L2 | `images.edit` | Asset FAILED: credits/429, safety 400, 5xx; cancelled job leaves assets `GENERATING` forever |
| L3 | worker restart/expiry | Assets left `GENERATING`/`PENDING`; job never reaches a terminal status (no reaper) |
| V1 | validation | Rejected by validation; false failures auto-deselect the image |
| N1 | import selection | **Generated but not imported** — deselected assets are silently skipped |
| K1 | storage key | Key is random UUID under job folder (no slot in key — slot lives only in DB) |
| O1 | import order | Gallery position decided by browser import order; retries append out of order |
| O2 | PDP | PDP opens on lowest `sort_order`, not on the featured/primary image |
| P1 | primary | Primary only moves if the featured asset itself is imported; listing image ≠ PDP first image |
| C1 | cache | No cache invalidation on any image mutation → stale SSR HTML up to 10 min |

Not a failure point (verified): S3 object existence, MIME types, URL format (§9).

---

## 4. Complete generation sequence

| # | Step | File · function | Endpoint / job | Tables | Input → Output | Errors / retry |
|---|---|---|---|---|---|---|
| 1 | Admin opens studio | `admin/src/pages/products/AiImageStudioPage.tsx` | `GET …/ai-studio/active` (resume) | `ai_studio_jobs` | productId → jobId\|null | none |
| 2 | Upload reference (1 primary + ≤3 supporting) | `UploadStep.tsx` → `api/aiStudio.ts createStudioJob` → `aiStudio.controller.js createJob` | `POST /admin/products/:id/ai-studio` (multer `uploadEnhanceImage.array('images',4)`, `aiStudioRateLimiter` 20/15 min) | `ai_studio_jobs` (status `analysing`) | files → `reference_image_urls[]` | sharp validation (jpeg/png/webp, 200–8000 px); 409 if an active job exists (partial unique index `ai_studio_jobs_one_active_per_product`) |
| 3 | Reference stored | `createJob` | — | — | re-encoded JPEG q92, `products/ai-studio/<productId>/references/<uuid>.jpeg` | S3 error → 500 |
| 4 | Reference analysis | `aiStudioJob.js analyseHandler` → `aiStudioService.analyseJewellery` | pg-boss `ai-studio-analyse` | `ai_studio_jobs.analysis`, `ai_detected_category`, `ai_detected_customer_category` | **primary image only** → `AnalysisSchema` | any error → job `failed` with mapped message; no retry (pg-boss default retry only on throw — handler catches everything) |
| 5 | Category detect/correct | `AnalyseConfirmStep.tsx`, `generationRules.inferJewelleryTypeFromCategory` | client state | — | product category name (keyword match) **wins over** AI type → `jewelleryType` | requires explicit confirm click |
| 6 | Customer category | `AnalyseConfirmStep.tsx` | client state | — | AI suggestion prefilled → `customerCategory` | explicit confirm required |
| 7 | Presenter | `PresenterStep.tsx` (non-Ring only) | `GET /admin/ai-studio/presenters` | `presenters` (2 rows, both active) | → `presenterId` or null | Ring: forced null server-side |
| 8 | Rose Gold | `AiImageStudioPage` (`localStorage aiStudio.defaultGenerateRoseGold`, default **on**) ; `effectiveGenerateRoseGold` (Necklace forced on) | client → confirm body | `ai_studio_jobs.generate_rose_gold` | boolean | — |
| 9 | Output manifest | `aiStudioService.resolveAssetTypesForJob` (+ duplicate in `admin/…/generationRules.ts`) | inside `confirmJob` | `ai_studio_assets` rows (`UNIQUE(job_id, asset_type)`, `display_order` CHECK) | flags → asset type list | — |
| 10 | Prompt assembly | `buildAssetPromptSections` + `assemblePrompt`; template from `ai_studio_category_templates` | `POST …/prompt-preview` (preview), persisted in `confirmJob` | `ai_studio_assets.assembled_final_prompt`, `custom_creative_instructions`, `prompt_mode` | → one string per asset | — |
| 11 | Submit | `confirmJob` → `boss.send(ai-studio-generate)` | `POST …/confirm` | job `generating` | — | 409 if not `awaiting_confirmation` |
| 12 | Generate | `aiStudioJob.generateHandler` → `generateOneAsset` → `aiStudioService.generateShot` | pg-boss `ai-studio-generate` (expire 30 min) | asset `GENERATING` | ref JPEG [+ presenter photo \| + Gents identity PNG] → PNG 1024² | OpenAI SDK `maxRetries:1`, timeout 600 s; errors → asset `FAILED`, `retry_count+1` |
| 13 | Validate | `validateGeneratedImage` (gpt-4o) | same job | `validation_status`, `validation_result` | generated + reference (+identity) → passed/warning/failed | validator error swallowed → status `null`; Ring hand shots auto-retry once on `failed` |
| 14 | Store raw | `storageProvider.save` | same job | asset `READY`, `image_key` | PNG → `products/ai-studio/<jobId>/<uuid>.png` | S3 error → asset FAILED |
| 15 | Default featured | `ensureDefaultFeatured` | end of run | `is_featured` | first READY `YELLOW_FRONT`/`RING_GOLD_FRONT` | none if that asset failed |
| 16 | Job status | `deriveJobStatus` | end of run | job `review_ready` / `partially_failed` / `failed` / *unchanged* | — | stays `generating` if any asset is still non-terminal |
| 17 | Admin preview | `GenerateStep.tsx`, `ReviewImportStep.tsx` | `GET …/ai-studio/:jobId` polled every 2 s while `analysing`/`generating` | — | `assetDto.imageUrl` = full-size S3 PNG | polling stops on any other status |
| 18 | Approve / select | `ReviewImportStep` → `PATCH …/assets/:assetId` (`updateAssetSelection`) | sync | `selected`, `is_featured`, `validation_accepted` | — | 400 if selecting un-accepted failed/warning asset |
| 19 | Import | `ReviewImportStep.runImport` (sequential) → `POST …/assets/:assetId/import` → `importAsset` | sync, DB txn, `FOR UPDATE` locks | `product_images` ×9 rows; asset `imported=true`; job `importing` | PNG → 9 derivatives | per-asset idempotent; failures listed as "N failed", "Retry Failed Imports" |
| 20 | Derivatives | `imageProcessingService.processAndStoreImage` | inside import txn | S3 `products/<productId>/<uuid>-{thumbnail,small,medium,large}.{avif,webp}`, `-original.jpeg` | widths 150/400/800/1600, AVIF q85, WebP q75 | S3 PUTs are not rolled back if the txn fails (orphans) |
| 21 | Finish | `completeImport` | `POST …/import/complete` | job `completed` | — | 409 if a *selected* asset isn't imported |
| 22 | Product API | `productsService.getPublicProductBySlug` → `products.controller` DTO | `GET /api/v1/products/:slug` | `product_images ORDER BY sort_order` | all rows `{id,type,variant,format,url,isPrimary,sortOrder}` | — |
| 23 | Listing API | `PRIMARY_IMAGE_JOIN` (`products.repository.js`) | list/search/home endpoints | `is_primary AND variant='small' LIMIT 1` | `primaryImageUrl` | — |
| 24 | Storefront | `web/src/pages/PDPPage.tsx`, `features/pdp/ImageGallery.tsx`, `components/ProductCard.tsx`; SSR `web/server/index.js` + `pageCache.js` | SSR + client | `page_cache` | groups by sortOrder, AVIF→WebP, srcset 800w/1600w | SSR failure → client-only shell |

---

## 5. Six-image logic (actual implementation)

Manifest function (`resolveAssetTypesForJob`, identical copy in `admin/src/features/aiStudio/generationRules.ts`):

| Case | Manifest produced | Count | Spec expects |
|---|---|---|---|
| Non-Ring, Rose ON, presenter | YELLOW_FRONT, YELLOW_HERO_45, ROSE_FRONT, ROSE_HERO_45, PRESENTER_YELLOW_1, PRESENTER_ROSE | **6** | 2Y cat + 2R cat + 1Y pres + 1R pres = 6 ✅ |
| Non-Ring, Rose OFF, presenter | YELLOW_FRONT, YELLOW_HERO_45, PRESENTER_YELLOW_1, PRESENTER_YELLOW_2 | **4** | 4Y cat + 2Y pres = 6 ❌ |
| Non-Ring, Rose ON, no presenter | 2Y + 2R catalogue | **4** | 6 ❌ |
| Non-Ring, Rose OFF, no presenter | 2Y catalogue | **2** | 6 ❌ |
| Necklace | Rose forced ON → as row 1 or 3 | 6 / 4 | — |
| Ring, Rose ON | RING_HAND_1 (Y), RING_HAND_2 (**R**), RING_GOLD_FRONT, RING_GOLD_SIDE, RING_ROSE_FRONT, RING_ROSE_SIDE | **6** | ✅ (2Y+2R cat, 1Y+1R "presenter" = hands) |
| Ring, Rose OFF | HAND_1, HAND_2 (Y), GOLD_FRONT, GOLD_SIDE | **4** | 4Y cat + 2Y pres = 6 ❌ |

Count by layer:

| Layer | Source | Value |
|---|---|---|
| Frontend expected | `generationRules.resolveAssetTypesForJob` ("Confirm & Generate N Images") | same as table — consistent with backend |
| Backend expected / manifest | `aiStudioService.resolveAssetTypesForJob` | same |
| Worker count | targets = all `PENDING` assets (or `assetIds` on retry) | = manifest |
| DB output records | `ai_studio_assets` (UNIQUE job+type) | = manifest. Production: 2,323 of 2,326 confirmed jobs have 6 rows; the other 3 have 4 (Rose ON is the localStorage default; only 1 confirmed job ever ran with Rose OFF) |
| Progress denominator | `GenerateStep`: `assets.length`; no % bar, per-tile status | = manifest |
| Import expected | `selected.length` (not the manifest) | **varies** — validation auto-deselects |
| Gallery order | browser import order: `display_order`, Ring hands +100 (last); appended after existing images (`MAX(sort_order)+1`) | not deterministic across retries/re-imports |
| Primary | `is_featured` asset → `is_primary`; default featured YELLOW_FRONT / RING_GOLD_FRONT | only if that asset is imported |

Mismatches: (1) Rose OFF and no-presenter cases never produce six; (2) import count ≠ manifest; (3) gallery order is a client-side decision; (4) the `PRESENTER_YELLOW_2` slot only exists when Rose is OFF, so the same slot index means different shots depending on a flag; (5) `display_order` values overlap between Ring and non-Ring vocabularies (both start at 0).

---

## 6. Category rules (actual)

Common to every category: `FIDELITY_BLOCK` (preserve "…band or chain proportions, **clasps**…"), metal-colour sentence, satin catalogue background keyed by metal (`RING_GOLD_/RING_ROSE_CATALOGUE_BACKGROUND_NOTE`, now used for *all* categories), `CATALOGUE_NO_PERSON_NOTE` on non-Ring catalogue shots, generic validator. Output always 1024×1024 PNG regardless of prompt text.

| Category | Catalogue views | Presenter / placement | Special rules | Hidden fastening | Validator extras | Auto-retry |
|---|---|---|---|---|---|---|
| Ring | True Front + ¾ Side (Gold, Rose) | 2 **hand** shots, text-only identity (female default; Gents/Kids text variants) | `RING_FIDELITY_EXTRA`, hand placement negatives, hand background ≠ metal colour | n/a | per-shot orientation checklists (front/side/hand) | hands: 1 automatic retry on `failed` |
| Necklace | Front + 45° Hero (Y+R, forced) | neck & upper chest; library photo | set-earrings fidelity notes (catalogue vs presenter variants) | **none** | set-earring rules | no |
| Bracelet | Front + 45° Hero | one visible wrist | `BRACELET_CLASP_HIDDEN_NOTE` | **yes** (only category) | generic | no |
| Bangle | Front + 45° | one visible wrist | — | none | generic | no |
| Pendant | Front + 45° | neck | — | none | generic | no |
| Earrings | Front + 45° | ears | — | n/a | generic | no |
| Chain | Front + 45° | **generic** "its natural position" | — | **none** | generic | no |
| Anklet | Front + 45° | **generic** (template says "ankle-focused") | — | **none** | generic | no |
| Mangalsutra | Front + 45° | **generic**; excluded list forbids "necklaces, pendants" | — | none | generic — systematically reports "Expected Mangalsutra, detected Necklace/Pendant" | no |
| Nose pin / Brooch / Other | Front + 45° | generic | — | none | generic | no |

Templates (`ai_studio_category_templates`, all active): every category has the **same** `front_prompt` — *"…on a seamless neutral studio background… no props, no people"* — and `presenter_crop = 'portrait 4:5'`.

**Hidden-fastening check:** Necklace ❌, Bracelet ✅, Anklet ❌. Bracelet's rule also directly contradicts `FIDELITY_BLOCK` ("preserve … clasps").

Crop/position: catalogue prompts say 816×816 (`CATALOGUE_SIZE_NOTE`, `HERO_45_PROMPT`, `RING_SIZE_NOTE`); presenter says 4:5; the API is always called with `size:'1024x1024'`.

---

## 7. Customer Category and presenter logic

| Customer category | Non-Ring presenter shots | Ring hand shots | Identity reference |
|---|---|---|---|
| Women (default) | presenter library photo attached as 2nd image (`front_portrait_url` for Y1/Rose, `face_45_url` for Y2) + its `prompt_descriptor` | hardcoded female text | photo for presenter shots; **text-only** for hands |
| Unisex | identical to Women (no branch exists) | identical to Women | same |
| Gents | library photo **not** attached; one master portrait per job via `images.generate`, stored in `gents_master_presenter_key`, attached as image #1 | Gents hand text | photo for presenter shots; **text-only** for hands |
| Kids | library photo not attached; text descriptor only | Kids hand text | **text-only** everywhere |

Does customer category leak into other dimensions?

| Dimension | Affected? |
|---|---|
| Image count / catalogue views / metal distribution / order / progress / gallery positions | No (manifest ignores it) ✅ |
| Catalogue **prompts** | **Yes** — `locked.confirmedCustomerCategory` ("The confirmed customer category is Kids/Gents.") is added to every asset, including product-only catalogue shots. Possibly related: 8 of the 10 Kids safety rejections were catalogue shots. |
| Validation | Adds demographic checks to presenter/hand shots only ✅ |

Consistency: Ring `RING_HAND_1` and `RING_HAND_2` are independent text-only generations — two different people/hands are expected. Kids presenter shots likewise. Gents identity mismatch was flagged 73 times; 64 were accepted and imported anyway.

---

## 8. Prompt inventory and conflicts

| Source | File · constant | Applies to | Order in final prompt |
|---|---|---|---|
| Product identity / category / customer category | `buildAssetPromptSections` `locked.*` | all | 1–3 |
| Global fidelity | `FIDELITY_BLOCK` | all | 4 |
| Metal colour | `metalColourNote` | all | 5 |
| Composition | `CATALOGUE_SIZE_NOTE` + template `front_prompt`; `HERO_45_PROMPT`; Ring front/side literals; presenter `template.presenter_placement/crop`; `RING_SIZE_NOTE`+`RING_HAND_PLACEMENT_COMPOSITION` | per asset type | 6 |
| Presenter pose | presenter `prompt_descriptor`, `GENTS_/KIDS_PRESENTER_DESCRIPTOR` | presenter shots | 8 |
| Category placement | `PLACEMENT_RULES` / `GENERIC_PLACEMENT_RULE`; Ring hand texts; `GENTS_IDENTITY_LOCK_NOTE` | presenter/hand | 9 |
| Background | `RING_GOLD/ROSE_CATALOGUE_BACKGROUND_NOTE`, `PRESENTER_BACKGROUND_NOTE`, `RING_HAND_BACKGROUND_NOTE`, Gents/Kids variants | all | 10 |
| Lighting | `RING_CATALOGUE_LIGHTING_NOTE`, `RING_HAND_LIGHTING_NOTE` | catalogue/hand | 11 |
| Admin custom | `custom_creative_instructions` (6 fields, ≤500 chars each) | any | replaces creative fields |
| Negatives | per-type list + `RING_FIDELITY_EXTRA`, `BRACELET_CLASP_HIDDEN_NOTE`, `NECKLACE_SET_NOTE_*`, `CATALOGUE_NO_PERSON_NOTE`, audience negatives | per type/category | 13 |
| Regeneration | `priorFailure` → "A previous attempt was rejected: … Correct this specific issue." (prompt rebuilt from code, **not** from the persisted prompt) | retries after warning/failed | appended to negatives |
| Output spec | `locked.outputSpecs` | all | last |
| Quality check | `VALIDATION_SYSTEM_PROMPT` + `ring/necklace/catalogue/audienceValidationContextFor` | all | separate call |
| Analysis | `ANALYSIS_SYSTEM_PROMPT` | analyse | separate call |
| Gents identity | `GENTS_MASTER_PRESENTER_PROMPT` | Gents | separate call |
| Image Enhancement | `imageEnhancementService.js ENHANCEMENT_PROMPT` | manual enhance tool | separate feature |
| Product Size | `productSizeImageService.js PRODUCT_SIZE_BASE_PROMPT` + its own validator | size image | separate pipeline |

There's no prompt versioning: `prompt_version`/`template_version` are hard-coded `'v1'` while the prompt text has changed many times.

### Conflicts found (confirmed in the assembled prompts stored in production)

1. **Background, three-way contradiction (every non-Ring catalogue shot):** template says *"seamless neutral studio background… no props"*, then *"soft champagne-ivory satin fabric backdrop with visible folds"*, then the negative *"Do not add props, text, hands, packaging, flowers, **fabric** or decorative elements."* The 45° Hero adds a second "…**fabric**…" exclusion.
2. **Clasp:** `FIDELITY_BLOCK` "preserve … clasps" vs `BRACELET_CLASP_HIDDEN_NOTE` "do not show the clasp".
3. **Size/aspect:** "816 × 816px" and "portrait 4:5 crop" vs actual `1024x1024`.
4. **Mangalsutra presenter:** *"Place only this exact mangalsutra on the selected presenter's its natural position. No other jewellery of any kind — no … necklaces, pendants …"* — a grammatically broken placement, plus an exclusion list that forbids the product's own form (a mangalsutra *is* a necklace with a pendant). The validator then fails 195 of 390 Mangalsutra images on category.
5. **Presenter lighting:** the presenter `prompt_descriptor` contains "warm ambient lighting" while the background note asks for a solid studio backdrop.
6. **Duplication:** "Photorealistic, premium e-commerce… No text, logos, or watermarks." appears twice in every prompt; "Do not redesign, reinterpret…" appears twice; the excluded-jewellery sentence appears twice in presenter prompts.
7. **Necklace/Anklet:** no hidden-fastening rule despite the stated requirement.

### Sanitized example — catalogue (YELLOW_FRONT, Mangalsutra, stored prompt)

```
Use the uploaded product reference as the only jewellery design. The confirmed product category is Mangalsutra.
The uploaded jewellery reference is the definitive product. Preserve its exact jewellery type, … clasps, … Photorealistic,
premium e-commerce jewellery photography. No text, logos, or watermarks. The metal colour is yellow gold — preserve it exactly.
Create a premium square jewellery catalogue photograph at 816 × 816px. A clean, straight-on catalogue product photo on a
seamless neutral studio background, evenly lit, centred, no props, no people. Use a soft champagne-ivory satin fabric backdrop
with visible natural folds and drape — base colour #F4E7DA … Use soft, premium studio lighting … Do not redesign … This is a
product-only catalogue image: do not include any person … Do not add props, text, hands, packaging, flowers, fabric or
decorative elements. Photorealistic, premium e-commerce jewellery photography. No text, logos, or watermarks.
```

### Sanitized example — presenter (PRESENTER_YELLOW_1, Mangalsutra)

```
… The metal colour is yellow gold — preserve it exactly. Framed as a traditional neck portrait presenter shot (portrait 4:5 crop).
Use realistic product scale and placement. Worn naturally by a traditional presenter with graceful ethnic/festive styling and warm
ambient lighting, matching the attached presenter reference photo. Place only this exact mangalsutra on the selected presenter's its
natural position. No other jewellery of any kind — no rings, earrings, necklaces, pendants, … Use a soft, solid studio backdrop colour
that elegantly complements the presenter … Do not replace the uploaded product with a similar design. Photorealistic, …
```

### Sanitized example — regeneration (retry of a failed RING_GOLD_FRONT)

When an asset with `validation_status` ≠ passed is retried, `promptOverride` is skipped and the prompt is **rebuilt from current code** (`buildPrompt`). If the code changed since the job was confirmed, the retry silently uses the new text:

```
<same locked + composition + background sections as the original> … Do not use the same orientation as the Three-Quarter Side View
shot … A previous attempt was rejected: Failed: Image is not a true front view; the ring is at a three-quarter angle.
Correct this specific issue. Photorealistic, premium e-commerce jewellery photography. No text, logos, or watermarks.
```

---

## 9. Storage architecture

| Item | Value |
|---|---|
| Reference images | `products/ai-studio/<productId>/references/<uuid>.jpeg` (re-encoded JPEG q92) |
| Raw generated | `products/ai-studio/<jobId>/<uuid>.png` (1024×1024, ~1–2 MB) — slot is **not** in the key; only `ai_studio_assets.image_key` links it |
| Gents identity | `products/ai-studio/<jobId>/gents-master-<uuid>.png` |
| Final derivatives | `products/<productId>/<uuid>-{thumbnail,small,medium,large}.{avif,webp}` + `-original.jpeg` (widths 150/400/800/1600, `withoutEnlargement` → a 1024 source yields a 1024-wide "large") |
| MIME | from extension in `storageProvider.s3.save` |
| Access | public-read bucket policy; no signed URLs anywhere |
| Cache headers | new uploads `public, max-age=31536000, immutable`; most pre-existing objects have none (separate pending S3 task) |
| DB URL = API URL = rendered URL | yes — `https://boxgold.s3.ap-south-1.amazonaws.com/<key>`, unchanged end to end |
| Temp files | none on disk (all buffers in memory) |

**Verification (read-only):**
- `HEAD` of every `product_images` large+small AVIF URL (15,798 objects): **15,798 × HTTP 200 `image/avif`**.
- The 400 most recent `ai_studio_assets.image_key` objects: **400 × 200 `image/png`**.
- `product_images`: 0 non-S3 URLs, 0 signed URLs, 0 local URLs; 7,899 groups all have exactly 9 rows; 0 duplicate variant/format rows; 0 groups with mixed `is_primary`; 0 products with >1 primary; 0 imported assets without `image_key`.

**Conclusion:** storage, URLs, MIME types and derivatives are healthy. Images are not disappearing at the storage layer.

---

## 10. Database relationships

```
products 1─* product_images (type ORIGINAL|AI_GENERATED|PRODUCT_SIZE, variant, format, url, is_primary, sort_order)
products 1─* ai_studio_jobs (status, reference_image_urls jsonb, analysis, jewellery_type, customer_category,
                             generate_rose_gold, presenter_id→presenters, gents_master_presenter_key)
ai_studio_jobs 1─* ai_studio_assets (asset_type, display_order, status, image_key, assembled_final_prompt,
                             validation_status/result/accepted, selected, is_featured, imported, retry_count, error)
ai_studio_category_templates (jewellery_type → front_prompt, presenter_placement, presenter_crop, hero_45_prompt)
legacy: ai_image_jobs 1─* ai_generated_images ; ai_studio_presenters → renamed `presenters`
```

There is **no link** from a `product_images` row back to the `ai_studio_assets` row it came from, and no metal-colour or slot column on `product_images`. After import, the system can't tell which gallery image is "Rose Gold Front".

Production counts:

| Check | Result |
|---|---|
| Jobs | completed 2,006 · cancelled 311 · review_ready 66 · failed 42 · partially_failed 5 · importing 1 |
| READY assets **never imported** | completed jobs **1,092** (675 still need "Accept"), review_ready 396, partially_failed 17, cancelled 1,292 |
| Completed jobs whose featured asset was not imported | **180** |
| Latest completed job per product, imported < 6 | 137 products (59 imported 2/6, 40 imported 1/6) |
| Assets stuck `GENERATING` | 86 (all in cancelled jobs) · `PENDING` 32 (cancelled/failed jobs) |
| Job stuck `importing` since 2 Sep (blocks new jobs for that product) | 1 |
| Validation outcome on READY assets | Ring: **3,432 failed / 1,588 passed / 124 warning** · Mangalsutra 195 failed / 165 passed |
| Failed-validation assets accepted & imported anyway | 3,394 (+2,524 warnings) |
| Products with AI images where PDP first image ≠ featured/primary | **906 of 1,287** published |
| Products with >1 completed job | 580 (481 with two jobs) |
| Products where imported AI images were later removed | 510 |
| Shared image URLs across products (attach-existing) | 9 URLs / 18 rows |
| AI products showing an old non-primary ORIGINAL first on PDP | 2 |
| Primary=ORIGINAL while AI images exist | 1 (DRAFT) |
| Published products with no images | 0 |

---

## 11. Display pipeline investigation

### Example A — successful: Giardinonia Diamond Ring (job `00d14adb…`, Ring, Women, Rose ON)

| Stage | Result |
|---|---|
| Manifest | 6 Ring assets ✅ |
| Generation | all 6 READY, 33–79 s each, retry_count 0 |
| Validation | **5 of 6 failed** (e.g. "Not a true front view", "Expected Yellow, detected Rose"), all "Accepted Anyway" |
| Import | 6/6 imported 18:25–18:26 (~13 s per asset), sort 0–5, primary = sort 2 |
| Storage | all objects 200 |
| API | 6 groups, 9 rows each ✅ |
| Storefront | PDP opens on sort 0 (Yellow Front); listing card shows primary (the admin-featured **Rose** Front). The product's "first image" differs between the listing and the PDP. |

### Example B — problematic: Rovella Diamond Tanmaniya with Chain (job `f15167d6…`, Mangalsutra, 19 Oct)

| Stage | Result |
|---|---|
| Manifest | 6 assets ✅ |
| Generation | all 6 READY |
| Validation | **6 of 6 failed** — "Expected Mangalsutra, but Necklace/Pendant was detected" (false failure) |
| Selection | worker set `selected=false` on all six; admin accepted only YELLOW_FRONT and ROSE_FRONT |
| Import | **2 of 6 imported**; job `completed`; 4 generated images never reached the product |
| Product gallery | 6 groups = 2 new images (sort 0, 2, created 18:12) + 4 images from an **earlier run** (sort 1, 4, 5, 6, created 07:37–07:41); sort 3 missing |
| API / storefront | serves this mixed set exactly as stored; images display, but they come from two runs with different backgrounds and poses |

**Where the image stops:** at **Review & Import selection** (N1). The trigger is a validation false failure, followed by auto-deselection. Classification: *Validation failure → Approval/import failure*, then *Gallery-order failure*.

### Failure classification

| Failure class | Status | Evidence |
|---|---|---|
| Approval/import failure (generated, never imported) | **Confirmed** | 1,092 + 396 + 17 READY unimported assets; 180 completed jobs without featured import |
| Validation failure (false negatives drive N1) | **Confirmed** | Ring 66 % fail rate; Mangalsutra category false-fails; 3,394 failures overridden by admins |
| Gallery-order failure (PDP opens on non-featured image; mixed runs; holes) | **Confirmed** | 906/1,287 products; Example B |
| Generation failure (OpenAI credits exhausted, shown as "busy") | **Confirmed** | 431 log lines "429 You have no credits remaining"; 85 job + 79 asset errors labelled "busy" |
| Generation failure (safety rejection shown as "image could not be processed") | **Confirmed** | 46 log lines "rejected by the safety system"; 10 Kids assets |
| CDN/cache failure (stale page after import) | **Highly likely** (≤10 min) | no `invalidateProductPages` call in any image mutation; `page_cache` TTL 600 s |
| Progress failure (assets stuck GENERATING) | **Confirmed** (cancelled jobs only) / **Possible** (worker restart) | 86 assets |
| SSR rendering failure ("Too Many Requests" → client-only shell) | **Confirmed historical, resolved** | 1,615 entries in `boxdiamonds-web-error.log`, last written 6 Oct; loopback is now exempt in `middleware/rateLimit.js` |
| Storage / URL / API serialization failure | **Not found** | §9 checks all pass |
| Product-variation selection failure (rose gold selected but gallery doesn't switch) | **Confirmed by design** | no metal/slot data on `product_images`; gallery never filters by gold colour |

---

## 12. Root-cause findings

### Critical — images generated but never shown

**C-1 Validation auto-deselection silently drops generated images from import** — *Confirmed*
- Evidence: `aiStudioJob.js generateOneAsset` sets `selected:false` for any non-passed result; `ReviewImportStep.handleImport` imports only `selected`; `completeImport` closes the job once every *selected* asset is in. Data: 1,092 READY assets unimported in completed jobs, 180 completed jobs without the featured image, Example B.
- User effect: the admin sees "Import 2 Images" and believes the job is done; 4 of 6 images never appear on the product.
- Root cause: an unreliable validator is wired as a gate, and the gate's effect (deselection) isn't surfaced as a blocking decision.
- Fix: never complete a job while READY assets are undecided. Each slot must be explicitly *Imported* or *Discarded*. Show "4 images need a decision" as a blocking state, not a hidden checkbox.
- Risk: low. Complexity: S–M.

**C-2 Validator false failures (Ring orientation, Mangalsutra category)** — *Confirmed*
- Evidence: Ring 3,432/5,170 failed; 195/390 Mangalsutra failed, mostly "Expected Mangalsutra, detected Necklace/Pendant"; 3,394 failures overridden by admins.
- User effect: feeds C-1, and validation has become noise that admins click through.
- Root cause: the Mangalsutra category is visually a necklace with a pendant, so the enum-level comparison can't work; the Ring orientation checklist is stricter than the generator's real output; one vision call judges its own image without sibling context.
- Fix: per-category equivalence (Mangalsutra ⊃ Necklace/Pendant); treat orientation issues as `warning`; report a confidence per check; measure precision against admin decisions before using validation as a gate.
- Risk: low. Complexity: M.

**C-3 PDP gallery opens on a different image than the featured/listing image** — *Confirmed*
- Evidence: `ImageGallery.groupPhotos` sorts by `sortOrder` and starts at index 0; `is_primary` is used only by the listing join. 906 of 1,287 published AI products differ.
- User effect: customers click a Rose Gold card and land on a Yellow Gold photo (Giardinonia), or see a hand shot or old photo first.
- Root cause: two independent notions of "first image" (`is_primary` and `sort_order`), and ordering decided by browser import order.
- Fix: make import put the featured asset at the lowest `sort_order` (or make the gallery start on the primary), and assign gallery position server-side from the slot.
- Risk: low. Complexity: S.

### High

**H-1 No cache invalidation for any image mutation** — *Confirmed (code); Highly likely impact*
- Evidence: `invalidateProductPages` is never called from `importAsset`, `completeImport`, `uploadOriginal`, `attachExisting`, `setPrimary`, `reorder`, `remove` or `approve`.
- User effect: for up to 10 min after import, SSR HTML (PDP, listing, home) shows old or no images; the client refetch usually corrects the PDP after hydration, while crawlers and first paint see stale content.
- Fix: call `safeInvalidateProductPages(product)` after each of these mutations (and once in `completeImport`).
- Risk: low. Complexity: S.

**H-2 Partial imports mix generations; gallery appends and leaves holes** — *Confirmed*
- Evidence: `MAX(sort_order)+1` appends; 580 products had more than one completed job; Example B mixes two runs and has a missing position.
- Fix: slot-based import that *replaces* the slot's previous image (keeping the old one for rollback), with a deterministic slot→position map.
- Complexity: M.

**H-3 Rose OFF / no-presenter manifests are not six images** — *Confirmed (code)*
- Evidence: see §5.
- Fix: one authoritative 6-slot manifest per (category, rose flag).
- Complexity: M (prompts for 2 extra Yellow views).

**H-4 Prompt contradictions (background/fabric, clasp, size, Mangalsutra placement)** — *Confirmed*
- Evidence: §8 and the stored prompts.
- User effect: inconsistent backgrounds (flat vs satin), visible clasps, mis-placed Mangalsutra, and validator confusion.
- Fix: a rule builder with explicit precedence; remove the template background text; add hidden-fastening rules for Necklace, Anklet and Chain/Mangalsutra if wanted; fix the generic placement grammar and the excluded list.
- Complexity: M.

**H-5 Delete removes S3 objects that other products still reference** — *Confirmed (code), latent*
- Evidence: `productImages.controller.remove` deletes `storageProvider.delete(keyFromUrl(url))` for every row without checking other `product_images` rows. `attachExisting` shares URLs (9 URLs / 18 rows exist today).
- User effect: deleting a shared photo from product A breaks it on product B.
- Fix: delete the object only when no other row references the URL.
- Complexity: S.

**H-6 Primary rules differ between paths** — *Confirmed*
- Evidence: `uploadOriginal` treats "first ORIGINAL" as the trigger, so a manual upload to an AI-only product steals primary. The legacy `approve` path uses "no images at all". AI Studio uses "featured imported". `PDPPage` hides only `ORIGINAL && isPrimary`, so after the AI featured import an old manual photo becomes visible again (2 products).
- Fix: a single primary policy in one repository function.
- Complexity: S.

### Medium

**M-1 OpenAI billing exhaustion reported as "busy, try again"** — *Confirmed*
- Evidence: `mapOpenAiError` maps every `RateLimitError` (including `insufficient_quota`) to "busy"; 431 log entries.
- Fix: distinguish quota from rate limit, alert, and stop the queue.
- Complexity: S.

**M-2 Safety rejections reported as "uploaded image could not be processed"** — *Confirmed*
- Evidence: 46 log entries; 10 Kids assets, 8 of them catalogue shots whose prompt contains "customer category is Kids".
- Fix: map `content_policy` separately, and drop the customer-category sentence from catalogue prompts.
- Complexity: S.

**M-3 No reaper for non-terminal assets/jobs** — *Confirmed (86 GENERATING in cancelled jobs); Possible after restarts*
- Evidence: a pm2 restart or pg-boss expiry mid-run leaves assets `GENERATING`, which first-run retries skip (they target only `PENDING`). The job then never leaves `generating`. Worst-case Ring-hand time (2 attempts × 600 s × SDK retry) exceeds the 30-min expiry → *Possible* duplicate run.
- Fix: heartbeat/timeout reaper, idempotent per-slot generation, expiry sized to real worst case.
- Complexity: M.

**M-4 Job stuck in `importing` blocks new jobs** — *Confirmed (1 job)*
- Evidence: `findActiveJobByProduct` includes `importing`.
- Fix: auto-complete when all selected assets are imported.
- Complexity: S.

**M-5 Gallery order is a client decision** — *Confirmed*
- Evidence: `importSortKey` lives in `ReviewImportStep.tsx`; "Retry Failed Imports" appends retried slots after the others.
- Complexity: S (move to server).

**M-6 Regeneration rebuilds the prompt from current code, not the confirmed prompt** — *Confirmed*
- Evidence: `generateOneAsset` sets `promptOverride` undefined whenever `priorFailure` is set.
- Complexity: S.

**M-7 Validation call failures are swallowed (status `null`)** — *Confirmed*
- Evidence: 61 READY assets.
- Effect: the image passes the import gate unvalidated.

### Low

- **L-1** Manifest, metal mapping and catalogue type sets are duplicated in 3–4 places: `aiStudioService.js`, `aiStudio.controller.js`, `generationRules.ts`, `ReviewImportStep.tsx`, plus the DB CHECK.
- **L-2** `prompt_version`/`template_version` are hard-coded `'v1'`, so there's no traceability.
- **L-3** The legacy `ai-images` stub pipeline is still routable.
- **L-4** The listing `PRIMARY_IMAGE_JOIN` picks AVIF or WebP arbitrarily (`LIMIT 1`, no `ORDER BY`; 1,292 products have both).
- **L-5** The admin preview loads full 1–2 MB PNGs for every tile.
- **L-6** Three image-object shapes: admin grouped `{sortOrder, variants[]}`, storefront raw rows, studio `imageUrl`.
- **L-7** S3 PUTs happen inside the DB transaction, so failed imports leave orphan objects.
- **L-8** Comments describe removed features (e.g. "Hand Pose" choice, "no upload flow exists yet").

---

## 13. Target architecture

| Component | Responsibility | Input → Output | Failure | Retry |
|---|---|---|---|---|
| Reference Analyzer | type/metal/stones/customer suggestion | reference → analysis + confidences | job `needs_input`, explicit error code | 2× backoff on 429/5xx; none on quota |
| Category Resolver | final jewellery type + equivalence groups (Mangalsutra≈Necklace/Pendant) | analysis + product category + admin choice → `jewelleryType` | blocks until confirmed | — |
| Customer Category Resolver | presenter identity policy only | admin choice → `{presenterSource, identityRef}` | — | — |
| Output Manifest Builder | **one** server-owned 6-slot manifest `(slotId, view, metal, kind, galleryPosition)` | type + rose flag → 6 slots | invalid combo → 400 | — |
| Prompt Rule Builder | layered rules with precedence (fidelity > category > view > metal > background > creative), conflict lint, versioned | slot + rules version → prompt + `prompt_version` hash | lint failure blocks confirm | — |
| Generation Orchestrator | dependent ordering (identity → presenter shots), per-slot state machine, heartbeats | manifest → slot jobs | slot `failed` with code | per-slot, bounded, idempotent by `(job, slot, attempt)` |
| AI Provider Adapter | OpenAI calls, error taxonomy (quota / rate / safety / bad-input / 5xx) | request → buffer or typed error | quota halts the queue and alerts | rate/5xx only |
| Identity Reference Manager | one identity per job per audience (incl. Women ring hands, Kids) | category → stored identity image | — | regenerate only on explicit admin action |
| Quality Validator | advisory scores per check, category-aware, calibrated | image + ref → checks[] | errors recorded, never null-silent | 1× |
| Asset Processor | derivatives (AVIF/WebP sizes + original) **before** the DB txn | PNG → derivative set | cleanup on failure | 1× |
| Storage Adapter | write-once keys incl. slot `…/<slot>/<uuid>`, ref-counted delete | buffer → key/url | — | SDK |
| Product Image Importer | slot-aware replace (old kept as `archived`), server-assigned position, single primary policy, `source_asset_id` link | slot decisions → product_images | txn rollback + orphan cleanup | idempotent |
| Cache Invalidator | product, category, home `page_cache` after any image mutation | productId → DELETEs | logged, non-fatal | — |
| Audit Logger | who/what/when per slot: prompt version, model, validation, decision | events → append-only table | — | — |

---

## 14. Prioritized roadmap

| Phase | Changes | Dependencies | Risks | Tests | Rollback | Expected result |
|---|---|---|---|---|---|---|
| **1 Display reliability** | (a) block job completion while READY slots are undecided; show unimported count; (b) import featured slot at position 0 / gallery starts at primary; (c) `safeInvalidateProductPages` on all image mutations; (d) ref-counted S3 delete; (e) auto-complete stuck `importing`; (f) quota/safety error messages | none | low; UI flow change for admins | unit: import ordering, invalidation called; e2e: generate → import → PDP/listing show same first image | revert commits; no schema change | every generated image is either visibly imported or explicitly discarded; listing = PDP first image; no 10-min stale pages |
| **2 Manifest & ordering** | server-owned 6-slot manifest for all flags; slot column + `source_asset_id` on `product_images`; slot-aware replace; remove client `importSortKey` | Phase 1 | migration on 70k rows (additive, nullable) | manifest matrix tests per category × rose × presenter | columns nullable; old path kept behind a flag | deterministic 6 images in fixed gallery positions |
| **3 Product fidelity** | rule builder with precedence + lint; remove template background text; hidden-fastening for Necklace/Anklet/Chain; Mangalsutra placement; drop customer-category line from catalogue prompts; real size/aspect | Phase 2 | visual regressions | golden-prompt snapshot tests; 20-product visual review | prompt version pin | consistent backgrounds, correct fastening, fewer re-rolls |
| **4 Presenter consistency** | identity references for Women ring hands, Kids, Unisex; sequential dependent generation | Phase 3 | safety filter on Kids | identity-match validator precision | per-audience flag | same person across presenter/hand shots |
| **5 Validation & retry** | category-aware, calibrated, advisory validator; slot-specific regeneration using persisted prompt + correction; reaper/heartbeats | Phases 2–3 | over-tight gates again | measure against 3,394 historical overrides | validator → advisory only | validation that admins trust; no stuck jobs |
| **6 Performance & cost** | derivatives outside txn, parallel S3 PUTs; thumbnail previews in admin; stop on quota; dedupe re-runs; retire legacy stub pipeline; clean orphaned/cancelled assets (after approval) | any | deleting data | storage diff dry-run | snapshots | faster import (~13 s → ~3 s/asset), lower OpenAI spend |

---

## 15. Open questions

1. Should Rose OFF really produce **4 Yellow catalogue views**? Today there are only two Yellow catalogue prompts (Front, 45°/Side). Which two new views are wanted?
2. For non-Ring products with **no presenter**, should the 2 presenter slots be replaced (e.g. by extra catalogue views) or stay absent?
3. Should the gallery open on the **featured image**, or on a fixed slot order (e.g. Yellow Front first) with the listing card following it?
4. Should re-generation **replace** a product's previous AI images per slot, or keep appending as today?
5. Is Mangalsutra intended to show a visible chain clasp? And Necklace/Anklet clasps: hide or show?
6. How should the 1,092 unimported READY images in completed jobs, and 66 abandoned review jobs, be handled: reviewed, imported, or discarded? Nothing has been touched.
7. Should validation remain a gate at all, given admins accepted ~72 % of failed images (3,464 of 4,797)?
8. Is the OpenAI account on auto-recharge? The logs show repeated "no credits remaining" periods.
