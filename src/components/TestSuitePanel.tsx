import React, { useState } from 'react';
import type { TestCase, NovaCommandResponse } from '../types/nova';
import { NOVA_TEST_SUITE } from '../services/testSuiteData';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Sparkles,
  Filter,
} from 'lucide-react';

interface TestSuitePanelProps {
  onRunSingleTest: (test: TestCase) => Promise<NovaCommandResponse>;
  activeTestId: string | null;
}

export const TestSuitePanel: React.FC<TestSuitePanelProps> = ({
  onRunSingleTest,
  activeTestId,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [testResults, setTestResults] = useState<
    Record<
      string,
      {
        passed: boolean;
        actualStatus: string;
        actualActions?: string[];
        response: NovaCommandResponse;
      }
    >
  >({});
  const [isRunningAll, setIsRunningAll] = useState(false);

  const categories = [
    'all',
    'Basic spatial commands',
    'Resize',
    'Focus',
    'Context',
    'Relative relationships',
    'Multi-command',
    'Workspace',
    'Ambiguous',
    'Unsupported',
    'Edge cases',
  ];

  const filteredTests =
    selectedCategory === 'all'
      ? NOVA_TEST_SUITE
      : NOVA_TEST_SUITE.filter((t) => t.category === selectedCategory);

  const runTest = async (test: TestCase) => {
    try {
      const res = await onRunSingleTest(test);
      const passedStatus = res.status === test.expectedStatus;
      let passedActions = true;
      if (test.expectedActions && test.expectedActions.length > 0) {
        const actualActionNames = res.commands.map((c) => c.action);
        passedActions = test.expectedActions.every((ea) =>
          actualActionNames.includes(ea)
        );
      }
      const isPassed = passedStatus && passedActions;

      setTestResults((prev) => ({
        ...prev,
        [test.id]: {
          passed: isPassed,
          actualStatus: res.status,
          actualActions: res.commands.map((c) => c.action),
          response: res,
        },
      }));
      return isPassed;
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [test.id]: {
          passed: false,
          actualStatus: 'error',
          response: { status: 'invalid', commands: [], message: 'Execution error' },
        },
      }));
      return false;
    }
  };

  const handleRunAll = async () => {
    setIsRunningAll(true);
    for (const test of filteredTests) {
      await runTest(test);
    }
    setIsRunningAll(false);
  };

  const totalRun = Object.keys(testResults).length;
  const passedCount = Object.values(testResults).filter((r) => r.passed).length;

  return (
    <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Phase 3 Test Suite (Sections 25 & 26)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalRun > 0 && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              Passed: <strong className="text-emerald-400">{passedCount}</strong> / {totalRun}
            </span>
          )}
          <button
            onClick={handleRunAll}
            disabled={isRunningAll}
            className="text-xs flex items-center gap-1.5 px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {isRunningAll ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRunningAll ? 'Running...' : 'Run All Filtered'}</span>
          </button>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
        <Filter className="w-3 h-3 text-slate-500 shrink-0" />
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat === 'all' ? 'All (26)' : cat}
          </button>
        ))}
      </div>

      {/* Test List */}
      <div className="p-3 space-y-2 overflow-y-auto flex-1 text-xs">
        {filteredTests.map((test) => {
          const result = testResults[test.id];
          const isActive = activeTestId === test.id;

          return (
            <div
              key={test.id}
              className={`p-2.5 rounded-lg border transition-all ${
                isActive
                  ? 'bg-slate-900 border-sky-500/70 shadow-md'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {test.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      expects: [{test.expectedStatus}]
                    </span>
                  </div>
                  <div className="font-mono text-xs font-semibold text-slate-100">
                    &ldquo;{test.prompt}&rdquo;
                  </div>
                  <div className="text-[11px] text-slate-400">{test.description}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {result && (
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      {result.passed ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>PASS</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-400">
                          <XCircle className="w-4 h-4" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => runTest(test)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Run this test case"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
