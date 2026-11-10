import { useState, useEffect } from 'react';
import { PromptInput } from './components/PromptInput';
import { ComponentCard } from './components/ComponentCard';
import { Window } from './components/Window';
import { useComponentGenerator } from './hooks/useComponentGenerator';
import type { Provider } from './types';
import {
  readStorage,
  writeStorage,
  parseApiKeys,
  parseProvider,
  addPromptHistory,
  PROMPT_HISTORY_MAX,
  STORAGE_KEYS,
} from './utils/storage';
import './App.css';

const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { label: 'Google', placeholder: 'AIza...' },
} as const;

function App() {
  const [apiKeys, setApiKeys] = useState(() =>
    parseApiKeys(readStorage<unknown>(STORAGE_KEYS.apiKeys, null)),
  );
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useState<Provider>(() =>
    parseProvider(readStorage<unknown>(STORAGE_KEYS.provider, null)),
  );
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    const stored = readStorage<unknown>(STORAGE_KEYS.promptHistory, []);
    return Array.isArray(stored)
      ? stored.filter((p): p is string => typeof p === 'string').slice(0, PROMPT_HISTORY_MAX)
      : [];
  });
  const apiKey = apiKeys[provider];
  const [envKeys, setEnvKeys] = useState<Record<Provider, boolean>>({
    anthropic: false,
    google: false,
  });
  const { components, isLoading, error, generate, removeComponent, clearAll } =
    useComponentGenerator();

  useEffect(() => writeStorage(STORAGE_KEYS.apiKeys, apiKeys), [apiKeys]);
  useEffect(() => writeStorage(STORAGE_KEYS.provider, provider), [provider]);
  useEffect(() => writeStorage(STORAGE_KEYS.promptHistory, promptHistory), [promptHistory]);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setEnvKeys(data.envKeys))
      .catch(() => {});
  }, []);

  const hasEnvKey = envKeys[provider];

  const handleGenerate = (prompt: string) => {
    if (!apiKey.trim() && !hasEnvKey) {
      alert(`${PROVIDER_CONFIG[provider].label} API 키를 입력하거나 .env에 설정해주세요.`);
      return;
    }
    setPromptHistory((prev) => addPromptHistory(prev, prompt));
    generate(prompt, apiKey || undefined, provider);
  };

  const handleApiKeyChange = (value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const activeProvider = PROVIDER_CONFIG[provider].label;

  return (
    <div className="app">
      <header className="menubar">
        <div className="menubar-brand">
          <span className="brand-mark" aria-hidden="true">RC</span>
          <span>컴포넌트 생성기</span>
        </div>
        <dl className="menubar-status" aria-label="현재 작업 상태">
          <div>
            <dt>제공자</dt>
            <dd>{activeProvider}</dd>
          </div>
          <div>
            <dt>컴포넌트</dt>
            <dd>{components.length}개</dd>
          </div>
        </dl>
      </header>

      <main className="workspace">
        <Window title="새 컴포넌트" className="composer-window">
          <div className="intro">
            <h1>프롬프트로 만드는 UI 워크벤치</h1>
            <p>요청을 입력하면 React 컴포넌트를 만들어요. 바로 미리보고, 코드로도 확인할 수 있어요.</p>
          </div>
          <PromptInput onGenerate={handleGenerate} isLoading={isLoading} history={promptHistory} />
        </Window>

        <Window title="실행 설정" className="settings-window">
          <div className="provider-select">
            <label htmlFor="provider">제공자</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              {Object.entries(PROVIDER_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="api-key-input">
            <label htmlFor="api-key">API 키</label>
            <div className="api-key-field">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={
                  hasEnvKey
                    ? '서버 키 사용 중 (직접 입력으로 덮어쓰기 가능)'
                    : PROVIDER_CONFIG[provider].placeholder
                }
              />
              <button
                className="btn-toggle-key"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? '숨기기' : '보기'}
              </button>
            </div>
            <p className={`key-status ${hasEnvKey ? 'key-status--ready' : ''}`}>
              {hasEnvKey ? '.env 키가 연결되어 있습니다.' : '직접 입력하거나 서버 환경변수를 설정하세요.'}
            </p>
          </div>
        </Window>
      </main>

      {error && (
        <div className="alert" role="alert">
          <span className="alert-icon" aria-hidden="true">!</span>
          <p>{error}</p>
        </div>
      )}

      <section className="results-section" aria-label="생성된 컴포넌트">
        {components.length > 0 && (
          <div className="results-bar">
            <h2>생성된 컴포넌트 {components.length}개</h2>
            <button className="btn-clear" onClick={clearAll}>
              전체 삭제
            </button>
          </div>
        )}

        {components.length === 0 && !isLoading && (
          <Window title="생성된 컴포넌트" className="empty-window">
            <div className="empty-state">
              <div className="empty-preview" aria-hidden="true">
                <div className="empty-card empty-card--primary" />
                <div className="empty-card" />
                <div className="empty-card empty-card--wide" />
              </div>
              <div className="empty-copy">
                <h2>새 컴포넌트를 생성해보세요.</h2>
                <p>
                  위 입력창에 만들고 싶은 UI를 적거나 예시를 골라 보세요.
                  <span className="caret" aria-hidden="true" />
                </p>
              </div>
            </div>
          </Window>
        )}

        {isLoading && (
          <div className="loading-card" role="status">
            <p>컴포넌트를 생성하고 있습니다...</p>
            <div className="progress" aria-hidden="true">
              <div className="progress-bar" />
            </div>
          </div>
        )}

        <div className="results-grid">
          {components.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onRemove={removeComponent}
              onRegenerate={handleGenerate}
              isLoading={isLoading}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
