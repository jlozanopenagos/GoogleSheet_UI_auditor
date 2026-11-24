import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DescriptionCreationView } from '../views/DescriptionCreationView';
import { ScriptRecord } from '../types';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  updateDescriptionField: vi.fn(),
  updateTitleField: vi.fn(),
  generateGeminiDescription: vi.fn(),
}));

const makeScript = (overrides: Partial<ScriptRecord> = {}): ScriptRecord => ({
  ID: 'EE01',
  expression: 'Break a leg',
  script: 'Original script',
  SCRIPT_CHANGED: 'Final script',
  script_ready: true,
  script_date: '31/01/26',
  video_ready: false,
  video_date: '',
  short_description: '',
  short_title: '',
  language: 'english',
  video_type: 'expression',
  ...overrides,
});

describe('DescriptionCreationView - Short Title (Column J)', () => {
  const onScriptUpdated = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty Column J badge and disables Save title for empty or whitespace input', () => {
    render(
      <DescriptionCreationView
        script={makeScript({ short_title: '' })}
        onScriptUpdated={onScriptUpdated}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('No saved title')).toBeInTheDocument();
    const input = screen.getByLabelText('Short title') as HTMLInputElement;
    expect(input.value).toBe('');

    const saveBtn = screen.getByRole('button', { name: /Save title/i });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: '   ' } });
    expect(saveBtn).toBeDisabled();
  });

  it('pre-populates existing Column J title, enables Save on edit, and warns above 100 chars', async () => {
    vi.mocked(api.updateTitleField).mockResolvedValueOnce({
      id: 'EE01',
      short_title: 'Never Say This in London!',
    });

    render(
      <DescriptionCreationView
        script={makeScript({ short_title: 'Existing Short Title' })}
        onScriptUpdated={onScriptUpdated}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Title saved')).toBeInTheDocument();
    const input = screen.getByLabelText('Short title') as HTMLInputElement;
    expect(input.value).toBe('Existing Short Title');

    const saveBtn = screen.getByRole('button', { name: /Save title/i });
    expect(saveBtn).toBeDisabled();

    // Exceeding 100 chars displays warning
    const longTitle = 'A'.repeat(105);
    fireEvent.change(input, { target: { value: longTitle } });
    expect(screen.getByText(/105 \/ 100 chars \(exceeds YouTube 100-char limit\)/i)).toBeInTheDocument();

    // Valid edit enables Save and trims on submit
    fireEvent.change(input, { target: { value: '  Never Say This in London!  ' } });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateTitleField).toHaveBeenCalledWith({
        script_id: 'EE01',
        short_title: 'Never Say This in London!',
      });
    });

    expect(onScriptUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        ID: 'EE01',
        short_title: 'Never Say This in London!',
      })
    );
    expect(onSuccess).toHaveBeenCalledWith(expect.stringContaining('Column J'));
  });
});
