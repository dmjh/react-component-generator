import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

// react-live 실행은 이 테스트의 관심사가 아니므로 대체한다.
vi.mock('./LivePreview', () => ({
  LivePreview: ({ code }: { code: string }) => <div data-testid="live-preview">{code}</div>,
}));

const component: GeneratedComponent = {
  id: 'a',
  prompt: '버튼',
  code: 'const A = () => null;',
  createdAt: new Date('2026-01-02T03:04:05Z'),
};

function renderCard(isStreaming: boolean) {
  const props = { component, onRemove: vi.fn(), onRegenerate: vi.fn(), isLoading: isStreaming };
  const view = render(<ComponentCard {...props} isStreaming={isStreaming} />);
  return {
    rerenderWith: (next: boolean) =>
      view.rerender(<ComponentCard {...props} isLoading={next} isStreaming={next} />),
  };
}

describe('ComponentCard 스트리밍', () => {
  it('스트리밍 중에는 코드 탭이 선택되어 있다', () => {
    renderCard(true);
    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');
  });

  it('스트리밍 중에는 미리보기 탭을 비활성화한다', () => {
    renderCard(true);
    expect(screen.getByRole('tab', { name: '미리보기' })).toBeDisabled();
  });

  it('스트리밍이 끝나면 미리보기 탭으로 전환한다', () => {
    const { rerenderWith } = renderCard(true);
    rerenderWith(false);
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('live-preview')).toBeInTheDocument();
  });

  it('스트리밍이 아니면 처음부터 미리보기 탭이다', () => {
    renderCard(false);
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
  });
});
