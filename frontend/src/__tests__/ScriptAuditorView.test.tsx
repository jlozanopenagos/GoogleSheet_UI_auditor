import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScriptAuditorView } from '../views/ScriptAuditorView';
import { ScriptRecord } from '../types';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  updateScriptFields: vi.fn(),
  doctorScriptWithGemini: vi.fn(),
}));

const makeScript = (overrides: Partial<ScriptRecord> = {}): ScriptRecord => ({
  ID: 'EE01',
  row_number: 2,
  expression: 'Break a leg',
  script: 'Original script',
  SCRIPT_CHANGED: 'Finalized script revision',
  script_ready: false,
  script_date: '20/11/26',
  video_ready: false,
  video_date: '',
  short_description: '',
  short_title: '',
  language: 'english',
  video_type: 'expression',
  ...overrides,
});

describe('ScriptAuditorView', () => {
  const onScriptUpdated = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables Save when toggling Column E checkbox or editing Column F date without changing Column D', async () => {
    vi.mocked(api.updateScriptFields).mockResolvedValueOnce({ status: 'success', id: 'EE01' });

    render(
      <ScriptAuditorView
        script={makeScript()}
        onScriptUpdated={onScriptUpdated}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    const saveBtn = screen.getByRole('button', { name: /No changes to save/i });
    expect(saveBtn).toBeDisabled();

    // Toggle Column E checkbox without touching Column D
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /Save revisions to Google Sheets \(EE01\)/i })).not.toBeDisabled();

    // Edit Column F scheduled date
    const dateInput = screen.getByLabelText('Scheduled date (DD/MM/YY)');
    fireEvent.change(dateInput, { target: { value: '25/11/26' } });

    fireEvent.click(screen.getByRole('button', { name: /Save revisions to Google Sheets \(EE01\)/i }));

    await waitFor(() => {
      expect(api.updateScriptFields).toHaveBeenCalledWith({
        script_id: 'EE01',
        SCRIPT_CHANGED: 'Finalized script revision',
        script_ready: true,
        script_date: '25/11/26',
      });
    });

    expect(onScriptUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        ID: 'EE01',
        script_ready: true,
        script_date: '25/11/26',
      })
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /No changes to save/i })).toBeDisabled();
  });
});
