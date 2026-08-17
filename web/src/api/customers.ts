import { apiFetch } from './client';
import type { Customer } from './types';

export function fetchMe() {
  return apiFetch<{ customer: Customer }>('/customers/me');
}
