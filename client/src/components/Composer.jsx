import { useLayoutEffect, useRef, useState } from 'react';

export default function Composer({ onSend, onStop, streaming, disabled, placeholder }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  // Grow the textarea with its content, up to a limit.
  useLayoutEffect(() => {
    const el = inputRef.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const submit = (e) => {
    e?.preventDefault();
    if (streaming || disabled || !text.trim()) return;
    onSend(text);
    setText('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter adds a new line (and don't send mid IME composition).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-box">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Message"
          autoFocus
        />
        {streaming ? (
          <button type="button" className="send-button stop" onClick={onStop} aria-label="Stop generating">
            ■
          </button>
        ) : (
          <button type="submit" className="send-button" disabled={disabled || !text.trim()} aria-label="Send">
            ↑
          </button>
        )}
      </div>
      <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
    </form>
  );
}
