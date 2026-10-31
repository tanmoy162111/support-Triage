import { describe, it, expect } from 'vitest';
import { classifyEdit } from '@/domain/edit-class';

describe('classifyEdit', () => {
  it('unchanged when identical modulo whitespace', () => {
    expect(classifyEdit('Hello  there.\n', 'Hello there.')).toBe('unchanged');
  });
  it('light for a small edit', () => {
    const a = 'Hi Sam, you can reset your password from the login page using the forgot password link. Thanks.';
    const b = 'Hi Sam, you can reset your password from the login page using the forgot password link. Thank you.';
    expect(classifyEdit(a, b)).toBe('light');
  });
  it('rewritten for a large change', () => {
    expect(classifyEdit('Use the reset link.', 'Please contact billing about your invoice and we will review it.')).toBe('rewritten');
  });
  it('rewritten when the original draft was empty (placeholder)', () => {
    expect(classifyEdit('', 'Own reply.')).toBe('rewritten');
  });
});
