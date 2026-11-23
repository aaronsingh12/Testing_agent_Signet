import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownComponents = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

const CUT_OFF = new Set(['max_tokens', 'length', 'max_output_tokens']);

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (non-secure context) - nothing to do
    }
  };
  return (
    <button type="button" className="link-button small" onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Message({ message }) {
  const { role, content, pending, error, stopped, stopReason, model } = message;

  if (role === 'user') {
    return (
      <div className="message user">
        <div className="bubble">{content}</div>
      </div>
    );
  }

  return (
    <div className="message assistant">
      <div className="message-meta">
        <span>{model || 'Assistant'}</span>
        {!pending && content && <CopyButton text={content} />}
      </div>

      {pending && !content && !error && (
        <div className="thinking" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      )}

      {content && (
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </Markdown>
        </div>
      )}

      {error && <p className="alert">{error}</p>}
      {stopped && <p className="note">Stopped.</p>}
      {CUT_OFF.has(stopReason) && <p className="note">Reply cut off: output token limit reached.</p>}
    </div>
  );
}

export default function MessageList({ messages, empty }) {
  const containerRef = useRef(null);
  const stickToBottom = useRef(true);

  // Follow the stream unless the user has scrolled up to read something.
  const onScroll = () => {
    const el = containerRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="messages" ref={containerRef} onScroll={onScroll}>
      <div className="messages-inner">
        {messages.length === 0 ? empty : messages.map((m) => <Message key={m.id} message={m} />)}
      </div>
    </div>
  );
}
