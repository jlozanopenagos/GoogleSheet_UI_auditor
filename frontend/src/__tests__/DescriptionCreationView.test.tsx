import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DescriptionCreationView } from '../views/DescriptionCreationView';
import { ScriptRecord } from '../types';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  updateDescriptionField: vi.fn(),
  updateTitleField: vi.fn(),
  generateGeminiDescription: vi.fn(),
  generateGeminiTitle: vi.fn(),
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

  it('blocks Gemini title generation when Column D is empty', () => {
    render(
      <DescriptionCreationView
        script={makeScript({ SCRIPT_CHANGED: '' })}
        onScriptUpdated={onScriptUpdated}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Generate title with Gemini/i }));
    expect(api.generateGeminiTitle).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Column D'));
  });

  it('generates distinct thumbnail titles without auto-saving and tracks previous_titles across retries', async () => {
    vi.mocked(api.generateGeminiTitle)
      .mockResolvedValueOnce({
        script_id: 'EE01',
        short_title: 'The old theater lucky secret',
        word_count: 5,
        character_count: 28,
        angle_used: 'Punchy Rule or Insight',
      })
      .mockResolvedValueOnce({
        script_id: 'EE01',
        short_title: 'Why good luck fails backstage',
        word_count: 5,
        character_count: 29,
        angle_used: 'Curiosity Question',
      });
    vi.mocked(api.updateTitleField).mockResolvedValueOnce({
      id: 'EE01',
      short_title: 'Why good luck fails backstage',
    });

    render(
      <DescriptionCreationView
        script={makeScript({ short_title: 'Existing Title', SCRIPT_CHANGED: 'Stop wishing good luck backstage!' })}
        onScriptUpdated={onScriptUpdated}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    // First Gemini generation fills input without calling updateTitleField
    fireEvent.click(screen.getByRole('button', { name: /Generate title with Gemini/i }));

    await waitFor(() => {
      expect(api.generateGeminiTitle).toHaveBeenCalledWith({
        script_id: 'EE01',
        expression: 'Break a leg',
        script_changed: 'Stop wishing good luck backstage!',
        previous_titles: ['Existing Title'],
      });
    });

    const input = screen.getByLabelText('Short title') as HTMLInputElement;
    expect(input.value).toBe('The old theater lucky secret');
    expect(api.updateTitleField).not.toHaveBeenCalled();

    // Regenerating sends both Existing Title and first generated title
    fireEvent.click(screen.getByRole('button', { name: /New title with Gemini/i }));
    await waitFor(() => {
      expect(api.generateGeminiTitle).toHaveBeenLastCalledWith({
        script_id: 'EE01',
        expression: 'Break a leg',
        script_changed: 'Stop wishing good luck backstage!',
        previous_titles: ['Existing Title', 'The old theater lucky secret'],
      });
    });
    expect(input.value).toBe('Why good luck fails backstage');
    expect(api.updateTitleField).not.toHaveBeenCalled();

    // User manually saves to Column J
    fireEvent.click(screen.getByRole('button', { name: /Save title/i }));
    await waitFor(() => {
      expect(api.updateTitleField).toHaveBeenCalledWith({
        script_id: 'EE01',
        short_title: 'Why good luck fails backstage',
      });
    });
    expect(onScriptUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ short_title: 'Why good luck fails backstage' })
    );
  });
});
