import { Code2, FileText, FolderClosed, Globe, TerminalSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppType } from '../../types/window';

/**
 * One glyph per NOVA application, shared by every surface that shows them —
 * the Command Deck (Phase 9.5B) and the NOVA portal (Phase 12) — so an
 * application looks the same wherever it is offered.
 */
export const APP_ICONS: Record<AppType, LucideIcon> = {
  browser: Globe,
  terminal: TerminalSquare,
  files: FolderClosed,
  code: Code2,
  notes: FileText,
};
