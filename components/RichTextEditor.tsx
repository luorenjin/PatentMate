
import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { renderMarkdown } from '../services/markdownService';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  format?: 'html' | 'markdown';
  editorId?: string;
  focusSignal?: number;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, className, format = 'html', editorId, focusSignal = 0 }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'rich' | 'source'>(format === 'markdown' ? 'source' : 'rich');
  const [sourceContent, setSourceContent] = useState(value);
  const isLocked = useRef(false);

  useEffect(() => {
    setMode(format === 'markdown' ? 'source' : 'rich');
  }, [format]);

  useEffect(() => {
    if (!focusSignal) {
      return;
    }

    if (format === 'markdown') {
      setMode('source');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sourceRef.current?.focus();
        });
      });
      return;
    }

    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, [focusSignal, format]);

  // Sync external value changes to editor
  useEffect(() => {
    if (format === 'html' && mode === 'rich' && editorRef.current && !isLocked.current) {
       const currentHTML = editorRef.current.innerHTML;
       // Only update if significantly different to avoid cursor jumps
       if (value !== currentHTML) {
           editorRef.current.innerHTML = value || '';
           setSourceContent(value || '');
       }
    }
    if (mode === 'source' && !isLocked.current) {
        setSourceContent(value);
    }
  }, [value, mode]);

  const handleInput = () => {
    if (editorRef.current) {
      isLocked.current = true;
      const nextValue = format === 'markdown' ? sourceContent : editorRef.current.innerHTML;
      onChange(nextValue);
      setSourceContent(nextValue);
      setTimeout(() => { isLocked.current = false; }, 10);
    }
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      isLocked.current = true;
      const val = e.target.value;
      setSourceContent(val);
      onChange(val); // In source mode, we treat the text AS the value (could be HTML)
      setTimeout(() => { isLocked.current = false; }, 10);
  };

  const applyMarkdownWrap = (prefix: string, suffix: string = prefix, placeholderText: string = '内容') => {
    const textarea = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    const currentValue = sourceContent;

    if (!textarea) {
      const appended = `${currentValue}${currentValue ? '\n' : ''}${prefix}${placeholderText}${suffix}`;
      setSourceContent(appended);
      onChange(appended);
      return;
    }

    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const selectedText = currentValue.slice(selectionStart, selectionEnd) || placeholderText;
    const nextValue = `${currentValue.slice(0, selectionStart)}${prefix}${selectedText}${suffix}${currentValue.slice(selectionEnd)}`;

    setSourceContent(nextValue);
    onChange(nextValue);

    requestAnimationFrame(() => {
      const caret = selectionStart + prefix.length + selectedText.length + suffix.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const applyMarkdownLinePrefix = (prefix: string, placeholderText: string) => {
    const textarea = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    const currentValue = sourceContent;

    if (!textarea) {
      const appended = `${currentValue}${currentValue ? '\n' : ''}${prefix}${placeholderText}`;
      setSourceContent(appended);
      onChange(appended);
      return;
    }

    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const selectedText = currentValue.slice(selectionStart, selectionEnd) || placeholderText;
    const transformed = selectedText
      .split('\n')
      .map((line) => `${prefix}${line || placeholderText}`)
      .join('\n');
    const nextValue = `${currentValue.slice(0, selectionStart)}${transformed}${currentValue.slice(selectionEnd)}`;

    setSourceContent(nextValue);
    onChange(nextValue);

    requestAnimationFrame(() => {
      const caret = selectionStart + transformed.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const exec = (command: string, val: string | undefined = undefined) => {
    if (format === 'markdown') {
      if (command === 'bold') applyMarkdownWrap('**');
      if (command === 'italic') applyMarkdownWrap('*');
      if (command === 'underline') applyMarkdownWrap('<u>', '</u>');
      if (command === 'insertUnorderedList') applyMarkdownLinePrefix('- ', '列表项');
      if (command === 'insertOrderedList') applyMarkdownLinePrefix('1. ', '列表项');
      if (command === 'formatBlock' && val === 'H3') applyMarkdownLinePrefix('### ', '小标题');
      if (command === 'formatBlock' && val === 'P') applyMarkdownLinePrefix('', '段落');
      return;
    }
    document.execCommand(command, false, val);
    if (editorRef.current) {
        editorRef.current.focus();
        handleInput();
    }
  };

  const insertFormula = () => {
      const latex = prompt("请输入 LaTeX 公式 (例如: E=mc^2):", "E=mc^2");
      if (latex) {
          try {
              const html = katex.renderToString(latex, {
                  throwOnError: false,
                  displayMode: false
              });
              // Insert HTML at cursor
              const span = `&nbsp;<span contenteditable="false" class="mx-1 inline-block select-all" data-latex="${latex}">${html}</span>&nbsp;`;
              
                if (format === 'markdown') {
                  const snippet = `$${latex}$`;
                  const newSource = `${sourceContent}${sourceContent ? '\n' : ''}${snippet}`;
                  setSourceContent(newSource);
                  onChange(newSource);
                } else if (mode === 'source') {
                  const newSource = sourceContent + span;
                 setSourceContent(newSource);
                 onChange(newSource);
              } else {
                 document.execCommand('insertHTML', false, span);
              }
          } catch (e) {
              alert("公式渲染失败，请检查 LaTeX 语法。");
          }
      }
  };

  const Button = ({ cmd, arg, icon, title, onClick, active }: { cmd?: string, arg?: string, icon: React.ReactNode, title: string, onClick?: () => void, active?: boolean }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        if (onClick) onClick();
        else if (cmd) exec(cmd, arg);
      }}
      className={`p-1.5 rounded hover:bg-slate-200 text-slate-700 text-xs font-bold min-w-[28px] flex items-center justify-center transition-colors ${active ? 'bg-blue-100 text-blue-700' : ''}`}
      title={title}
      disabled={mode === 'source' && !onClick} // Disable formatting buttons in source mode except specific ones
    >
      {icon}
    </button>
  );

  return (
    <div data-editor-id={editorId} className={`border border-slate-200 rounded-lg overflow-hidden bg-white flex flex-col shadow-sm focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-400 transition-all ${className}`}>
      <div className="flex items-center gap-1 p-2 border-b border-slate-100 bg-slate-50 text-slate-600 select-none flex-wrap">
        <Button cmd="bold" icon={<span className="font-serif font-bold text-sm">B</span>} title="加粗" />
        <Button cmd="italic" icon={<span className="font-serif italic text-sm">I</span>} title="斜体" />
        <Button cmd="underline" icon={<span className="font-serif underline text-sm">U</span>} title="下划线" />
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <Button cmd="insertUnorderedList" icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16M4 6l0 .01M4 12l0 .01M4 18l0 .01"/></svg>
        } title="无序列表" />
        <Button cmd="insertOrderedList" icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6h11m-11 6h11m-11 6h11M4 6h1v4m-1 0h2m0 8H4c0-1 2-2 2-3s-2-3-2-3h2"/></svg>
        } title="有序列表" />
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <Button cmd="formatBlock" arg="H3" icon={<span className="font-bold text-xs">H3</span>} title="标题 3" />
        <Button cmd="formatBlock" arg="P" icon={<span className="font-bold text-xs">¶</span>} title="段落" />
        
        <div className="w-px h-4 bg-slate-300 mx-1" />
        
        <Button 
            onClick={insertFormula} 
            icon={<span className="font-serif italic font-bold text-sm">Σ</span>} 
            title="插入数学公式 (LaTeX)" 
        />

        <div className="flex-1" />
        
        <div className="flex bg-slate-200 rounded p-0.5 gap-0.5">
            <button
                type="button"
                onClick={() => setMode('rich')}
                className={`px-2 py-0.5 text-[10px] rounded font-medium ${mode === 'rich' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                {format === 'markdown' ? '预览' : '预览视图'}
            </button>
            <button
                type="button"
                onClick={() => setMode('source')}
                className={`px-2 py-0.5 text-[10px] rounded font-medium ${mode === 'source' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                {format === 'markdown' ? 'Markdown' : '源代码'}
            </button>
        </div>
      </div>

      {mode === 'rich' ? (
        format === 'markdown' ? (
          <div className="flex-1 p-4 overflow-y-auto prose prose-sm prose-slate max-w-none min-h-[200px] bg-white">
            {sourceContent ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(sourceContent) }} />
            ) : (
              <div className="text-slate-400">{placeholder}</div>
            )}
          </div>
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className="flex-1 p-4 outline-none overflow-y-auto prose prose-sm prose-slate max-w-none min-h-[200px] empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
            data-placeholder={placeholder}
            dangerouslySetInnerHTML={{ __html: sourceContent }}
            suppressContentEditableWarning
          />
        )
      ) : (
          <textarea 
            ref={sourceRef}
            value={sourceContent}
            onChange={handleSourceChange}
            className={`flex-1 p-4 outline-none overflow-y-auto font-mono text-xs min-h-[200px] resize-none ${format === 'markdown' ? 'bg-white text-slate-800' : 'bg-slate-800 text-slate-200'}`}
            placeholder={format === 'markdown' ? '在此处输入 Markdown 内容...' : '在此处编辑 HTML 源代码...'}
          />
      )}
    </div>
  );
};
