import React, { useState } from 'react';
import { FileCode2, Copy, Check, ExternalLink } from 'lucide-react';

export const HandoffDocPanel: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const commandSchemaJson = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NovaCommandResponse",
  "type": "object",
  "required": ["status", "commands"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["ok", "needs_clarification", "unsupported", "invalid"]
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "intentSummary": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "commands": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["action", "target"],
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "OPEN", "CLOSE", "SHOW", "HIDE",
              "FOCUS", "MOVE", "RESIZE", "ROTATE",
              "BRING_FORWARD", "SEND_BACK", "ARRANGE",
              "SWITCH_WORKSPACE"
            ]
          },
          "target": {
            "type": "string",
            "description": "NOVA entity ID (e.g. browser, code, terminal, files, notes, nova_core, or workspace id)"
          },
          "parameters": {
            "type": "object",
            "properties": {
              "relation": {
                "type": "string",
                "enum": ["left", "right", "above", "below", "front", "behind", "center", "near", "far", "beside", "next_to"]
              },
              "relativeTo": { "type": "string" },
              "scale": { "type": "number" },
              "layout": { "type": "string" }
            }
          }
        }
      }
    }
  }
}`;

  const contextSchemaJson = `{
  "workspace": "development | study | home",
  "workspaceName": "Development",
  "focusedWindow": "code | browser | terminal | notes | files | nova_core | null",
  "windows": [
    {
      "id": "browser",
      "name": "Browser",
      "visible": true,
      "position": "center-left | center-right | center | left | right",
      "scale": 1.0,
      "focused": false,
      "zOrder": 2
    }
  ],
  "availableWorkspaces": [
    { "id": "development", "name": "Development" },
    { "id": "study", "name": "Study" },
    { "id": "home", "name": "Home" }
  ]
}`;

  return (
    <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Section 29 — Claude Code Implementation Handoff
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Ready for Phase 4 Integration
        </div>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto flex-1 text-xs text-slate-300 leading-relaxed">
        {/* Architecture Boundary Statement */}
        <div className="bg-sky-950/30 border border-sky-500/30 rounded-lg p-3 space-y-1">
          <div className="font-mono text-xs font-bold text-sky-300">
            Mandatory Boundary: Gemini Understands · NOVA Executes
          </div>
          <p className="text-[11px] text-slate-300">
            Gemini must never touch Three.js objects, meshes, React state, or coordinates directly. Gemini receives the clean spatial context and user utterance, and emits the structured command response below. The NOVA Command Bus consumes this response and translates relations to 3D coordinates.
          </p>
        </div>

        {/* Integration Point for Claude Code */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono mb-1.5 flex items-center gap-2">
            <span>1. Integration Point for Claude Code</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Connect Gemini at the <strong>Command Bus</strong> boundary where external inputs (Mouse, Hand tracker, Voice, Keyboard) meet the spatial state store:
          </p>
          <div className="bg-slate-900 p-3 rounded-lg font-mono text-[11px] text-slate-300 border border-slate-800 space-y-1">
            <div className="text-slate-500">// In nova/src/services/commandBus.ts:</div>
            <div>
              <span className="text-purple-400">export async function</span>{' '}
              <span className="text-sky-300">dispatchNaturalLanguage</span>(prompt: string, context: NovaSpatialContext) {'{'}
            </div>
            <div className="pl-4">
              const response = await fetch(<span className="text-amber-300">&quot;/api/gemini/command&quot;</span>, {'{'} ... {'}'});
            </div>
            <div className="pl-4">
              const parsed: NovaCommandResponse = await response.json();
            </div>
            <div className="pl-4">
              <span className="text-emerald-400">// NOVA Command Bus executes parsed.commands on spatial state</span>
            </div>
            <div className="pl-4">
              novaSpatialState.applyCommands(parsed.commands);
            </div>
            <div>{'}'}</div>
          </div>
        </div>

        {/* Command Contract Schema */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              2. Command Response JSON Schema
            </span>
            <button
              onClick={() => copyToClipboard(commandSchemaJson, 'cmdSchema')}
              className="text-[10px] font-mono flex items-center gap-1 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800"
            >
              {copiedSection === 'cmdSchema' ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>Copy Schema</span>
            </button>
          </div>
          <pre className="p-3 bg-black/70 rounded-lg text-[10px] font-mono text-emerald-400 border border-slate-800 overflow-x-auto max-h-44">
            {commandSchemaJson}
          </pre>
        </div>

        {/* Context Schema */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              3. Spatial Context Schema Passed to Gemini
            </span>
            <button
              onClick={() => copyToClipboard(contextSchemaJson, 'ctxSchema')}
              className="text-[10px] font-mono flex items-center gap-1 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800"
            >
              {copiedSection === 'ctxSchema' ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>Copy Schema</span>
            </button>
          </div>
          <pre className="p-3 bg-black/70 rounded-lg text-[10px] font-mono text-sky-300 border border-slate-800 overflow-x-auto max-h-44">
            {contextSchemaJson}
          </pre>
        </div>

        {/* Supported Actions & Entities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-1.5 font-mono text-[11px]">
            <div className="font-bold text-slate-200 uppercase text-[10px]">
              Supported Actions (12)
            </div>
            <div className="text-slate-400 flex flex-wrap gap-1">
              {[
                'OPEN',
                'CLOSE',
                'SHOW',
                'HIDE',
                'FOCUS',
                'MOVE',
                'RESIZE',
                'ROTATE',
                'BRING_FORWARD',
                'SEND_BACK',
                'ARRANGE',
                'SWITCH_WORKSPACE',
              ].map((act) => (
                <span key={act} className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px]">
                  {act}
                </span>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-1.5 font-mono text-[11px]">
            <div className="font-bold text-slate-200 uppercase text-[10px]">
              Target Identifiers
            </div>
            <div className="text-slate-400 flex flex-wrap gap-1">
              {['browser', 'code', 'terminal', 'files', 'notes', 'nova_core'].map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 text-[10px]">
                  {t}
                </span>
              ))}
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px]">
                current_window
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px]">
                focused_window
              </span>
            </div>
          </div>
        </div>

        {/* Section 32 Benchmark Verification */}
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg space-y-1">
          <div className="font-mono text-xs font-bold text-emerald-300">
            Section 32 Verification Benchmark:
          </div>
          <div className="italic text-[11px] text-slate-200">
            &ldquo;I&apos;m working on development. Put the browser on my left, make Code slightly bigger, bring Terminal forward, and then switch to the Development workspace.&rdquo;
          </div>
          <p className="text-[10px] text-slate-400">
            Deterministic mapping: 4 sequential commands [MOVE: browser/left, RESIZE: code/scale:1.1, BRING_FORWARD: terminal, SWITCH_WORKSPACE: development].
          </p>
        </div>
      </div>
    </div>
  );
};
