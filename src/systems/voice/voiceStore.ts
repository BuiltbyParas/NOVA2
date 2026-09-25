import { create } from 'zustand';
import type { MicPermission, VoiceError, VoiceState } from '../../types/voice';

/**
 * What NOVA is currently hearing.
 *
 * Separate from `spatialStore` for the same reason memory is: this is the state
 * of an input device, not the state of the environment. Nothing in here is
 * persisted and nothing in here is audio — the fields hold recognised text for
 * as long as it takes to act on it, and the transcript is cleared as soon as a
 * new session begins.
 */
interface VoiceStoreState {
  supported: boolean;
  state: VoiceState;
  /** Live, partial, and never executed — shown so listening looks like listening. */
  interimTranscript: string;
  /** The last finished utterance, kept for feedback after it has been acted on. */
  transcript: string;
  error: VoiceError | null;
  /** The last utterance that actually entered the command pipeline. */
  lastCommand: string | null;
  permission: MicPermission;

  setSupported: (supported: boolean) => void;
  setState: (state: VoiceState) => void;
  setInterim: (text: string) => void;
  setTranscript: (text: string) => void;
  setError: (error: VoiceError | null) => void;
  setLastCommand: (text: string | null) => void;
  setPermission: (permission: MicPermission) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  supported: false,
  state: 'unsupported',
  interimTranscript: '',
  transcript: '',
  error: null,
  lastCommand: null,
  permission: 'unknown',

  setSupported: (supported) =>
    set((current) => ({
      supported,
      // Only move off `unsupported` on discovery; never overwrite a live session.
      state: supported ? (current.state === 'unsupported' ? 'idle' : current.state) : 'unsupported',
    })),

  setState: (state) => set({ state }),
  setInterim: (interimTranscript) => set({ interimTranscript }),
  setTranscript: (transcript) => set({ transcript }),
  setError: (error) => set({ error }),
  setLastCommand: (lastCommand) => set({ lastCommand }),
  setPermission: (permission) => set({ permission }),

  reset: () =>
    set((current) => ({
      state: current.supported ? 'idle' : 'unsupported',
      interimTranscript: '',
      transcript: '',
      error: null,
    })),
}));

/** Non-reactive read, for the input layer and for tests. */
export const voice = () => useVoiceStore.getState();
