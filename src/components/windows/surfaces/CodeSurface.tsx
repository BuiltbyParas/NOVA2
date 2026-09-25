const FILES = ['interaction-system.ts', 'commandBus.ts', 'spatialStore.ts', 'workspaces.ts'];

/** A fragment of NOVA's own interaction layer, shown as the editor's content. */
const LINES: { indent: number; tokens: [string, string][] }[] = [
  { indent: 0, tokens: [['kw', 'export'], ['kw', ' type'], ['type', ' InteractionMode'], ['op', ' ='] ] },
  { indent: 1, tokens: [['str', "'idle'"], ['op', ' | '], ['str', "'hover'"], ['op', ' | '], ['str', "'move'"]] },
  { indent: 0, tokens: [] },
  { indent: 0, tokens: [['kw', 'function'], ['fn', ' onPress'], ['op', '('], ['arg', 'hit'], ['op', ') {']] },
  { indent: 1, tokens: [['kw', 'const'], ['arg', ' win'], ['op', ' = '], ['fn', 'resolve'], ['op', '(hit.id);']] },
  { indent: 1, tokens: [['kw', 'if'], ['op', ' (!win) '], ['kw', 'return'], ['op', ';']] },
  { indent: 0, tokens: [] },
  { indent: 1, tokens: [['com', '// input never touches the scene']] },
  { indent: 1, tokens: [['fn', 'dispatch'], ['op', '({ '], ['arg', 'action'], ['op', ': '], ['str', "'focus'"], ['op', ', '], ['arg', 'target'], ['op', ': win.id });']] },
  { indent: 0, tokens: [['op', '}']] },
];

export function CodeSurface() {
  return (
    <div className="surface surface--code">
      <div className="code__sidebar">
        <div className="code__sidebar-label">nova / systems</div>
        {FILES.map((file, index) => (
          <div key={file} className={`code__file${index === 0 ? ' is-active' : ''}`}>
            {file}
          </div>
        ))}
      </div>
      <div className="code__editor">
        {LINES.map((line, index) => (
          <div className="code__line" key={index}>
            <span className="code__number">{index + 1}</span>
            <span className="code__text" style={{ paddingLeft: `${line.indent * 14}px` }}>
              {line.tokens.map(([kind, text], tokenIndex) => (
                <span key={tokenIndex} className={`tok tok--${kind}`}>
                  {text}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
