import React from 'react';
import type { NovaCommandResponse, NovaResponseStatus } from '../types/nova';
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  XCircle,
  Play,
  TerminalSquare,
  Copy,
  Check,
} from 'lucide-react';

interface CommandOutputViewerProps {
  lastPrompt: string;
  response: NovaCommandResponse | null;
  loading: boolean;
  onExecuteBus: () => void;
  canExecute: boolean;
}

export const CommandOutputViewer: React.FC<CommandOutputViewerProps> = ({
  lastPrompt,
  response,
  loading,
  onExecuteBus,
  canExecute,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatusBadge = (status: NovaResponseStatus) => {
    switch (status) {
      case 'ok':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" />
            OK
          </span>
        );
      case 'needs_clarification':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <HelpCircle className="w-3.5 h-3.5" />
            NEEDS CLARIFICATION
          </span>
        );
      case 'unsupported':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertCircle className="w-3.5 h-3.5" />
            UNSUPPORTED
          </span>
        );
      case 'invalid':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40">
            <XCircle className="w-3.5 h-3.5" />
            INVALID
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Gemini Structured Intent Output
          </span>
        </div>
        <div className="flex items-center gap-2">
          {response && renderStatusBadge(response.status)}
          {response && (
            <button
              onClick={handleCopy}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy JSON response"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
        {/* Input prompt echo */}
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-mono text-slate-500 mb-0.5">
            Natural Language Input
          </div>
          <div className="text-sm font-medium text-slate-100 italic">
            &ldquo;{lastPrompt || 'No query dispatched yet'}&rdquo;
          </div>
        </div>

        {loading && (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <div className="font-mono text-xs">Gemini 3.8 Flash parsing spatial intent...</div>
          </div>
        )}

        {!loading && !response && (
          <div className="py-10 text-center text-slate-500 font-mono text-xs">
            Submit a query above or click a benchmark test below to inspect the Gemini structured output.
          </div>
        )}

        {!loading && response && (
          <>
            {/* Intent Summary & Confidence */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="md:col-span-3 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/90">
                <div className="text-[10px] uppercase font-mono text-slate-500 mb-0.5">
                  Interpreted Spatial Intent
                </div>
                <div className="text-xs text-slate-200">
                  {response.intentSummary ||
                    (response.commands.length > 0
                      ? `${response.commands.length} command(s) extracted for NOVA state execution`
                      : 'No command produced')}
                </div>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/90 flex flex-col justify-between">
                <div className="text-[10px] uppercase font-mono text-slate-500">
                  Confidence
                </div>
                <div className="font-mono text-base font-bold text-sky-400">
                  {response.confidence !== undefined
                    ? `${(response.confidence * 100).toFixed(0)}%`
                    : '100%'}
                </div>
              </div>
            </div>

            {/* Clarification or Unsupported Message */}
            {response.message && (
              <div
                className={`p-3 rounded-lg border text-xs font-mono ${
                  response.status === 'needs_clarification'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="font-bold text-[11px] mb-1">
                  {response.status === 'needs_clarification'
                    ? 'Clarification Requested:'
                    : 'Security / Domain Guard:'}
                </div>
                <div>{response.message}</div>
              </div>
            )}

            {/* Extracted Commands List */}
            {response.commands && response.commands.length > 0 && (
              <div>
                <div className="text-[10px] uppercase font-mono text-slate-500 mb-1.5 flex items-center justify-between">
                  <span>Structured Commands ({response.commands.length})</span>
                  <span className="text-emerald-400">Section 7 & 8 Compliant</span>
                </div>
                <div className="space-y-1.5">
                  {response.commands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between font-mono text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-slate-800 text-sky-400 flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                          {cmd.action}
                        </span>
                        <span className="text-slate-300 font-semibold">{cmd.target}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {cmd.parameters && Object.keys(cmd.parameters).length > 0
                          ? JSON.stringify(cmd.parameters)
                          : '{}'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exact Machine-Readable JSON */}
            <div>
              <div className="text-[10px] uppercase font-mono text-slate-500 mb-1 flex items-center justify-between">
                <span>Machine-Readable Contract Output</span>
                <span>Valid JSON</span>
              </div>
              <pre
                id="nova-command-json"
                className="p-3 bg-black/80 rounded-lg text-[11px] font-mono text-emerald-400 border border-slate-800 overflow-x-auto max-h-48 leading-relaxed"
              >
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>

            {/* Dispatch to NOVA Command Bus */}
            {response.status === 'ok' && response.commands.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={onExecuteBus}
                  disabled={!canExecute}
                  className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-900/30"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Commands on NOVA Command Bus</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
