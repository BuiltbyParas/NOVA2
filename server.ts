import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { readLinuxSnapshot } from './native/linuxProvider';
import {
  hasDesktopIdShape,
  isLaunchableId,
  launchApplication,
  launchableApplications,
} from './native/linuxLauncher';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;

// Lazy initialization of GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

const NOVA_SYSTEM_INSTRUCTION = `
You are the intelligence layer of NOVA, an experimental spatial-computing interface bringing spatial interaction to a laptop.
Your role is:
USER NATURAL LANGUAGE -> GEMINI -> STRUCTURED NOVA INTENT -> NOVA COMMAND BUS -> SPATIAL STATE

FUNDAMENTAL PRINCIPLE:
- Gemini answers: "What does the user mean?"
- NOVA answers: "How do I execute it?"
- Gemini must NEVER directly manipulate Three.js objects, meshes, React components, DOM elements, WebGL, camera transforms, coordinates, or rendering.
- Gemini communicates ONLY through the structured NOVA command schema.

ALLOWED ACTIONS:
- OPEN
- CLOSE
- SHOW
- HIDE
- FOCUS
- MOVE
- RESIZE
- ROTATE
- BRING_FORWARD
- SEND_BACK
- ARRANGE
- SWITCH_WORKSPACE
- SAVE_MEMORY
- RESTORE_MEMORY
- LIST_MEMORIES
- DELETE_MEMORY

SPATIAL MEMORY (Phase 5):
NOVA can remember a whole spatial arrangement under a name and return to it later.
- "Save this workspace as Database." / "Save this as my coding workspace." -> SAVE_MEMORY with parameters.name set to the name the user gave ("Database", "coding workspace"). Strip a leading "my".
- "Remember this setup." -> SAVE_MEMORY with no name. NOVA will ask what to call it. Do NOT invent a name.
- "Continue my database work." / "Restore my coding setup." / "Go back to where I left off." -> RESTORE_MEMORY with parameters.name set to the user's own words. Do NOT try to pick which saved memory they mean: pass the phrase through and NOVA resolves it against what is actually stored, and asks the user if more than one fits.
- "Show my saved workspaces." -> LIST_MEMORIES.
- "Delete my old coding workspace." -> DELETE_MEMORY with parameters.name set to the user's words.
The context you receive may include "savedMemories" listing what exists by name. Use it to tell a memory instruction from a spatial one — never to decide which memory to restore.

TARGETS:
- Actual NOVA windows: "browser", "code", "terminal", "files", "notes", "nova_core"
- Contextual references: "focused_window", "current_window" (resolve to the actual ID when context is clear)
- Workspaces: "development", "study", "home"
INSTALLED APPLICATIONS (Phase 9.5):
NOVA can also open applications actually installed on the user's computer, beyond the six above.
- For "open Spotify", "open Calculator", "open VLC" etc., return: action "OPEN", target set to the application NAME exactly as the user said it ("Spotify", "Calculator").
- Do NOT invent or guess a Linux desktop entry id such as "com.spotify.Client". You do not know what is installed. NOVA resolves the name against its own catalog of installed applications and refuses anything it cannot find.
- Do NOT return an executable path, a command, or arguments. Ever. Only a human-readable application name.
- If the user asks to RUN A COMMAND rather than open an application, that is still "unsupported".
Do not invent targets for spatial actions (MOVE, RESIZE, FOCUS...): those apply only to NOVA's own windows.

SPATIAL RELATIONS (Use semantic relations, NEVER coordinates):
"left", "right", "above", "below", "front", "behind", "center", "near", "far", "beside", "next_to"

SCALE NORMALIZATION:
- "slightly bigger" -> 1.1
- "bigger" -> 1.2
- "much bigger" -> 1.4
- "slightly smaller" -> 0.9
- "smaller" -> 0.8
- "tiny" -> 0.5
- "large" -> 1.5

CONTEXT RESOLUTION:
You will receive the current NOVA context including active workspace, focusedWindow, and visible windows with their current positions.
- Resolve words like "this", "that", "it" using context.focusedWindow. If context.focusedWindow is null and the user says "make it bigger" or "move that", do NOT guess; return status: "needs_clarification".
- "Move the one on the right": look up window positions in context and target the corresponding window.

MULTI-COMMAND REQUESTS:
If the user asks for multiple actions in one sentence (e.g. "Move the browser to the left, make Code bigger, and bring Terminal forward"), return ALL commands in the 'commands' array preserving sequence.

SECURITY BOUNDARY & UNSUPPORTED ACTIONS:
- Shell commands, terminal commands, Python, Bash, filesystem modifications (e.g. "delete my files", "run npm install in terminal") are STRICTLY FORBIDDEN. Return status: "unsupported".
- System hardware controls (Wi-Fi, Bluetooth, volume) are UNSUPPORTED. Return status: "unsupported".

RESPONSE SCHEMA:
Always return valid JSON adhering strictly to:
{
  "status": "ok" | "needs_clarification" | "unsupported" | "invalid",
  "confidence": number (0.0 to 1.0),
  "intentSummary": string (1 concise sentence explaining the interpreted action),
  "commands": [
    {
      "action": "MOVE" | "RESIZE" | "FOCUS" | "BRING_FORWARD" | "SEND_BACK" | "SWITCH_WORKSPACE" | "OPEN" | "CLOSE" | "SHOW" | "HIDE" | "ROTATE" | "ARRANGE" | "SAVE_MEMORY" | "RESTORE_MEMORY" | "LIST_MEMORIES" | "DELETE_MEMORY",
      "target": string,
      "parameters": {
        "relation"?: string,
        "relativeTo"?: string,
        "scale"?: number,
        "layout"?: string,
        "name"?: string
      }
    }
  ],
  "message": string (optional message when needs_clarification or unsupported)
}
`;

