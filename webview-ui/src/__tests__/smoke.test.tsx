import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('Vitest webview setup', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });

  it('should render basic React', () => {
    render(<div data-testid="test">Hello</div>);
    expect(screen.getByTestId('test')).toBeInTheDocument();
  });
});
