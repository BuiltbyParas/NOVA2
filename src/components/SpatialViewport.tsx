import React from 'react';
import type {
  NovaWindowState,
  NovaWorkspaceId,
  NovaWindowId,
} from '../types/nova';
import {
  AppWindow,
  Code2,
  Terminal,
  FileText,
  FolderGit2,
  Sparkles,
  EyeOff,
} from 'lucide-react';

interface SpatialViewportProps {
  workspace: NovaWorkspaceId;
  windows: NovaWindowState[];
  onSelectWindow: (id: NovaWindowId) => void;
  onToggleVisibility: (id: NovaWindowId) => void;
  executionLog: string[];
}

export const SpatialViewport: React.FC<SpatialViewportProps> = ({
  workspace,
  windows,
  onSelectWindow,
  onToggleVisibility,
  executionLog,
}) => {
  const visibleWindows = windows.filter(
    (w) => (w.workspace === workspace || w.id === 'nova_core') && w.visible
  );

  const getWindowIcon = (id: NovaWindowId) => {
    switch (id) {
      case 'code':
        return <Code2 className="w-4 h-4 text-emerald-400" />;
      case 'browser':
        return <AppWindow className="w-4 h-4 text-sky-400" />;
      case 'terminal':
        return <Terminal className="w-4 h-4 text-amber-400" />;
      case 'notes':
        return <FileText className="w-4 h-4 text-purple-400" />;
      case 'files':
        return <FolderGit2 className="w-4 h-4 text-rose-400" />;
      case 'nova_core':
        return <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />;
    }
  };

  const getWindowMockContent = (id: NovaWindowId) => {
    switch (id) {
      case 'code':
        return (
          <div className="font-mono text-[11px] leading-relaxed text-slate-300 space-y-1">
            <div className="text-emerald-400">// nova/spatial/engine.ts</div>
            <div>
              <span className="text-purple-400">const</span> bus = <span className="text-sky-300">useCommandBus</span>();
            </div>
            <div>
              bus.<span className="text-yellow-300">dispatch</span>({'{'} target: <span className="text-amber-300">"self"</span> {'}'});
            </div>
            <div className="text-slate-500 text-[10px] pt-1">3D viewport ready · 120 FPS</div>
          </div>
        );
      case 'browser':
        return (
          <div className="text-xs text-slate-300 space-y-2">
            <div className="bg-slate-900/80 px-2 py-1 rounded text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>https://nova.local/preview</span>
              <span className="text-emerald-400 text-[9px]">● LIVE</span>
            </div>
            <div className="h-16 rounded bg-gradient-to-br from-sky-950/40 to-slate-900 flex items-center justify-center border border-sky-500/20">
              <span className="text-[11px] text-sky-300 font-medium">Spatial Surface Render</span>
            </div>
          </div>
        );
      case 'terminal':
        return (
          <div className="font-mono text-[11px] text-amber-300/90 space-y-1 bg-black/60 p-2 rounded">
            <div>nova-node:~$ status</div>
            <div className="text-emerald-400">● core: active | hand_tracker: 60fps</div>
            <div className="text-slate-400">waiting for gemini command bus...</div>
          </div>
        );
      case 'notes':
        return (
          <div className="text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-purple-300 text-[11px]">Spatial Interaction Spec</div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Depth planes are managed through normalized z-indexes. Pitch gestures map to orbit.
            </p>
          </div>
        );
      case 'files':
        return (
          <div className="text-[11px] space-y-1 font-mono text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-200">
              <span>📁</span> workspaces/
            </div>
            <div className="pl-4 text-[10px]">├─ development.space</div>
            <div className="pl-4 text-[10px]">├─ study.space</div>
            <div className="pl-4 text-[10px]">└─ home.space</div>
          </div>
        );
      case 'nova_core':
        return (
          <div className="text-center py-2 space-y-1">
            <div className="text-[10px] tracking-wider uppercase font-mono text-indigo-300">
              NOVA Core Synapse
            </div>
            <div className="text-[11px] text-slate-300 font-medium">Command Bus Hub</div>
            <div className="text-[9px] text-slate-500 font-mono">Phase 3 Intelligence Bound</div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl">
      {/* Viewport Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            3D Spatial Desktop Viewport
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
            Workspace: {workspace.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-mono text-[11px]">
            Active Entities: <strong className="text-slate-200">{visibleWindows.length}</strong>
          </span>
          <div className="flex items-center gap-1 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
            <span className="text-[10px] text-slate-300 font-mono">Input Abstraction: MOUSE · HAND · GEMINI</span>
          </div>
        </div>
      </div>

      {/* 3D Perspective Stage */}
      <div
        id="nova-spatial-stage"
        className="relative flex-1 min-h-[380px] overflow-hidden bg-gradient-to-b from-slate-950 via-[#070b14] to-slate-950 flex items-center justify-center select-none"
        style={{
          perspective: '1200px',
          perspectiveOrigin: '50% 50%',
        }}
      >
        {/* Spatial Grid Floor and Horizon Lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(56, 189, 248, 0.15) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(56, 189, 248, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            transform: 'rotateX(60deg) scale(2.2) translateY(20%)',
            transformOrigin: '50% 80%',
          }}
        />

        {/* Depth Plane Depth Horizon indicator */}
        <div className="absolute top-4 left-4 pointer-events-none text-[10px] font-mono text-slate-500 bg-slate-900/60 px-2 py-1 rounded border border-slate-800/60 backdrop-blur">
          Perspective: 1200px · Focal Plane: Z 0.0 · Field: Spatial Desk
        </div>

        {/* Spatial Windows Container */}
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {visibleWindows.map((win) => {
            // Translate spatial coordinates (x: -3..3, y: -2..2, z: -2..0) to pixel and 3D transforms
            const pixelX = win.coordinates.x * 120;
            const pixelY = -win.coordinates.y * 70; // Invert Y for screen space
            const pixelZ = win.coordinates.z * 180;
            const isFocused = win.focused;

            return (
              <div
                key={win.id}
                id={`nova-window-${win.id}`}
                onClick={() => onSelectWindow(win.id)}
                className={`absolute w-64 rounded-xl cursor-pointer transition-all duration-500 ease-out border backdrop-blur-md shadow-2xl ${
                  isFocused
                    ? 'border-sky-400 ring-2 ring-sky-400/40 bg-slate-900/95 shadow-[0_12px_40px_rgba(56,189,248,0.25)]'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 opacity-90'
                }`}
                style={{
                  transform: `translate3d(${pixelX}px, ${pixelY}px, ${pixelZ}px) scale(${win.scale})`,
                  zIndex: win.zOrder + (isFocused ? 20 : 0),
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Window Title Bar */}
                <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between rounded-t-xl bg-slate-950/40">
                  <div className="flex items-center gap-2">
                    {getWindowIcon(win.id)}
                    <span className="text-xs font-semibold text-slate-200 tracking-wide">
                      {win.name}
                    </span>
                    {isFocused && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        FOCUSED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="text-[9px] font-mono text-slate-500">
                      s:{win.scale.toFixed(1)}
                    </span>
                    <button
                      title="Toggle Visibility"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(win.id);
                      }}
                      className="p-1 hover:text-slate-200 transition-colors"
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Window Body */}
                <div className="p-3 bg-slate-950/30">
                  {getWindowMockContent(win.id)}
                </div>

                {/* Window Spatial Footer */}
                <div className="px-3 py-1 bg-slate-950/70 border-t border-slate-800/60 flex items-center justify-between text-[9px] font-mono text-slate-500 rounded-b-xl">
                  <span>pos: {win.position}</span>
                  <span>z-order: {win.zOrder}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Real-time Hand / Index-Finger Cursor Simulation indicator */}
        <div className="absolute bottom-3 right-4 pointer-events-none flex items-center gap-2 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800 text-[11px] font-mono text-slate-400 backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Hand Tracking Sensor: Ready (Phase 2 untouched)</span>
        </div>
      </div>

      {/* Command Bus Execution Feed */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="font-mono text-[10px] text-sky-400 font-bold uppercase tracking-wider">
            Command Bus Event:
          </span>
          <span className="font-mono text-[11px] text-slate-300 truncate">
            {executionLog.length > 0
              ? executionLog[executionLog.length - 1]
              : 'Spatial state idle · Listening for natural language commands'}
          </span>
        </div>
        <div className="text-[10px] font-mono text-slate-500 shrink-0">
          Decoupled State Engine
        </div>
      </div>
    </div>
  );
};
