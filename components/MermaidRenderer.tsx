import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  fontFamily: 'Arial, sans-serif',
  flowchart: { useMaxWidth: true, htmlLabels: false, curve: 'linear' },
  sequence: { useMaxWidth: true },
  securityLevel: 'loose',
});

interface MermaidRendererProps {
  code: string;
  id: string;
  /** Max height in px for the rendered SVG. Default 260. */
  maxHeight?: number;
  className?: string;
  /** Called with the raw SVG string after a successful render. */
  onSvgReady?: (svg: string) => void;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code, id, maxHeight = 260, className, onSvgReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Use a stable per-mount unique suffix so StrictMode double-invocation
  // never produces two concurrent renders with the exact same mermaid ID.
  const mountId = useRef(`${id}-${Math.random().toString(36).slice(2)}`);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !containerRef.current) return;
    let cancelled = false;

    setError(null);
    mermaid.render(`mermaid-${mountId.current}`, code)
      .then(({ svg }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          // Remove fixed width/height attrs so CSS controls size
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.style.maxWidth = '100%';
          svgEl.style.maxHeight = `${maxHeight}px`;
          svgEl.style.height = 'auto';
          svgEl.style.display = 'block';
          svgEl.style.margin = '0 auto';
        }
        onSvgReady?.(svg);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Mermaid render error:', err);
        setError('图表语法错误');
      });

    return () => { cancelled = true; };
  }, [code, id, maxHeight]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className={`p-2 text-slate-400 text-xs text-center ${className}`}>
        [图表渲染失败]
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
};

export default MermaidRenderer;