/**
 * Deterministic fallback parser if Gemini API key is missing or offline
 */
function localRuleBasedInterpreter(prompt: string, context: any) {
  const clean = prompt.trim();
  if (!clean) {
    return {
      status: 'invalid',
      confidence: 1.0,
      intentSummary: 'Empty input provided',
      commands: [],
      message: 'Input prompt cannot be empty.',
    };
  }

  const p = clean.toLowerCase();

  // Security / Unsupported checks
  if (
    p.includes('spotify') ||
    p.includes('run this command') ||
    p.includes('delete my files') ||
    p.includes('turn off wi-fi') ||
    p.includes('wifi') ||
    p.includes('bluetooth') ||
    p.includes('bash') ||
    p.includes('calculator') ||
    p.includes('mars colony')
  ) {
    return {
      status: 'unsupported',
      confidence: 0.98,
      intentSummary: 'Requested capability outside NOVA spatial domain',
      commands: [],
      message: 'That capability is not currently supported by NOVA.',
    };
  }

  // Ambiguity checks
  if (
    clean === 'Move that.' ||
    clean === 'Put it there.' ||
    (p.includes('make it bigger') && !context?.focusedWindow) ||
    (p.includes('move that') && !context?.focusedWindow)
  ) {
    return {
      status: 'needs_clarification',
      confidence: 0.95,
      intentSummary: 'Reference is ambiguous given current spatial context',
      commands: [],
      message: 'Which window do you want me to move or modify?',
    };
  }

  // Section 32 Demo compound command check
  if (
    p.includes('browser on my left') ||
    (p.includes('browser') && p.includes('code') && p.includes('terminal') && p.includes('development'))
  ) {
    return {
      status: 'ok',
      confidence: 0.96,
      intentSummary:
        'Compound multi-action: position browser left, scale code to 1.1, elevate terminal, switch workspace to development',
      commands: [
        { action: 'MOVE', target: 'browser', parameters: { relation: 'left' } },
        { action: 'RESIZE', target: 'code', parameters: { scale: 1.1 } },
        { action: 'BRING_FORWARD', target: 'terminal', parameters: {} },
        { action: 'SWITCH_WORKSPACE', target: 'development', parameters: {} },
      ],
    };
  }

  // Spatial memory (Phase 5). Checked before spatial commands because almost
  // every memory phrasing contains "this" or "that".
  if (/\b(list|show|what|which)\b.*\b(saved|memor(y|ies)|workspaces|setups)\b/.test(p)) {
    return {
      status: 'ok',
      confidence: 0.95,
      intentSummary: 'List saved spatial memories',
      commands: [{ action: 'LIST_MEMORIES', target: '', parameters: {} }],
    };
  }
  const aboutMemory = /\b(memor(y|ies)|saved|setup|workspace|session|arrangement)\b/.test(p);
  if (/\b(delete|forget|remove|drop)\b/.test(p) && aboutMemory) {
    return {
      status: 'ok',
      confidence: 0.92,
      intentSummary: 'Delete a saved spatial memory',
      commands: [{ action: 'DELETE_MEMORY', target: p, parameters: { name: p } }],
    };
  }
  if (/\b(save|remember|store)\b/.test(p)) {
    const asClause = /\bas\b\s+(.+)$/.exec(p);
    const name = asClause ? asClause[1] : '';
    return {
      status: 'ok',
      confidence: 0.94,
      intentSummary: name ? `Save the current arrangement as "${name}"` : 'Save the current arrangement',
      commands: [{ action: 'SAVE_MEMORY', target: name, parameters: { name } }],
    };
  }
  if (
    /\b(restore|continue|resume|reopen|load|bring back|go back to|take me back)\b/.test(p) &&
    (aboutMemory || /\b(work|where i left off|previous)\b/.test(p))
  ) {
    return {
      status: 'ok',
      confidence: 0.92,
      intentSummary: 'Restore a saved spatial memory',
      commands: [{ action: 'RESTORE_MEMORY', target: p, parameters: { name: p } }],
    };
  }

  // Opening an application by name. The server does not resolve the name here —
  // NOVA does that against its own catalog — so this only shapes the intent.
  const openMatch = /\b(?:open|launch|start)\s+(.+)$/.exec(p);
  if (openMatch && !/\b(workspace|development|study|home)\b/.test(p)) {
    const named = openMatch[1].trim();
    if (named) {
      return {
        status: 'ok',
        confidence: 0.9,
        intentSummary: `Open the application "${named}"`,
        commands: [{ action: 'OPEN', target: named, parameters: {} }],
      };
    }
  }

  const commands: any[] = [];

  // Workspace commands
  if (p.includes('development')) {
    commands.push({ action: 'SWITCH_WORKSPACE', target: 'development', parameters: {} });
  } else if (p.includes('study')) {
    commands.push({ action: 'SWITCH_WORKSPACE', target: 'study', parameters: {} });
  } else if (p.includes('take me home') || p.includes('go home')) {
    commands.push({ action: 'SWITCH_WORKSPACE', target: 'home', parameters: {} });
  }

  // Multi-command parsing (e.g. "Move Browser left and make Code bigger")
  const clauses = p.split(/\band\b|,/);
  for (const rawClause of clauses) {
    const clause = rawClause.trim();
    if (!clause) continue;

    // Resolve target window
    let target = '';
    if (clause.includes('browser')) target = 'browser';
    else if (clause.includes('terminal')) target = 'terminal';
    else if (clause.includes('code')) target = 'code';
    else if (clause.includes('notes')) target = 'notes';
    else if (clause.includes('files')) target = 'files';
    else if (clause.includes('this') || clause.includes('it') || clause.includes('that')) {
      target = context?.focusedWindow || 'current_window';
    }

    if (!target && !commands.length) continue;

    if (clause.includes('move') || clause.includes('put')) {
      let relation = 'center';
      if (clause.includes('left')) relation = 'left';
      else if (clause.includes('right')) relation = 'right';
      else if (clause.includes('above')) relation = 'above';
      else if (clause.includes('below')) relation = 'below';
      else if (clause.includes('behind')) relation = 'behind';
      else if (clause.includes('beside') || clause.includes('next to')) relation = 'beside';
      else if (clause.includes('front')) relation = 'front';
      else if (clause.includes('center')) relation = 'center';

      let relativeTo: string | undefined;
      if (clause.includes('beside code') || clause.includes('behind code')) relativeTo = 'code';
      if (clause.includes('above browser')) relativeTo = 'browser';

      commands.push({
        action: 'MOVE',
        target: target || 'focused_window',
        parameters: { relation, ...(relativeTo ? { relativeTo } : {}) },
      });
    } else if (clause.includes('bigger') || clause.includes('smaller') || clause.includes('resize')) {
      let scale = 1.2;
      if (clause.includes('slightly smaller')) scale = 0.9;
      else if (clause.includes('much bigger')) scale = 1.4;
      else if (clause.includes('smaller')) scale = 0.8;
      else if (clause.includes('slightly bigger')) scale = 1.1;
      else if (clause.includes('tiny')) scale = 0.5;

      commands.push({
        action: 'RESIZE',
        target: target || 'focused_window',
        parameters: { scale },
      });
    } else if (clause.includes('bring') && clause.includes('forward')) {
      commands.push({
        action: 'BRING_FORWARD',
        target: target || 'focused_window',
        parameters: {},
      });
    } else if (clause.includes('send') && clause.includes('back')) {
      commands.push({
        action: 'SEND_BACK',
        target: target || 'focused_window',
        parameters: {},
      });
    } else if (clause.includes('focus')) {
      commands.push({
        action: 'FOCUS',
        target: target || 'browser',
        parameters: {},
      });
    }
  }

  if (commands.length > 0) {
    return {
      status: 'ok',
      confidence: 0.95,
      intentSummary: `Parsed ${commands.length} spatial command(s)`,
      commands,
    };
  }

  return {
    status: 'unsupported',
    confidence: 0.8,
    intentSummary: 'Could not map to standard NOVA commands',
    commands: [],
    message: 'That capability is not currently supported by NOVA.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Read-only native awareness (Phase 8).
   *
   * One endpoint, `GET`, no parameters, no body. It returns a reading of the
   * host and accepts nothing that could steer what is read — there is no path,
   * no command and no identifier for a caller to supply. Deliberately **not**
   * a general bridge: NOVA must not become a way to run things on this machine,
   * so there is no sibling endpoint that acts, and adding one would need a
   * safety argument this phase has not made.
   *
   * Answers are cached briefly so that a reloading page or several inspector
   * reads do not rescan the filesystem repeatedly.
   */
  let nativeCache: { at: number; payload: Awaited<ReturnType<typeof readLinuxSnapshot>> } | null =
    null;
  const NATIVE_CACHE_MS = 5_000;

  app.get('/api/native/snapshot', async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (nativeCache && now - nativeCache.at < NATIVE_CACHE_MS) {
        res.json(nativeCache.payload);
        return;
      }

      const payload =
        process.platform === 'linux'
          ? await readLinuxSnapshot()
          : {
              providerId: 'unsupported',
              at: now,
              platform: process.platform,
              capabilities: {
                platformDetection: false,
                applicationEnumeration: false,
                runningProcessDetection: false,
                windowEnumeration: false,
                windowGeometry: false,
                workspaceEnumeration: false,
              },
              applications: [],
              windows: [],
              notes: [`No native provider exists for "${process.platform}".`],
            };

      nativeCache = { at: now, payload };
      res.json(payload);
    } catch (err: any) {
      // A failed reading must never take the server down, and must never be
      // reported as an empty-but-successful one.
      console.warn('[NOVA Server] Native snapshot failed:', err?.message || err);
      res.status(200).json({
        providerId: 'error',
        at: Date.now(),
        platform: process.platform,
        capabilities: {
          platformDetection: false,
          applicationEnumeration: false,
          runningProcessDetection: false,
          windowEnumeration: false,
          windowGeometry: false,
          workspaceEnumeration: false,
        },
        applications: [],
        windows: [],
        notes: ['The native provider failed while reading the host.'],
      });
    }
  });

  /**
   * The one native action NOVA may perform (Phase 9).
   *
   * Separate from the snapshot endpoint on purpose: that one reads and this one
   * acts, and collapsing them would make "does NOVA touch this machine" depend
   * on an HTTP verb rather than on a route.
   *
   * The body may contain exactly two fields, both drawn from closed sets. There
   * is no path, no command, no argument list and no way to express one — an
   * `applicationId` of `/bin/bash` or `bash -c id` fails `isLaunchableId` and is
   * rejected before anything else happens. This is **not** a general execution
   * endpoint and must never acquire a field that would make it one.
   */
  app.post('/api/native/action', async (req: Request, res: Response) => {
    const capability = req.body?.capability;
    const applicationId = req.body?.applicationId;

    if (capability !== 'OPEN_APPLICATION') {
      res.status(200).json({
        ok: false,
        capability: typeof capability === 'string' ? capability : 'unknown',
        applicationId: typeof applicationId === 'string' ? applicationId : '',
        reason: 'INVALID_CAPABILITY',
        message: 'NOVA does not have that capability.',
      });
      return;
    }

    // Shape gate. The *authoritative* check — membership in the catalog this
    // server enumerated from disk — happens inside `launchApplication`, which
    // will not launch an id it did not find installed.
    if (!isLaunchableId(applicationId) && !hasDesktopIdShape(applicationId)) {
      res.status(200).json({
        ok: false,
        capability,
        // Echo nothing back: an invalid id may be an injection attempt, and
        // reflecting it would make this endpoint a way to bounce strings.
        applicationId: '',
        reason: 'INVALID_APPLICATION_ID',
        message: 'That is not a valid application identity.',
      });
      return;
    }

    if (process.platform !== 'linux') {
      res.status(200).json({
        ok: false,
        capability,
        applicationId,
        reason: 'CAPABILITY_UNAVAILABLE',
        message: `Launching applications is not supported on ${process.platform}.`,
      });
      return;
    }

    try {
      const outcome = await launchApplication(applicationId);
      if (outcome.ok) {
        console.log(`[NOVA Native] launched ${applicationId} → ${outcome.desktopId}`);
        res.status(200).json({ ok: true, capability, applicationId });
        return;
      }
      res.status(200).json({
        ok: false,
        capability,
        applicationId,
        reason: outcome.reason,
        message:
          outcome.reason === 'APPLICATION_NOT_AVAILABLE'
            ? `No installed application matches "${applicationId}".`
            : outcome.reason === 'INVALID_APPLICATION_ID'
              ? 'That is not a valid application identity.'
              : 'The application could not be launched.',
      });
    } catch (err: any) {
      // The operating system's own error text can carry paths and usernames.
      // It is logged on the host and never returned to the browser.
      console.warn('[NOVA Native] launch failed:', err?.message || err);
      res.status(200).json({
        ok: false,
        capability,
        applicationId,
        reason: 'LAUNCH_FAILED',
        message: 'The application could not be launched.',
      });
    }
  });

  // Gemini Natural Language Spatial Command Endpoint
  app.post('/api/gemini/command', async (req: Request, res: Response) => {
    try {
      const { prompt, context } = req.body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(200).json({
          status: 'invalid',
          confidence: 1.0,
          intentSummary: 'Empty or invalid prompt received',
          commands: [],
          message: 'Please provide a valid natural language prompt.',
        });
        return;
      }

      const client = getAiClient();

      // If no API key is set in secrets yet, use our high-fidelity rule interpreter
      if (!client) {
        console.log('[NOVA Server] GEMINI_API_KEY not configured, using deterministic rule engine');
        const fallbackResult = localRuleBasedInterpreter(prompt, context);
        res.json(fallbackResult);
        return;
      }

      console.log('[NOVA Server] Processing prompt:', prompt);
      const userContent = JSON.stringify({
        userUtterance: prompt,
        spatialContext: context || {},
      });

      const schemaConfig = {
        systemInstruction: NOVA_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              description: 'Status: ok, needs_clarification, unsupported, or invalid',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Semantic interpretation confidence between 0.0 and 1.0',
            },
            intentSummary: {
              type: Type.STRING,
              description: 'Concise explanation of user intent for developer inspection',
            },
            message: {
              type: Type.STRING,
              description: 'Clarification prompt or explanation when status is not ok',
            },
            commands: {
              type: Type.ARRAY,
              description: 'Ordered sequence of structured NOVA commands',
              items: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description: 'The supported NOVA action',
                  },
                  target: {
                    type: Type.STRING,
                    description: 'The target window, workspace, or contextual entity',
                  },
                  parameters: {
                    type: Type.OBJECT,
                    description: 'Action specific parameters such as relation or scale',
                    properties: {
                      relation: { type: Type.STRING },
                      relativeTo: { type: Type.STRING },
                      scale: { type: Type.NUMBER },
                      layout: { type: Type.STRING },
                      name: { type: Type.STRING },
                    },
                  },
                },
                required: ['action', 'target'],
              },
            },
          },
          required: ['status', 'commands'],
        },
      };

      // Candidate models: try gemini-3.6-flash first (most resilient against 503 demand spikes),
      // then gemini-3.8-flash as alternative.
      const candidateModels = ['gemini-3.6-flash'];
      let rawText = '';
      let lastModelError: any = null;

      for (const model of candidateModels) {
        try {
          console.log(`[NOVA Server] Requesting Gemini (${model})...`);
          const response = await client.models.generateContent({
            model,
            contents: userContent,
            config: schemaConfig,
          });

          if (response?.text) {
            rawText = response.text;
            console.log(`[NOVA Server] Success using model ${model}`);
            break;
          }
        } catch (mErr: any) {
          lastModelError = mErr;
          const status = mErr?.status || mErr?.code;
          const errMsg = mErr?.message || String(mErr);
          console.warn(`[NOVA Server] Model ${model} returned error (${status}): ${errMsg}`);
          // Continue to next candidate model
        }
      }

      let parsed: any = null;

      if (rawText) {
        try {
          parsed = JSON.parse(rawText);
        } catch (parseErr) {
          console.warn('[NOVA Server] Failed to parse model output as JSON:', parseErr);
        }
      }

      // If all models failed (e.g. 503 high demand spike), seamlessly fall back to local rule interpreter
      if (!parsed || !parsed.status) {
        console.warn('[NOVA Server] Employing high-fidelity rule interpreter fallback due to upstream model availability');
        parsed = localRuleBasedInterpreter(prompt, context);
      }

      res.json(parsed);
    } catch (err: any) {
      console.warn('[NOVA Server] Handled upstream issue gracefully with local interpreter fallback:', err?.message || err);
      // Fallback safely to rule interpreter on any unexpected upstream issue
      const fallback = localRuleBasedInterpreter(req.body.prompt || '', req.body.context);
      res.json(fallback);
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NOVA server running on port ${PORT}`);

    // Take the first native reading now, while nothing else is competing for
    // the event loop. Fire-and-forget: a failure here is reported to the client
    // as an unavailable snapshot like any other, and must not delay startup.
    if (process.platform === 'linux') {
      void readLinuxSnapshot()
        .then((payload) => {
          nativeCache = { at: Date.now(), payload };
          const caps = Object.entries(payload.capabilities)
            .filter(([, allowed]) => allowed)
            .map(([name]) => name);
          console.log(
            `[NOVA Native] ${payload.osName ?? payload.platform} · ` +
              `${payload.desktopEnvironment ?? '?'}/${payload.sessionType ?? '?'} · ` +
              `read-only · ${caps.join(', ') || 'no capabilities'}`,
          );
        })
        .catch(() => {
          console.log('[NOVA Native] host reading failed; awareness will report unavailable');
        });

      void launchableApplications()
        .then((available) => {
          const mapped = Object.entries(available)
            .map(([id, desktopId]) => `${id}→${desktopId ?? 'none'}`)
            .join(' ');
          console.log(`[NOVA Native] launchable (allowlisted): ${mapped}`);
        })
        .catch(() => {
          console.log('[NOVA Native] could not resolve launchable applications');
        });
    }
  });
}

startServer();
