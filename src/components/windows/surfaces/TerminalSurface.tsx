const SESSION: { kind: 'prompt' | 'out' | 'ok'; text: string }[] = [
  { kind: 'prompt', text: 'nova status --spatial' },
  { kind: 'out', text: 'environment   ready' },
  { kind: 'out', text: 'surfaces      5 active · 0 collapsed' },
  { kind: 'out', text: 'input         pointer (mouse)' },
  { kind: 'out', text: 'reserved      gesture · voice · intent' },
  { kind: 'ok', text: 'core online' },
  { kind: 'prompt', text: '' },
];

export function TerminalSurface() {
  return (
    <div className="surface surface--terminal">
      {SESSION.map((line, index) => (
        <div className={`term__line term__line--${line.kind}`} key={index}>
          {line.kind === 'prompt' && <span className="term__sigil">›</span>}
          <span>{line.text}</span>
          {line.kind === 'prompt' && index === SESSION.length - 1 && (
            <span className="term__caret" />
          )}
        </div>
      ))}
    </div>
  );
}
