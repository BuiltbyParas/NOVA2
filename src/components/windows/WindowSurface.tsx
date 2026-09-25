import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Code2, FileText, FolderClosed, Globe, TerminalSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppType } from '../../types/window';
import { useSpatialStore } from '../../state/spatialStore';
import { APPS } from '../../data/apps';
import { SURFACE_REGIONS } from '../../systems/interaction/interactionSystem';
import { BrowserSurface } from './surfaces/BrowserSurface';
import { CodeSurface } from './surfaces/CodeSurface';
import { FilesSurface } from './surfaces/FilesSurface';
import { NotesSurface } from './surfaces/NotesSurface';
import { TerminalSurface } from './surfaces/TerminalSurface';

/**
 * The mark each application wears.
 *
 * A tinted square said "this is one of five things" without saying which. A
 * recognisable glyph is what lets somebody find the Terminal in a room of five
 * windows from across a lecture theatre, which is the only job this does.
 */
const APP_ICONS: Record<AppType, LucideIcon> = {
  browser: Globe,
  code: Code2,
  files: FolderClosed,
  notes: FileText,
  terminal: TerminalSquare,
};

function AppBody({ app }: { app: AppType }) {
  switch (app) {
    case 'browser':
      return <BrowserSurface />;
    case 'code':
      return <CodeSurface />;
    case 'files':
      return <FilesSurface />;
    case 'notes':
      return <NotesSurface />;
    case 'terminal':
      return <TerminalSurface />;
  }
}

/**
 * One ring, once, when a window takes focus.
 *
 * Focus is already spoken for by lift and by the hairline, but both are states:
 * they say which window is focused, not that focus just moved. This is the
 * moment itself — a thin accent ring that expands past the edge and is gone in
 * under a second.
 *
 * It is keyed on a counter rather than on `focused`, so the element is torn
 * down and rebuilt on each transition and the CSS animation restarts. Nothing
 * here runs per frame: the component renders only when the boolean changes, and
 * a window that is already focused when it mounts gets no ring, because nothing
 * moved.
 */
function FocusPulse({ id }: { id: string }) {
  const focused = useSpatialStore((state) => Boolean(state.windows[id]?.focused));
  const previous = useRef(focused);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (focused && !previous.current) setPulse((n) => n + 1);
    previous.current = focused;
  }, [focused]);

  if (!pulse) return null;

  return <span className="nova-surface__pulse" key={pulse} aria-hidden />;
}

interface WindowSurfaceProps {
  id: string;
  app: AppType;
  title: string;
}

/**
 * The DOM face of a spatial window.
 *
 * The chrome's controls are laid out against `SURFACE_REGIONS`, the same numbers
 * the interaction system hit-tests in 3D — so the dots you see are exactly the
 * regions you can hit, whether you point with a mouse or, later, a fingertip.
 */
export function WindowSurface({ id, app, title }: WindowSurfaceProps) {
  const definition = APPS[app];
  const headerHeight = `${SURFACE_REGIONS.headerHeight * 100}%`;
  const Icon = APP_ICONS[app];
  // The tint reaches CSS as a custom property so the glyph, its wash and the
  // collapsed plate all read from one value rather than three inline colours.
  const tint = { '--tint': definition.tint } as CSSProperties;

  return (
    <>
      <div className="nova-surface__full">
        <header className="chrome" style={{ height: headerHeight }}>
          <span className="chrome__mark" style={tint}>
            <Icon size={13} strokeWidth={2} />
          </span>
          <span className="chrome__app">{definition.name}</span>
          <span className="chrome__title">{title}</span>
          <div className="chrome__controls">
            <span className="chrome__control chrome__control--minimize" />
            <span className="chrome__control chrome__control--close" />
          </div>
        </header>
        <div className="chrome__body">
          <AppBody app={app} />
        </div>
        <span className="chrome__resize" />
      </div>

      <div className="nova-surface__collapsed">
        <span className="collapsed__mark" style={tint}>
          <Icon size={26} strokeWidth={1.8} />
        </span>
        <span className="collapsed__label">{definition.name}</span>
      </div>

      <div className="nova-surface__scrim" />

      <FocusPulse id={id} />
    </>
  );
}
