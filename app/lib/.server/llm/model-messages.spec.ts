import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { dropReplayedReasoning, prepareModelMessages } from './model-messages';

describe('prepareModelMessages', () => {
  it('preserves consecutive completed tool calls when the recent context has no text messages', async () => {
    const messages: UIMessage[] = Array.from({ length: 3 }, (_, index) => ({
      id: `assistant-${index}`,
      role: 'assistant',

      // Tool-only assistant replies have empty legacy content in persisted chats.
      content: '',
      parts: [
        {
          type: 'tool-project_list_paths',
          toolCallId: `call-${index}`,
          state: 'output-available',
          input: {},
          output: { entries: [{ path: 'package.json', type: 'file' }] },
        },
      ],
    }));

    const result = await prepareModelMessages(messages);

    expect(result.map((message) => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
    expect(result[0].content).toEqual([
      expect.objectContaining({ type: 'tool-call', toolCallId: 'call-0', toolName: 'project_list_paths' }),
    ]);
    expect(result[5].content).toEqual([expect.objectContaining({ type: 'tool-result', toolCallId: 'call-2' })]);
  });

  it('preserves a user request while dropping empty assistant messages', async () => {
    const result = await prepareModelMessages([
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Start the preview' }] },
      { id: 'empty', role: 'assistant', parts: [] },
    ]);

    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Start the preview' }] }]);
  });

  it('drops interrupted tool calls so a later user request does not require missing tool results', async () => {
    const result = await prepareModelMessages([
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Start the preview' }] },
      {
        id: 'interrupted',
        role: 'assistant',
        parts: [
          {
            type: 'tool-project_run_command',
            toolCallId: 'unfinished',
            state: 'input-available',
            input: { command: 'npm run dev', purpose: 'run' },
          },
        ],
      },
      { id: 'retry', role: 'user', parts: [{ type: 'text', text: 'Continue the preview' }] },
    ]);

    expect(result.map((message) => message.role)).toEqual(['user', 'user']);
    expect(JSON.stringify(result)).not.toContain('unfinished');
  });

  it('drops replayed reasoning so signed thinking blocks are not sent with a different system prompt', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'build an app' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'thinking', providerMetadata: { anthropic: { signature: 'sig' } } },
          { type: 'text', text: 'done' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'next' }] },
    ];

    const result = await prepareModelMessages(messages);

    expect(JSON.stringify(result)).not.toContain('"reasoning"');
    expect(result[1].content).toEqual([expect.objectContaining({ type: 'text', text: 'done' })]);
  });
});

describe('dropReplayedReasoning', () => {
  it('removes reasoning from every assistant message of each step prompt, keeping tool calls', async () => {
    const params = {
      prompt: [
        { role: 'system', content: 'step 2 instructions' },
        { role: 'user', content: [{ type: 'text', text: 'build an app' }] },
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: '', providerOptions: { anthropic: { signature: 'sig' } } },
            { type: 'tool-call', toolCallId: 'c1', toolName: 'agent_plan', input: {} },
          ],
        },
        {
          role: 'tool',
          content: [
            { type: 'tool-result', toolCallId: 'c1', toolName: 'agent_plan', output: { type: 'text', value: 'ok' } },
          ],
        },
      ],
    };

    const result = await dropReplayedReasoning.transformParams!({ params, type: 'stream', model: {} } as any);

    expect(JSON.stringify(result.prompt)).not.toContain('"reasoning"');
    expect(result.prompt[2].content).toEqual([expect.objectContaining({ type: 'tool-call', toolCallId: 'c1' })]);
    expect(result.prompt[0]).toEqual(params.prompt[0]);
  });
});
