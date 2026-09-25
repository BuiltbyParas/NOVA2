import React from 'react';
import type {
  NovaSpatialContext,
  NovaWindowState,
  NovaWorkspaceId,
  NovaWindowId,
} from '../types/nova';
import { WORKSPACES } from '../services/novaContext';
import { Layers, Eye, EyeOff, RotateCcw } from 'lucide-react';

interface ContextEditorProps {
  context: NovaSpatialContext;
  windows: NovaWindowState[];
  onSelectWorkspace: (ws: NovaWorkspaceId) => void;
  onSetFocusedWindow: (id: NovaWindowId | null) => void;
  onToggleWindowVisibility: (id: NovaWindowId) => void;
  onResetSpatialState: () => void;
}

export const ContextEditor: React.FC<ContextEditorProps> = ({
  context,
  windows,
  onSelectWorkspace,
  onSetFocusedWindow,
  onToggleWindowVisibility,
  onResetSpatialState,
}) => {
  return (
    <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Spatial Context State
          </span>
        </div>
        <button
          onClick={onResetSpatialState}
          title="Reset to default spatial state"
          className="text-[11px] flex items-center gap-1 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors font-mono"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
        {/* Workspace Selector */}
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
            Active Workspace (context.workspace)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {WORKSPACES.map((ws) => {
              const active = context.workspace === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium text-xs text-left transition-all border ${
                    active
                      ? 'bg-sky-500/20 border-sky-500/50 text-sky-200 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold">{ws.name}</div>
                  <div className="text-[9px] text-slate-500 truncate">{ws.id}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Focused Window Controller */}
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Focused Window (context.focusedWindow)</span>
            <span className="text-[10px] text-slate-500 lowercase">targets &quot;this&quot; / &quot;it&quot;</span>
          </label>
          <div className="flex items-center gap-2">
            <select
              value={context.focusedWindow || ''}
              onChange={(e) =>
                onSetFocusedWindow((e.target.value as NovaWindowId) || null)
              }
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono focus:outline-none focus:border-sky-500"
            >
              <option value="">(None - simulates ambiguous context)</option>
              {windows
                .filter((w) => w.workspace === context.workspace || w.id === 'nova_core')
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.id}) — {w.position}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Window Entities Table in Active Context */}
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
            Active Windows in Context ({context.windows.length})
          </label>
          <div className="space-y-1.5">
            {windows
              .filter((w) => w.workspace === context.workspace || w.id === 'nova_core')
              .map((w) => {
                const isFocused = w.id === context.focusedWindow;
                return (
                  <div
                    key={w.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border font-mono text-[11px] ${
                      isFocused
                        ? 'bg-slate-900 border-sky-500/40 text-slate-200'
                        : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleWindowVisibility(w.id)}
                        className="text-slate-500 hover:text-slate-300"
                        title={w.visible ? 'Hide window' : 'Show window'}
                      >
                        {w.visible ? (
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                        )}
                      </button>
                      <button
                        onClick={() => onSetFocusedWindow(w.id)}
                        className="font-semibold text-slate-200 hover:underline text-left"
                      >
                        {w.name}
                      </button>
                      {isFocused && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300">
                          active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-slate-400">pos: {w.position}</span>
                      <span className="text-slate-500">scale: {w.scale.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Raw Context JSON Inspector Accordion */}
        <div className="pt-2 border-t border-slate-800">
          <div className="text-[10px] font-mono text-slate-500 mb-1 flex items-center justify-between">
            <span>DISPATCHED CONTEXT SCHEMA:</span>
            <span>Section 12 Compliant</span>
          </div>
          <pre className="p-2.5 bg-black/60 rounded-lg text-[10px] font-mono text-sky-300/80 overflow-x-auto max-h-36 border border-slate-900">
            {JSON.stringify(context, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};
