import { useRef, useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import styles from './UploadStep.module.css';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_SIZE_MB = 10;
const MAX_FILES = 4;

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'Please choose PNG, JPG, JPEG, or WebP images.';
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `Each image must be smaller than ${MAX_FILE_SIZE_MB}MB.`;
  return null;
}

interface UploadStepProps {
  onSubmit: (_files: File[]) => void;
  isPending: boolean;
  error: string | null;
}

export function UploadStep({ onSubmit, isPending, error }: UploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function addFiles(picked: FileList | File[]) {
    const incoming = Array.from(picked);
    if (files.length + incoming.length > MAX_FILES) {
      setValidationError(`You can upload at most ${MAX_FILES} reference images.`);
      return;
    }
    for (const file of incoming) {
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        return;
      }
    }
    setValidationError(null);
    setFiles((f) => [...f, ...incoming]);
    setPreviews((p) => [...p, ...incoming.map((f) => URL.createObjectURL(f))]);
  }

  function removeAt(index: number) {
    setFiles((f) => f.filter((_, i) => i !== index));
    setPreviews((p) => p.filter((_, i) => i !== index));
  }

  return (
    <div>
      <p>Upload one main reference photo, plus up to 3 supporting angles if you have them.</p>

      {files.length < MAX_FILES && (
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
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <p>Drag and drop jewellery photos, or click to browse</p>
          <p className={styles.hint}>
            PNG, JPG, JPEG, or WebP — up to {MAX_FILE_SIZE_MB}MB each, {MAX_FILES} max
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {(validationError || error) && <p className={sharedStyles.error}>{validationError ?? error}</p>}

      {previews.length > 0 && (
        <div className={styles.previewGrid}>
          {previews.map((url, i) => (
            <div key={url} className={styles.previewCard}>
              <img src={url} alt="" className={styles.previewImg} />
              <button type="button" className={styles.removeBtn} onClick={() => removeAt(i)} aria-label="Remove image">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={sharedStyles.buttonPrimary}
          disabled={files.length === 0 || isPending}
          onClick={() => onSubmit(files)}
        >
          {isPending ? 'Uploading…' : 'Analyse Jewellery'}
        </button>
      </div>
    </div>
  );
}
