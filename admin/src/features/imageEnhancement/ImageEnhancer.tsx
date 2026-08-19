import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { enhanceImage } from '../../api/imageEnhancement';
import { ApiError } from '../../api/client';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ImageEnhancer.module.css';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
// Client-side check only, for fast feedback — the backend's
// MAX_UPLOAD_SIZE_MB (middleware/upload.js) is the authoritative limit.
const MAX_FILE_SIZE_MB = 10;

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Please choose a PNG, JPG, JPEG, or WebP image.';
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `Image must be smaller than ${MAX_FILE_SIZE_MB}MB.`;
  }
  return null;
}

export function ImageEnhancer() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const enhanceMutation = useMutation({ mutationFn: (f: File) => enhanceImage(f) });

  function pickFile(picked: File) {
    const error = validateFile(picked);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    enhanceMutation.reset();
    setFile(picked);
    setOriginalUrl(URL.createObjectURL(picked));
  }

  function reset() {
    setFile(null);
    setOriginalUrl(null);
    setValidationError(null);
    enhanceMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isPending = enhanceMutation.isPending;
  const enhancedUrl = enhanceMutation.data?.image ?? null;
  const apiError =
    enhanceMutation.error instanceof ApiError
      ? enhanceMutation.error.message
      : enhanceMutation.error
        ? 'Enhancement failed. Please try again.'
        : null;

  return (
    <div>
      {!file && (
        <div
          className={isDragging ? styles.dropzoneActive : styles.dropzone}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) pickFile(dropped);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <p>Drag and drop a jewellery photo, or click to browse</p>
          <p className={styles.hint}>PNG, JPG, JPEG, or WebP — up to {MAX_FILE_SIZE_MB}MB</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) pickFile(picked);
        }}
      />

      {validationError && <p className={sharedStyles.error}>{validationError}</p>}

      {file && originalUrl && (
        <>
          <div className={styles.compareGrid}>
            <div className={styles.compareCol}>
              <h3 className={styles.compareLabel}>Original</h3>
              <img src={originalUrl} alt="Original upload" className={styles.compareImage} />
            </div>
            <div className={styles.compareCol}>
              <h3 className={styles.compareLabel}>Enhanced</h3>
              {enhancedUrl ? (
                <img src={enhancedUrl} alt="Enhanced result" className={styles.compareImage} />
              ) : (
                <div className={styles.placeholder}>{isPending ? 'Enhancing…' : 'Not enhanced yet'}</div>
              )}
            </div>
          </div>

          {apiError && <p className={sharedStyles.error}>{apiError}</p>}

          <div className={styles.actions}>
            {!enhancedUrl && (
              <button
                type="button"
                className={sharedStyles.buttonPrimary}
                disabled={isPending}
                onClick={() => enhanceMutation.mutate(file)}
              >
                {isPending ? 'Enhancing…' : 'Enhance Image Quality'}
              </button>
            )}
            {enhancedUrl && (
              <a
                className={sharedStyles.buttonPrimary}
                href={enhancedUrl}
                download={`enhanced-${file.name.replace(/\.[^.]+$/, '')}.webp`}
              >
                Download
              </a>
            )}
            <button type="button" className={sharedStyles.button} onClick={reset} disabled={isPending}>
              Generate Again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
