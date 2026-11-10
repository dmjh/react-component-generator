import { useState, useRef, useEffect } from 'react';

interface CodeViewProps {
  code: string;
  /** 스트리밍 중에는 새로 생성되는 마지막 줄이 보이도록 하단으로 스크롤한다. */
  followTail?: boolean;
}

export function CodeView({ code, followTail = false }: CodeViewProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (followTail && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [code, followTail]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-panel">
      <div className="panel-header">
        <h3>코드</h3>
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <pre className="code-block" ref={preRef}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
